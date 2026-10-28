import { gsap, prefersReducedMotion } from '@/lib/motion'
import { useEffect, useRef } from 'react'
import type { MapRef } from 'react-map-gl/maplibre'
import type { RouteId } from '@/lib/api/client'
import { bounds, type LngLat } from '@/lib/geo'
import type { TripView } from '@/lib/queries'
import type { Level } from '@/lib/risk'
import { useTrip } from '@/store/trip'
import { RouteScene, riskSegments, sceneRoute } from './scene'

export const MAP_PADDING = { top: 72, bottom: 190, left: 72, right: 72 }

/**
 * Drives the map: fits the camera to new routes, animates them drawing on, wipes risk
 * colours in when the assessment arrives, and keeps hover/selection emphasis in sync.
 */
export function useRouteScene(
  mapRef: React.RefObject<MapRef | null>,
  view: TripView | undefined,
  ready: boolean,
) {
  const sceneRef = useRef<RouteScene | null>(null)
  const planKey = view ? `${view.plan.departure}|${view.routes.map((r) => r.id + r.distance_mi).join()}` : ''
  const assessed = view?.recommendation !== undefined
  const selected = useTrip((s) => s.selectedRouteId)
  const hovered = useTrip((s) => s.hoveredRouteId)

  // New plan: build scene, fit camera, draw routes on.
  useEffect(() => {
    const map = mapRef.current?.getMap()
    if (!ready || !map || !view) return
    const scene = new RouteScene(map)
    sceneRef.current = scene
    const routes = view.routes.map((r) =>
      sceneRoute(r.id as RouteId, r.geometry as LngLat[], r.distance_mi, r.checkpoints),
    )
    scene.setRoutes(routes)
    scene.setFocus({ selected: null, hovered: null, recommended: null })

    const reduced = prefersReducedMotion()
    map.fitBounds(bounds(routes.map((r) => r.line)), {
      padding: MAP_PADDING,
      duration: reduced ? 0 : 1300,
      essential: false,
    })

    // Wait one frame so the sources exist before painting.
    const tl = gsap.timeline({ delay: reduced ? 0 : 0.35, onUpdate: () => scene.apply() })
    routes.forEach((route, i) => {
      if (reduced) {
        scene.draw[route.id] = 1
      } else {
        tl.to(scene.draw, { [route.id]: 1, duration: 1.25, ease: 'power2.inOut' }, i * 0.18)
      }
    })
    if (reduced) requestAnimationFrame(() => scene.apply())
    return () => {
      tl.kill()
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps -- planKey identifies the plan
  }, [ready, planKey])

  // Assessment arrived: colour the routes by risk with a staggered wipe.
  useEffect(() => {
    const scene = sceneRef.current
    if (!scene || !view || !assessed) return
    const routes = view.routes.map((r) =>
      sceneRoute(r.id as RouteId, r.geometry as LngLat[], r.distance_mi, r.checkpoints),
    )
    for (const [i, route] of routes.entries()) {
      const levels = route.checkpoints.map(
        (cp) =>
          (view.routes[i]!.assessment?.checkpoints.find((c) => c.index === cp.index)?.risk?.level as
            Level | undefined) ?? null,
      )
      scene.setRisk(route.id, riskSegments(route, levels))
    }
    scene.setFocus({ selected, hovered, recommended: view.recommendation!.route_id as RouteId })
    const reduced = prefersReducedMotion()
    if (reduced) {
      for (const r of routes) scene.wipe[r.id] = 1
      scene.apply()
      return
    }
    const tl = gsap.timeline({ onUpdate: () => scene.apply() })
    routes.forEach((r, i) => {
      tl.to(scene.wipe, { [r.id]: 1, duration: 1.1, ease: 'power3.inOut' }, 0.12 * i)
    })
    return () => {
      tl.progress(1).kill()
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps -- runs once per assessment
  }, [assessed, planKey])

  // Hover / selection emphasis.
  useEffect(() => {
    sceneRef.current?.setFocus({
      selected,
      hovered,
      recommended: (view?.recommendation?.route_id as RouteId | undefined) ?? null,
    })
  }, [selected, hovered, view?.recommendation?.route_id])

  return sceneRef
}
