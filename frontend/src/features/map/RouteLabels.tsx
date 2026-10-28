import { motion, useReducedMotion } from 'motion/react'
import { useMemo } from 'react'
import { Marker } from 'react-map-gl/maplibre'
import type { RouteId } from '@/lib/api/client'
import { cn } from '@/lib/cn'
import { formatDuration } from '@/lib/format'
import { labelAnchors, type LngLat } from '@/lib/geo'
import { EASE_OUT } from '@/lib/motion'
import type { RouteView } from '@/lib/queries'
import { LEVEL_COLOR, LEVEL_LABEL, type Level } from '@/lib/risk'
import { useTrip } from '@/store/trip'

/** Route summaries pinned to the map, placed where the routes are farthest apart. */
export function RouteLabels({ routes }: { routes: RouteView[] }) {
  const anchors = useMemo(() => labelAnchors(routes.map((r) => r.geometry as LngLat[])), [routes])
  const selected = useTrip((s) => s.selectedRouteId)
  const hovered = useTrip((s) => s.hoveredRouteId)
  const selectRoute = useTrip((s) => s.selectRoute)
  const hoverRoute = useTrip((s) => s.hoverRoute)
  const reduced = useReducedMotion()

  return routes.map((route, i) => {
    const [lng, lat] = anchors[i]!
    const level = route.assessment?.max_level as Level | null | undefined
    const emphasised = (hovered ?? selected) === route.id
    const dimmed = (hovered ?? selected) !== null && !emphasised
    return (
      <Marker key={route.id} longitude={lng} latitude={lat} anchor="bottom" offset={[0, -10]}>
        <motion.button
          type="button"
          initial={reduced ? false : { opacity: 0, y: 8, scale: 0.94 }}
          animate={{ opacity: dimmed ? 0.55 : 1, y: 0, scale: emphasised ? 1.04 : 1 }}
          transition={{ duration: 0.45, ease: EASE_OUT, delay: reduced ? 0 : 1.1 + i * 0.12 }}
          onClick={(e) => {
            e.stopPropagation()
            selectRoute(route.id as RouteId)
          }}
          onMouseEnter={() => hoverRoute(route.id as RouteId)}
          onMouseLeave={() => hoverRoute(null)}
          className={cn(
            'group flex items-center gap-2 rounded-lg border bg-ink-850/95 py-1.5 pr-2.5 pl-1.5 text-left shadow-[0_8px_24px_rgb(0_0_0/0.45)]',
            route.recommended ? 'border-amber/60' : 'border-line-strong',
          )}
          aria-label={`Route ${route.id}, ${route.label}`}
        >
          <span
            className={cn(
              'grid size-6 place-items-center rounded-md font-mono text-[12px] font-semibold',
              route.recommended ? 'bg-amber text-ink-950' : 'bg-ink-700 text-fg',
            )}
          >
            {route.id}
          </span>
          <span className="flex flex-col leading-tight">
            <span className="max-w-[170px] truncate text-[12px] font-medium text-fg">{route.label}</span>
            <span className="flex items-center gap-1.5 font-mono text-[11px] text-fg-muted">
              {formatDuration(route.duration_s)}
              <span className="text-fg-faint">·</span>
              {level ? (
                <span className="flex items-center gap-1">
                  <span className="size-1.5 rounded-full" style={{ background: LEVEL_COLOR[level] }} />
                  {LEVEL_LABEL[level]}
                </span>
              ) : (
                <span className="text-fg-faint">assessing</span>
              )}
            </span>
          </span>
        </motion.button>
      </Marker>
    )
  })
}
