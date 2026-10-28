import { useEffect, useRef } from 'react'
import { useMap } from 'react-map-gl/maplibre'
import type { RoutesResponse } from '@/lib/api/client'
import { gsap, prefersReducedMotion } from '@/lib/motion'
import { useHeatmapData } from '@/lib/queries'
import { useTimeline } from '@/store/timeline'
import { useTrip } from '@/store/trip'
import { decodeHeatmap } from './decode'
import { HeatmapLayer } from './HeatmapLayer'

/** Adds the WebGL heatmap layer to the map and feeds it data, variable, time and opacity. */
export function HeatmapHost({
  plan,
  beforeId,
}: {
  plan: RoutesResponse | undefined
  beforeId: string | undefined
}) {
  const { current: mapRef } = useMap()
  const layerRef = useRef<HeatmapLayer | null>(null)
  const fade = useRef({ opacity: 0 })
  const heat = useHeatmapData(plan)
  const variable = useTrip((s) => s.heatVariable)
  const visible = useTrip((s) => s.heatVisible)

  useEffect(() => {
    const map = mapRef?.getMap()
    if (!map) return
    const layer = new HeatmapLayer()
    layerRef.current = layer
    map.addLayer(layer, beforeId && map.getLayer(beforeId) ? beforeId : undefined)
    layer.setHour(useTimeline.getState().hour)
    const unsubscribe = useTimeline.subscribe((s) => layer.setHour(s.hour))
    return () => {
      unsubscribe()
      if (map.getLayer(layer.id)) map.removeLayer(layer.id)
      layerRef.current = null
    }
  }, [mapRef, beforeId])

  useEffect(() => {
    layerRef.current?.setData(heat.data ? decodeHeatmap(heat.data) : null)
  }, [heat.data])

  useEffect(() => {
    layerRef.current?.setVariable(variable)
  }, [variable])

  useEffect(() => {
    const layer = layerRef.current
    if (!layer) return
    const target = visible && heat.data ? 1 : 0
    const tween = gsap.to(fade.current, {
      opacity: target,
      duration: prefersReducedMotion() ? 0 : 0.8,
      ease: 'power2.out',
      onUpdate: () => layer.setOpacity(fade.current.opacity),
    })
    return () => {
      tween.kill()
    }
  }, [visible, heat.data])

  return null
}
