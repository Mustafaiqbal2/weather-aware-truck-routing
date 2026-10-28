import type { FeatureCollection, Point } from 'geojson'
import './maplibreWorker'
import type { MapLayerMouseEvent } from 'maplibre-gl'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { Map as MapGL, type MapRef, NavigationControl } from 'react-map-gl/maplibre'
import { useShallow } from 'zustand/react/shallow'
import { HeatmapHost } from '@/features/heatmap/HeatmapHost'
import type { RouteId } from '@/lib/api/client'
import { prefersReducedMotion } from '@/lib/motion'
import type { TripView } from '@/lib/queries'
import { mapPadding, type Padding, useLayout } from '@/store/layout'
import { useTrip } from '@/store/trip'
import { CheckpointPopup } from './CheckpointPopup'
import { DraftPins, type PickedPoint, PlacePickPopup } from './PlacePicker'
import { type CheckpointFeatureProps, CheckpointLayers, RouteLayers } from './RouteLayers'
import { RouteLabels } from './RouteLabels'
import { TruckLayer } from './TruckLayer'
import { CHECKPOINT_LAYER, ROUTE_IDS, sceneRoute } from './scene'
import { useRouteScene } from './useRouteScene'

const MAP_STYLE = 'https://basemaps.cartocdn.com/gl/dark-matter-gl-style/style.json'
const INITIAL_VIEW = { longitude: -97.5, latitude: 39.2, zoom: 3.6 }
const INTERACTIVE = [CHECKPOINT_LAYER, ...ROUTE_IDS.map((id) => `route-hit-${id}`)]

export function MapView({ view }: { view: TripView | undefined }) {
  const mapRef = useRef<MapRef>(null)
  const [ready, setReady] = useState(false)
  const [labelLayer, setLabelLayer] = useState<string>()
  const [cursor, setCursor] = useState<string>('')
  const [mapError, setMapError] = useState<string | null>(null)
  const selectedCheckpoint = useTrip((s) => s.selectedCheckpoint)
  const hoverRoute = useTrip((s) => s.hoverRoute)
  const selectRoute = useTrip((s) => s.selectRoute)
  const selectCheckpoint = useTrip((s) => s.selectCheckpoint)
  const compact = useLayout((s) => s.compact)
  const padding = useLayout(useShallow(mapPadding))
  const [picked, setPicked] = useState<PickedPoint | null>(null)

  // The visible part of the map changed (the phone sheet moved): pan so whatever was centred
  // stays centred. A pan, not padding: MapLibre adds a map's padding to every later fit.
  // Declared before the route scene so a new plan's camera fit wins over this pan.
  const lastPadding = useRef(padding)
  useEffect(() => {
    const map = mapRef.current?.getMap()
    const prev = lastPadding.current
    lastPadding.current = padding
    if (!ready || !map || prev === padding) return
    const [dx, dy] = [centreShift(prev, padding, 'x'), centreShift(prev, padding, 'y')]
    // Small changes (the dock's measured height) aren't worth interrupting a camera fit.
    if (Math.abs(dx) + Math.abs(dy) < 24 || map.isMoving()) return
    map.panBy([dx, dy], { duration: prefersReducedMotion() ? 0 : 450, essential: false })
  }, [ready, padding])

  useRouteScene(mapRef, view, ready)

  const onLoad = useCallback(() => {
    const map = mapRef.current?.getMap()
    if (!map) return
    // Draw our layers under the basemap's place labels so city names stay readable.
    const firstSymbol = map.getStyle().layers.find((l) => l.type === 'symbol')
    setLabelLayer(firstSymbol?.id)
    setReady(true)
  }, [])

  const checkpoints = useMemo(() => checkpointFeatures(view), [view])

  // Bring a checkpoint chosen in the sidebar into view.
  useEffect(() => {
    if (!selectedCheckpoint || selectedCheckpoint.origin !== 'list' || !view) return
    const cp = view.routes
      .find((r) => r.id === selectedCheckpoint.routeId)
      ?.checkpoints.find((c) => c.index === selectedCheckpoint.index)
    const map = mapRef.current
    if (!cp || !map) return
    map.easeTo({
      center: [cp.lon, cp.lat],
      zoom: Math.max(map.getZoom(), 6.5),
      duration: prefersReducedMotion() ? 0 : 900,
      offset: centreOffset(mapPadding(useLayout.getState())),
    })
  }, [selectedCheckpoint, view])

  const onMouseMove = useCallback(
    (e: MapLayerMouseEvent) => {
      const feature = e.features?.[0]
      if (!feature) {
        setCursor('')
        hoverRoute(null)
        return
      }
      setCursor('pointer')
      const routeId = (feature.properties as { routeId?: RouteId }).routeId ?? null
      hoverRoute(routeId)
    },
    [hoverRoute],
  )

  const onClick = useCallback(
    (e: MapLayerMouseEvent) => {
      // Clicks on route labels and popups also reach the map; they handle themselves.
      const target = e.originalEvent.target
      if (target instanceof Element && target.closest('.maplibregl-marker, .maplibregl-popup')) return
      const feature = e.features?.[0]
      if (!feature) {
        // Empty map: close an open checkpoint first, otherwise offer to drop a pin here.
        if (useTrip.getState().selectedCheckpoint) selectCheckpoint(null)
        else setPicked({ lng: e.lngLat.lng, lat: e.lngLat.lat })
        return
      }
      setPicked(null)
      const props = feature.properties as { routeId: RouteId; index?: number }
      if (feature.layer.id === CHECKPOINT_LAYER && props.index !== undefined) {
        selectCheckpoint({ routeId: props.routeId, index: props.index, origin: 'map' })
      } else {
        selectRoute(props.routeId)
      }
    },
    [selectCheckpoint, selectRoute],
  )

  return (
    <>
      <MapGL
        ref={mapRef}
        initialViewState={INITIAL_VIEW}
        mapStyle={MAP_STYLE}
        onLoad={() => {
          setMapError(null)
          onLoad()
        }}
        onError={(e) => {
          // Tile hiccups after load are transient; a style that never loads is not.
          if (!ready) setMapError(e.error?.message ?? 'The map failed to load.')
        }}
        interactiveLayerIds={ready && view ? INTERACTIVE : []}
        onMouseMove={onMouseMove}
        onMouseLeave={() => {
          setCursor('')
          hoverRoute(null)
        }}
        onClick={onClick}
        cursor={cursor}
        dragRotate={false}
        pitchWithRotate={false}
        touchPitch={false}
        maxPitch={0}
        attributionControl={{ compact: true }}
        style={{ position: 'absolute', inset: 0 }}
      >
        {!compact && <NavigationControl position="top-right" showCompass={false} />}
        {ready && (
          <>
            <HeatmapHost plan={view?.plan} beforeId={labelLayer} />
            {view && <RouteLayers routes={view.routes} beforeId={labelLayer} />}
            {view && (
              <CheckpointLayers
                data={checkpoints}
                selected={
                  selectedCheckpoint
                    ? { routeId: selectedCheckpoint.routeId, index: selectedCheckpoint.index }
                    : null
                }
              />
            )}
            {view?.recommendation && (
              <TruckLayer
                routes={view.routes}
                startMs={Math.floor(Date.parse(view.plan.departure) / 3_600_000) * 3_600_000}
              />
            )}
            {view && <RouteLabels routes={view.routes} />}
            <CheckpointPopup view={view} />
            <DraftPins view={view} />
            {picked && <PlacePickPopup point={picked} onClose={() => setPicked(null)} />}
          </>
        )}
      </MapGL>
      {mapError && !ready && (
        <div className="absolute inset-0 grid place-items-center p-6">
          <div
            role="alert"
            className="max-w-sm rounded-xl border border-line-strong bg-ink-850 p-4 text-center"
          >
            <p className="text-[14px] font-medium text-fg">The map couldn't load.</p>
            <p className="mt-1 text-[12.5px] text-fg-muted">
              The basemap service is unreachable right now. Routes, risk and the recommendation still work in
              the sidebar.
            </p>
            <button
              type="button"
              onClick={() => {
                setMapError(null)
                mapRef.current?.getMap().setStyle(MAP_STYLE)
              }}
              className="mt-3 rounded-lg border border-line-strong bg-ink-800 px-3 py-1.5 text-[13px] text-fg hover:bg-ink-750"
            >
              Retry map
            </button>
          </div>
        </div>
      )}
    </>
  )
}

/** Where the visible area's centre sits relative to the container's centre (px). */
function centreOffset(p: Padding): [number, number] {
  return [(p.left - p.right) / 2, (p.top - p.bottom) / 2]
}

function centreShift(from: Padding, to: Padding, axis: 'x' | 'y'): number {
  const i = axis === 'x' ? 0 : 1
  return centreOffset(from)[i]! - centreOffset(to)[i]!
}

function checkpointFeatures(view: TripView | undefined): FeatureCollection<Point, CheckpointFeatureProps> {
  if (!view) return { type: 'FeatureCollection', features: [] }
  const features = view.routes.flatMap((route) => {
    const scene = sceneRoute(
      route.id as RouteId,
      route.geometry as [number, number][],
      route.distance_mi,
      route.checkpoints,
    )
    return route.checkpoints.map((cp, i) => {
      const assessed = route.assessment?.checkpoints.find((c) => c.index === cp.index)
      const level = !route.assessment ? 'pending' : (assessed?.risk?.level ?? 'unknown')
      return {
        type: 'Feature' as const,
        properties: { routeId: route.id, index: cp.index, level, p: scene.checkpoints[i]!.progress },
        geometry: { type: 'Point' as const, coordinates: [cp.lon, cp.lat] },
      }
    })
  })
  return { type: 'FeatureCollection', features }
}
