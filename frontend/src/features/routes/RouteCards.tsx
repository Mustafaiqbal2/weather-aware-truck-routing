import { motion, useReducedMotion } from 'motion/react'
import { RiskBar } from '@/components/RiskBar'
import { RiskChip } from '@/components/RiskChip'
import type { RouteId } from '@/lib/api/client'
import { cn } from '@/lib/cn'
import { clockParts, formatDuration, formatMiles } from '@/lib/format'
import { EASE_OUT } from '@/lib/motion'
import type { RouteView, TripView } from '@/lib/queries'
import type { Level } from '@/lib/risk'
import { useTrip } from '@/store/trip'

const SOURCE_LABEL = {
  tomtom: 'Main route',
  tomtom_alternative: 'Alternative',
  detour: 'Detour',
} as const

export function RouteCards({ view }: { view: TripView }) {
  const selected = useTrip((s) => s.selectedRouteId)
  const hovered = useTrip((s) => s.hoveredRouteId)
  const selectRoute = useTrip((s) => s.selectRoute)
  const hoverRoute = useTrip((s) => s.hoverRoute)
  const reduced = useReducedMotion()
  const ordered = [...view.routes].sort((a, b) => (a.rank ?? 9) - (b.rank ?? 9) || a.id.localeCompare(b.id))
  const active = selected ?? view.recommendation?.route_id ?? null
  const fastest = view.routes.reduce((a, b) => (b.duration_s < a.duration_s ? b : a)).id

  return (
    <ol className="space-y-2" aria-label="Route options">
      {ordered.map((route, i) => (
        <motion.li
          key={route.id}
          layout={!reduced}
          initial={reduced ? false : { opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{
            duration: 0.45,
            ease: EASE_OUT,
            delay: reduced ? 0 : 0.06 * i,
            layout: { duration: 0.5, ease: EASE_OUT },
          }}
        >
          <RouteCard
            route={route}
            destTz={view.plan.destination.tz}
            fastest={fastest === route.id}
            active={active === route.id}
            hovered={hovered === route.id}
            onSelect={() => selectRoute(selected === route.id ? null : (route.id as RouteId))}
            onHover={(on) => hoverRoute(on ? (route.id as RouteId) : null)}
          />
        </motion.li>
      ))}
    </ol>
  )
}

function RouteCard({
  route,
  destTz,
  fastest,
  active,
  hovered,
  onSelect,
  onHover,
}: {
  route: RouteView
  destTz: string
  fastest: boolean
  active: boolean
  hovered: boolean
  onSelect: () => void
  onHover: (on: boolean) => void
}) {
  const a = route.assessment
  const arrival = clockParts(route.arrival, destTz)
  const severe = (a?.miles.severe ?? 0) + (a?.miles.no_travel ?? 0)
  return (
    <button
      type="button"
      onClick={onSelect}
      onMouseEnter={() => onHover(true)}
      onMouseLeave={() => onHover(false)}
      onFocus={() => onHover(true)}
      onBlur={() => onHover(false)}
      aria-pressed={active}
      className={cn(
        'group relative w-full rounded-xl border p-3.5 text-left transition-[background-color,border-color] duration-200',
        active ? 'border-line-strong bg-ink-750' : 'border-line bg-ink-800 hover:bg-ink-750',
        hovered && !active && 'border-line-strong',
      )}
    >
      {route.recommended && (
        <span className="absolute top-3 bottom-3 left-0 w-[3px] rounded-r-full bg-amber" aria-hidden />
      )}
      <div className="flex items-start gap-3">
        <span
          className={cn(
            'grid size-7 shrink-0 place-items-center rounded-lg font-mono text-[13px] font-semibold',
            route.recommended ? 'bg-amber text-ink-950' : 'bg-ink-700 text-fg',
          )}
        >
          {route.id}
        </span>
        <div className="min-w-0 flex-1">
          <div className="flex items-baseline justify-between gap-3">
            <p className="truncate text-[14px] font-medium text-fg">{route.label}</p>
            <p className="shrink-0 font-mono text-[13.5px] text-fg tabular-nums">
              {formatDuration(route.duration_s)}
            </p>
          </div>
          <p className="mt-0.5 flex flex-wrap gap-x-2 text-[12px] text-fg-faint">
            <span>{fastest ? 'Fastest' : SOURCE_LABEL[route.source]}</span>
            <span>·</span>
            <span className="font-mono">{formatMiles(route.distance_mi)}</span>
            <span>·</span>
            <span>
              arrives {arrival.day} {arrival.time} {arrival.zone}
            </span>
          </p>
          <div className="mt-3">
            <RiskBar miles={a?.miles} />
          </div>
          <div className="mt-2.5 flex min-h-5 items-center justify-between gap-2">
            {a ? (
              <>
                <RiskChip level={(a.max_level as Level | null) ?? null} />
                <span className="font-mono text-[11.5px] text-fg-faint tabular-nums">
                  {severe > 0.05 ? `${formatMiles(severe)} severe+ · ` : ''}
                  {a.miles.high > 0.05 ? `${formatMiles(a.miles.high)} high · ` : ''}
                  avg {a.average_risk.toFixed(2)}
                </span>
              </>
            ) : (
              <span className="h-3 w-24 skeleton rounded" />
            )}
          </div>
        </div>
      </div>
    </button>
  )
}
