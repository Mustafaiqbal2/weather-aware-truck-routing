import { CalendarClock } from 'lucide-react'
import { motion, useReducedMotion } from 'motion/react'
import { useState } from 'react'
import { Button } from '@/components/Button'
import { cn } from '@/lib/cn'
import { clockParts, formatMiles, toLocalInput } from '@/lib/format'
import { EASE_OUT } from '@/lib/motion'
import type { TripView } from '@/lib/queries'
import { LEVEL_COLOR, LEVEL_LABEL, type Level } from '@/lib/risk'
import { useTrip } from '@/store/trip'

type Option = NonNullable<TripView['departures']>['options'][number]

/** Weighted bad miles, only to size the bars: No Travel counts most, then Severe, then High. */
const danger = (o: Option) => o.miles.no_travel * 3 + o.miles.severe * 2 + o.miles.high

/** "Best time to leave": the safest route for departures every 2 hours over the next day. */
export function DepartureWindow({ view }: { view: TripView }) {
  const request = useTrip((s) => s.request)
  const submit = useTrip((s) => s.submit)
  const reduced = useReducedMotion()
  const [hovered, setHovered] = useState<number | null>(null)
  const departures = view.departures
  if (!departures || !request) return null

  const tz = view.plan.origin.tz
  const { options, best_offset_h: bestOffset } = departures
  const max = Math.max(1, ...options.map(danger))
  const shown = options.find((o) => o.offset_h === (hovered ?? bestOffset)) ?? options[0]!
  const best = options.find((o) => o.offset_h === bestOffset)
  const when = clockParts(shown.departure, tz)

  return (
    <section aria-label="Best time to leave" className="rounded-xl border border-line bg-ink-800 p-4">
      <div className="flex items-baseline justify-between">
        <h3 className="flex items-center gap-1.5 text-[11px] font-medium tracking-[0.08em] text-fg-faint uppercase">
          <CalendarClock className="size-3.5" aria-hidden /> Best time to leave
        </h3>
        <span className="text-[11px] text-fg-faint">next 24 h</span>
      </div>

      <div className="mt-3 flex h-16 items-end gap-1" onMouseLeave={() => setHovered(null)}>
        {options.map((o, i) => {
          const isBest = o.offset_h === bestOffset
          const color = o.max_level ? LEVEL_COLOR[o.max_level as Level] : LEVEL_COLOR.low
          const height = 10 + (danger(o) / max) * 90
          const at = clockParts(o.departure, tz)
          return (
            <button
              key={o.offset_h}
              type="button"
              onMouseEnter={() => setHovered(o.offset_h)}
              onFocus={() => setHovered(o.offset_h)}
              aria-label={`Leave ${at.day} ${at.time}: ${o.complete ? LEVEL_LABEL[(o.max_level as Level) ?? 'low'] : 'partly beyond the forecast'}`}
              className="group relative flex h-full flex-1 items-end"
            >
              <motion.span
                className={cn(
                  'w-full rounded-t-[3px] transition-opacity',
                  isBest && 'ring-2 ring-amber ring-offset-2 ring-offset-ink-800',
                  hovered !== null && hovered !== o.offset_h && 'opacity-55',
                )}
                style={{
                  background: o.complete
                    ? color
                    : `repeating-linear-gradient(135deg, ${LEVEL_COLOR.unknown} 0 3px, transparent 3px 6px)`,
                }}
                initial={reduced ? false : { height: 0 }}
                animate={{ height: `${height}%` }}
                transition={{ duration: 0.6, ease: EASE_OUT, delay: reduced ? 0 : i * 0.03 }}
              />
            </button>
          )
        })}
      </div>
      <div className="mt-1 flex justify-between font-mono text-[10px] text-fg-faint">
        <span>now</span>
        <span>+12 h</span>
        <span>+24 h</span>
      </div>

      <p className="mt-3 font-mono text-[12.5px] text-fg">
        Leave {when.day} {when.time} <span className="text-fg-faint">{when.zone}</span>
        <span className="text-fg-faint"> · route {shown.route_id}</span>
      </p>
      <p className="mt-0.5 text-[12px] text-fg-muted">
        {!shown.complete
          ? 'Part of this trip would be beyond the forecast, so it is not scored.'
          : shown.miles.no_travel + shown.miles.severe + shown.miles.high < 0.05
            ? 'No High, Severe or No Travel miles.'
            : [
                shown.miles.no_travel > 0.05 && `${formatMiles(shown.miles.no_travel)} No Travel`,
                shown.miles.severe > 0.05 && `${formatMiles(shown.miles.severe)} Severe`,
                shown.miles.high > 0.05 && `${formatMiles(shown.miles.high)} High`,
              ]
                .filter(Boolean)
                .join(' · ')}
      </p>
      {departures.reason && (
        <p className="mt-2 text-[12.5px] leading-snug text-fg-muted">{departures.reason}</p>
      )}
      {best && best.offset_h > 0 && (
        <Button
          size="sm"
          className="mt-3"
          onClick={() => submit({ ...request, departure: toLocalInput(best.departure, tz) })}
        >
          Plan for {clockParts(best.departure, tz).day} {clockParts(best.departure, tz).time}
        </Button>
      )}
    </section>
  )
}
