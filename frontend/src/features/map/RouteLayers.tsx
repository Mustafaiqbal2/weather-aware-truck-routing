import type { FeatureCollection, Point } from 'geojson'
import { memo, useMemo } from 'react'
import { Layer, Source } from 'react-map-gl/maplibre'
import type { RouteView } from '@/lib/queries'
import { CHECKPOINT_LAYER, CHECKPOINT_RING_LAYER } from './scene'

const LINE_LAYOUT = { 'line-cap': 'round', 'line-join': 'round' } as const
const TRANSPARENT_GRADIENT = [
  'interpolate',
  ['linear'],
  ['line-progress'],
  0,
  'rgba(0,0,0,0)',
  1,
  'rgba(0,0,0,0)',
] as const

/**
 * Declares the route layers once per plan. Their animated paint (gradients, widths,
 * opacities) is owned by RouteScene, so these props stay constant between renders.
 */
export const RouteLayers = memo(function RouteLayers({
  routes,
  beforeId,
}: {
  routes: RouteView[]
  beforeId: string | undefined
}) {
  return (
    <>
      {routes.map((route) => (
        <RouteSource key={route.id} route={route} beforeId={beforeId} />
      ))}
    </>
  )
})

function RouteSource({ route, beforeId }: { route: RouteView; beforeId: string | undefined }) {
  const data = useMemo(
    () => ({
      type: 'Feature' as const,
      properties: { routeId: route.id },
      geometry: { type: 'LineString' as const, coordinates: route.geometry },
    }),
    [route.id, route.geometry],
  )
  const id = route.id
  return (
    <Source id={`route-${id}`} type="geojson" data={data} lineMetrics>
      <Layer
        id={`route-glow-${id}`}
        type="line"
        beforeId={beforeId}
        layout={LINE_LAYOUT}
        paint={{ 'line-color': '#f5a524', 'line-width': 16, 'line-blur': 12, 'line-opacity': 0 }}
      />
      <Layer
        id={`route-casing-${id}`}
        type="line"
        beforeId={beforeId}
        layout={LINE_LAYOUT}
        paint={{ 'line-color': '#05070a', 'line-width': 8, 'line-opacity': 0 }}
      />
      <Layer
        id={`route-base-${id}`}
        type="line"
        beforeId={beforeId}
        layout={LINE_LAYOUT}
        paint={{ 'line-width': 4, 'line-gradient': TRANSPARENT_GRADIENT as never }}
      />
      <Layer
        id={`route-risk-${id}`}
        type="line"
        beforeId={beforeId}
        layout={LINE_LAYOUT}
        paint={{ 'line-width': 4, 'line-gradient': TRANSPARENT_GRADIENT as never }}
      />
      {/* Invisible, wide line that makes the route easy to hover and click. */}
      <Layer
        id={`route-hit-${id}`}
        type="line"
        layout={LINE_LAYOUT}
        paint={{ 'line-color': '#000', 'line-width': 22, 'line-opacity': 0 }}
      />
    </Source>
  )
}

export interface CheckpointFeatureProps {
  routeId: string
  index: number
  level: string
  p: number
}

export const CheckpointLayers = memo(function CheckpointLayers({
  data,
  selected,
}: {
  data: FeatureCollection<Point, CheckpointFeatureProps>
  selected: { routeId: string; index: number } | null
}) {
  const ringFilter = useMemo(
    () =>
      selected
        ? ([
            'all',
            ['==', ['get', 'routeId'], selected.routeId],
            ['==', ['get', 'index'], selected.index],
          ] as const)
        : (['==', ['get', 'index'], -1] as const),
    [selected],
  )
  return (
    <Source id="checkpoints" type="geojson" data={data}>
      <Layer
        id={CHECKPOINT_LAYER}
        type="circle"
        paint={{
          'circle-color': [
            'match',
            ['get', 'level'],
            'low',
            '#3fb8af',
            'moderate',
            '#f2d13d',
            'high',
            '#ff8a3d',
            'severe',
            '#e5484d',
            'no_travel',
            '#c04cf5',
            'unknown',
            '#5b6474',
            '#c3cad6',
          ],
          'circle-radius': 4,
          'circle-stroke-color': '#07090c',
          'circle-stroke-width': 1.5,
          'circle-opacity': 0,
          'circle-stroke-opacity': 0,
        }}
      />
      <Layer
        id={CHECKPOINT_RING_LAYER}
        type="circle"
        filter={ringFilter as never}
        paint={{
          'circle-color': 'rgba(0,0,0,0)',
          'circle-radius': ['interpolate', ['linear'], ['zoom'], 3, 8, 9, 13],
          'circle-stroke-color': '#ffc35c',
          'circle-stroke-width': 2,
        }}
      />
    </Source>
  )
})
