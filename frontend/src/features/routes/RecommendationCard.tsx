import NumberFlow from '@number-flow/react'
import { OctagonAlert, RotateCw, Sparkles } from 'lucide-react'
import { AnimatePresence, motion } from 'motion/react'
import { Button } from '@/components/Button'
import type { ApiError } from '@/lib/api/client'
import { clockParts } from '@/lib/format'
import { EASE_OUT } from '@/lib/motion'
import type { TripView } from '@/lib/queries'

export function RecommendationCard({
  view,
  error,
  onRetry,
}: {
  view: TripView
  error: ApiError | null
  onRetry: () => void
}) {
  const rec = view.recommendation
  const route = view.routes.find((r) => r.id === rec?.route_id)
  const destTz = view.plan.destination.tz

  return (
    <motion.section
      layout
      transition={{ layout: { duration: 0.35, ease: EASE_OUT } }}
      aria-live="polite"
      className="relative overflow-hidden rounded-xl border border-line-strong bg-ink-800"
    >
      <AnimatePresence mode="popLayout" initial={false}>
        {error ? (
          <motion.div key="error" {...fade} className="space-y-3 p-4">
            <p className="text-[13.5px] text-fg">The weather check didn't finish.</p>
            <p className="text-[12.5px] text-fg-muted">{error.message}</p>
            <Button size="sm" onClick={onRetry}>
              <RotateCw className="size-3.5" aria-hidden /> Try again
            </Button>
          </motion.div>
        ) : !rec || !route ? (
          <motion.div key="loading" {...fade} className="space-y-3 p-4">
            <p className="flex items-center gap-2 text-[12px] text-fg-muted">
              <span className="relative flex size-2">
                <span className="absolute inline-flex size-full animate-ping rounded-full bg-amber opacity-60 motion-reduce:animate-none" />
                <span className="relative inline-flex size-2 rounded-full bg-amber" />
              </span>
              Reading the forecast at {view.routes.reduce((n, r) => n + r.checkpoints.length, 0)} checkpoints…
            </p>
            <div className="h-5 w-2/3 skeleton rounded" />
            <div className="h-3.5 w-full skeleton rounded" />
            <div className="h-3.5 w-4/5 skeleton rounded" />
          </motion.div>
        ) : (
          <motion.div key={`rec-${rec.route_id}`} {...fade} className="p-4">
            {!rec.safe && (
              <div className="-mx-4 -mt-4 mb-4 flex items-start gap-2.5 border-b border-risk-no-travel/30 bg-risk-no-travel/12 px-4 py-3 text-[12.5px] text-fg">
                <OctagonAlert className="mt-0.5 size-4 shrink-0 text-risk-no-travel" aria-hidden />
                No route is safe at this departure time. The pick below is the least dangerous option.
              </div>
            )}
            <p className="flex items-center gap-1.5 text-[11px] font-medium tracking-[0.08em] text-amber uppercase">
              <Sparkles className="size-3.5" aria-hidden /> Recommended
            </p>
            <h2 className="mt-1.5 flex items-baseline gap-2 text-[19px] leading-tight font-semibold tracking-tight text-fg">
              <span className="font-mono text-amber">{route.id}</span>
              <span>{route.label}</span>
            </h2>
            <p className="mt-2 text-[13px] leading-snug text-fg-muted">{rec.reason}</p>
            {rec.tradeoff && <p className="mt-1.5 text-[13px] leading-snug text-fg-muted">{rec.tradeoff}</p>}

            <dl className="mt-4 grid grid-cols-3 gap-2">
              <Stat label="Drive">
                <NumberFlow value={Math.floor(route.duration_s / 3600)} suffix=" h " />
                <NumberFlow value={Math.round((route.duration_s % 3600) / 60)} suffix=" m" />
              </Stat>
              <Stat label="Arrive">{clockParts(route.arrival, destTz).time}</Stat>
              <Stat label="Severe+">
                <NumberFlow
                  value={Math.round(
                    (route.assessment?.miles.severe ?? 0) + (route.assessment?.miles.no_travel ?? 0),
                  )}
                  suffix=" mi"
                />
              </Stat>
            </dl>

            {rec.warnings.length > 0 && (
              <ul className="mt-3 space-y-1.5">
                {rec.warnings
                  .filter((w) => rec.safe || !w.startsWith('Every route'))
                  .map((w) => (
                    <li key={w} className="flex gap-2 text-[12px] leading-snug text-fg-muted">
                      <span className="mt-1.5 size-1 shrink-0 rounded-full bg-risk-high" aria-hidden />
                      {w}
                    </li>
                  ))}
              </ul>
            )}
          </motion.div>
        )}
      </AnimatePresence>
    </motion.section>
  )
}

const fade = {
  layout: 'position' as const,
  initial: { opacity: 0, y: 6 },
  animate: { opacity: 1, y: 0 },
  exit: { opacity: 0, transition: { duration: 0.12 } },
  transition: { duration: 0.32, ease: EASE_OUT },
}

function Stat({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="rounded-lg bg-ink-750 px-2.5 py-2">
      <dt className="text-[10.5px] tracking-wide text-fg-faint uppercase">{label}</dt>
      <dd className="mt-0.5 font-mono text-[14px] text-fg tabular-nums">{children}</dd>
    </div>
  )
}
