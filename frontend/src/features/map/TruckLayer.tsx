import type { FeatureCollection, Point } from 'geojson'
import type { GeoJSONSource } from 'maplibre-gl'
import { useEffect, useMemo } from 'react'
import { Layer, Source, useMap } from 'react-map-gl/maplibre'
import type { RouteView } from '@/lib/queries'
import { buildTracks, truckAt } from '@/lib/trucks'
import { useTimeline } from '@/store/timeline'

const EMPTY: FeatureCollection<Point> = { type: 'FeatureCollection', features: [] }

/**
 * "Ghost trucks": where each route's truck would be at the forecast slider's time,
 * coloured by the risk on that stretch. Updated straight from the timeline store, so
 * playing the forecast moves them without re-rendering React.
 */
export function TruckLayer({ routes, startMs }: { routes: RouteView[]; startMs: number }) {
  const { current: mapRef } = useMap()
  const tracks = useMemo(() => buildTracks(routes), [routes])

  useEffect(() => {
    const map = mapRef?.getMap()
    if (!map) return
    const update = (hour: number) => {
      const t = startMs + hour * 3_600_000
      const source = map.getSource('trucks') as GeoJSONSource | undefined
      source?.setData({
        type: 'FeatureCollection',
        features: tracks.map((track) => {
          const truck = truckAt(track, t)
          return {
            type: 'Feature',
            properties: {
              routeId: track.id,
              recommended: track.recommended,
              level: truck.level ?? 'pending',
              driving: truck.state === 'driving',
            },
            geometry: { type: 'Point', coordinates: truck.position },
          }
        }),
      })
    }
    update(useTimeline.getState().hour)
    return useTimeline.subscribe((s) => update(s.hour))
  }, [mapRef, tracks, startMs])

  return (
    <Source id="trucks" type="geojson" data={EMPTY}>
      <Layer
        id="truck-halo"
        type="circle"
        paint={{
          'circle-radius': ['interpolate', ['linear'], ['zoom'], 3, 7, 9, 12],
          'circle-color': '#0b0e13',
          'circle-stroke-width': 2.5,
          'circle-stroke-color': ['case', ['get', 'recommended'], '#f5a524', '#e7eaf0'],
          'circle-opacity': ['case', ['get', 'driving'], 1, 0.6],
          'circle-stroke-opacity': ['case', ['get', 'driving'], 1, 0.6],
        }}
      />
      <Layer
        id="truck-core"
        type="circle"
        paint={{
          'circle-radius': ['interpolate', ['linear'], ['zoom'], 3, 3.2, 9, 6],
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
            '#c3cad6',
          ],
        }}
      />
    </Source>
  )
}
