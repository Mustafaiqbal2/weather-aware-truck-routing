import { useEffect } from 'react'
import { type Scenario, useTrip } from '@/store/trip'
import type { PlaceInput, RoutesRequest } from './api/client'

/**
 * Shareable links: the trip lives in the URL query (?o=…&d=…&dep=…&load=…&every=…),
 * so a planned trip can be bookmarked or sent to someone and opens with the same plan.
 */

const encodePlace = (p: PlaceInput) => `${p.lat.toFixed(5)},${p.lon.toFixed(5)},${p.label}`

function decodePlace(value: string | null): PlaceInput | null {
  if (!value) return null
  const [lat, lon, ...label] = value.split(',')
  const place = { lat: Number(lat), lon: Number(lon), label: label.join(',').trim() }
  return Number.isFinite(place.lat) && Number.isFinite(place.lon) && place.label ? place : null
}

export function toSearch(request: RoutesRequest, scenario: Scenario): string {
  const params = new URLSearchParams({
    o: encodePlace(request.origin),
    d: encodePlace(request.destination),
    dep: request.departure,
    load: String(request.load_lb),
    every: String(request.interval_mi ?? 25),
  })
  if (scenario === 'storm') params.set('storm', '1')
  return params.toString()
}

export function fromSearch(search: string): { request: RoutesRequest; scenario: Scenario } | null {
  const params = new URLSearchParams(search)
  const origin = decodePlace(params.get('o'))
  const destination = decodePlace(params.get('d'))
  const load = Number(params.get('load'))
  const every = Number(params.get('every') ?? 25)
  const departure = params.get('dep') ?? 'now'
  if (!origin || !destination || !Number.isFinite(load) || load < 0) return null
  if (departure !== 'now' && !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(departure)) return null
  return {
    request: {
      origin,
      destination,
      departure,
      load_lb: load,
      interval_mi: ([10, 25, 50].includes(every) ? every : 25) as 10 | 25 | 50,
    },
    scenario: params.get('storm') === '1' ? 'storm' : 'live',
  }
}

/** Load a trip from the URL on start, and keep the URL in step with the current trip. */
export function useUrlState(): void {
  useEffect(() => {
    const initial = fromSearch(window.location.search)
    if (initial) {
      useTrip.getState().setScenario(initial.scenario)
      useTrip.getState().submit(initial.request)
    }
    return useTrip.subscribe((state, prev) => {
      if (!state.request) return
      if (state.request === prev.request && state.scenario === prev.scenario) return
      window.history.replaceState(null, '', `?${toSearch(state.request, state.scenario)}`)
    })
  }, [])
}
