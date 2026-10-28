import { keepPreviousData, useQuery } from '@tanstack/react-query'
import { useMemo } from 'react'
import { useTrip } from '@/store/trip'
import {
  ApiError,
  api,
  type AssessResponse,
  type AssessedRoute,
  type Recommendation,
  type Route,
  type RoutesResponse,
} from './api/client'
import { decimate, type LngLat } from './geo'

const isRateLimited = (error: unknown) => error instanceof ApiError && error.code === 'rate_limited'

export function usePlan() {
  const request = useTrip((s) => s.request)
  const requestId = useTrip((s) => s.requestId)
  return useQuery({
    queryKey: ['routes', requestId],
    queryFn: ({ signal }) => api.routes(request!, signal),
    enabled: request !== null,
    staleTime: Infinity,
    retry: false,
  })
}

export function useAssessment(plan: RoutesResponse | undefined) {
  const requestId = useTrip((s) => s.requestId)
  const scenario = useTrip((s) => s.scenario)
  return useQuery({
    queryKey: ['assess', requestId, scenario],
    queryFn: ({ signal }) =>
      api.assess(
        {
          load_lb: plan!.load_lb,
          scenario,
          routes: plan!.routes.map((r) => ({
            id: r.id as 'A' | 'B' | 'C',
            label: r.label,
            distance_mi: r.distance_mi,
            duration_s: r.duration_s,
            checkpoints: r.checkpoints.map(({ index, mile, lat, lon, eta }) => ({
              index,
              mile,
              lat,
              lon,
              eta,
            })),
          })),
        },
        signal,
      ),
    enabled: plan !== undefined,
    staleTime: Infinity,
    retry: (count, error) => isRateLimited(error) && count < 2,
    retryDelay: 5_000,
  })
}

export function useHeatmapData(plan: RoutesResponse | undefined) {
  const requestId = useTrip((s) => s.requestId)
  const scenario = useTrip((s) => s.scenario)
  return useQuery({
    queryKey: ['heatmap', requestId, scenario],
    queryFn: ({ signal }) =>
      api.heatmap(
        {
          start: plan!.departure,
          load_lb: plan!.load_lb,
          scenario,
          routes: plan!.routes.map((r) => decimate(r.geometry as LngLat[], 400)),
        },
        signal,
      ),
    enabled: plan !== undefined,
    staleTime: Infinity,
    retry: (count, error) => isRateLimited(error) && count < 2,
    retryDelay: 6_000,
  })
}

export function useGeocode(query: string) {
  const q = query.trim()
  return useQuery({
    queryKey: ['geocode', q.toLowerCase()],
    queryFn: ({ signal }) => api.geocode(q, signal),
    enabled: q.length >= 3,
    staleTime: Infinity,
    placeholderData: keepPreviousData,
    retry: false,
  })
}

/** Name for a point picked on the map. Rounded to ~100 m, like the server's cache. */
export function useReverseGeocode(point: { lat: number; lng: number } | null) {
  const lat = point ? Math.round(point.lat * 1000) / 1000 : 0
  const lon = point ? Math.round(point.lng * 1000) / 1000 : 0
  return useQuery({
    queryKey: ['reverse', lat, lon],
    queryFn: ({ signal }) => api.reverse(lat, lon, signal),
    enabled: point !== null,
    staleTime: Infinity,
    retry: false,
  })
}

export interface RouteView extends Route {
  assessment: AssessedRoute | undefined
  /** 0-based position in the recommendation ranking, once assessed. */
  rank: number | undefined
  recommended: boolean
}

export interface TripView {
  plan: RoutesResponse
  routes: RouteView[]
  recommendation: Recommendation | undefined
  departures: AssessResponse['departures'] | undefined
  scenario: AssessResponse['scenario'] | undefined
}

/** Plan and assessment merged into one view model for the UI. */
export function useTripView(): {
  view: TripView | undefined
  plan: ReturnType<typeof usePlan>
  assessment: ReturnType<typeof useAssessment>
} {
  const plan = usePlan()
  const assessment = useAssessment(plan.data)
  const view = useMemo(() => {
    if (!plan.data) return undefined
    const assessed = assessment.data
    const rec = assessed?.recommendation
    const routes = plan.data.routes.map((route) => {
      const rank = rec?.ranking.indexOf(route.id)
      return {
        ...route,
        assessment: assessed?.routes.find((r) => r.id === route.id),
        rank: rank === undefined || rank < 0 ? undefined : rank,
        recommended: rec?.route_id === route.id,
      }
    })
    return {
      plan: plan.data,
      routes,
      recommendation: rec,
      departures: assessed?.departures,
      scenario: assessed?.scenario,
    }
  }, [plan.data, assessment.data])
  return { view, plan, assessment }
}
