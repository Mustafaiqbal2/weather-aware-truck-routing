import { CloudSun, Link2, Route as RouteIcon, ShieldCheck, TriangleAlert } from 'lucide-react'
import { motion } from 'motion/react'
import { toast } from 'sonner'
import { Button } from '@/components/Button'
import { ApiError } from '@/lib/api/client'
import { EASE_OUT } from '@/lib/motion'
import type { useTripView } from '@/lib/queries'
import { useTrip } from '@/store/trip'
import { DepartureWindow } from './DepartureWindow'
import { RecommendationCard } from './RecommendationCard'
import { RouteCards } from './RouteCards'
import { RouteDetail } from './RouteDetail'
import { StormDrill } from './StormDrill'

type TripQueries = ReturnType<typeof useTripView>

export function Results({ trip, scroller }: { trip: TripQueries; scroller: HTMLElement | null }) {
  const request = useTrip((s) => s.request)
  const selectedId = useTrip((s) => s.selectedRouteId)
  const { view, plan, assessment } = trip

  if (!request) return <HowItWorks />
  if (plan.isError) return <ErrorPanel error={plan.error} onRetry={() => plan.refetch()} />
  if (!view) return <PlanningSkeleton />

  const focusId = selectedId ?? view.recommendation?.route_id ?? view.routes[0]?.id
  const focus = view.routes.find((r) => r.id === focusId) ?? view.routes[0]!

  return (
    <div className="space-y-5">
      {view.plan.warnings.map((w) => (
        <p
          key={w}
          className="flex gap-2 rounded-lg border border-risk-high/30 bg-risk-high/10 px-3 py-2 text-[12.5px] text-fg"
        >
          <TriangleAlert className="mt-0.5 size-3.5 shrink-0 text-risk-high" aria-hidden />
          {w}
        </p>
      ))}
      <div className="flex items-center justify-between">
        <h2 className="text-[11px] font-medium tracking-[0.08em] text-fg-faint uppercase">
          {view.routes.length} routes · {view.plan.origin.label.split(',')[0]} to{' '}
          {view.plan.destination.label.split(',')[0]}
        </h2>
        <button
          type="button"
          onClick={() =>
            navigator.clipboard
              .writeText(window.location.href)
              .then(() => toast.success('Link copied. It opens this exact trip.'))
              .catch(() => toast.error("Couldn't copy the link."))
          }
          className="flex items-center gap-1.5 rounded-md px-2 py-1 text-[12px] text-fg-muted transition-colors hover:bg-ink-750 hover:text-fg"
        >
          <Link2 className="size-3.5" aria-hidden /> Copy link
        </button>
      </div>
      <StormDrill />
      <RecommendationCard
        view={view}
        error={assessment.error instanceof ApiError ? assessment.error : null}
        onRetry={() => assessment.refetch()}
      />
      <DepartureWindow view={view} />
      <RouteCards view={view} />
      <RouteDetail route={focus} scroller={scroller} />
      <p className="pt-2 text-[11px] leading-relaxed text-fg-faint">
        Routes: TomTom truck routing with your load plus a typical 35,000 lb tractor-trailer. Weather:
        Open-Meteo hourly forecast at each checkpoint's arrival hour. Risk rules follow the assignment's table
        and load rules.
      </p>
    </div>
  )
}

function PlanningSkeleton() {
  return (
    <div className="space-y-3" aria-busy="true" aria-label="Planning routes">
      <p className="flex items-center gap-2 text-[12.5px] text-fg-muted">
        <span className="size-1.5 animate-pulse rounded-full bg-amber" />
        Finding truck routes and sampling checkpoints…
      </p>
      <div className="h-32 skeleton rounded-xl" />
      {[0, 1, 2].map((i) => (
        <div key={i} className="h-[104px] skeleton rounded-xl" style={{ animationDelay: `${i * 120}ms` }} />
      ))}
    </div>
  )
}

const ERROR_HINTS: Record<string, string> = {
  not_configured: 'The routing service key is missing on the server.',
  no_route: 'Try a different destination; the two places may not be connected by truck-legal roads.',
  rate_limited: 'A data provider is busy. Give it a minute and try again.',
  network: 'Check your connection, then try again.',
}

function ErrorPanel({ error, onRetry }: { error: Error; onRetry: () => void }) {
  const code = error instanceof ApiError ? error.code : 'error'
  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.35, ease: EASE_OUT }}
      className="space-y-2 rounded-xl border border-risk-severe/30 bg-risk-severe/8 p-4"
      role="alert"
    >
      <p className="text-[14px] font-medium text-fg">{error.message}</p>
      {ERROR_HINTS[code] && <p className="text-[12.5px] text-fg-muted">{ERROR_HINTS[code]}</p>}
      {code !== 'invalid_trip' && code !== 'not_configured' && (
        <Button size="sm" onClick={onRetry} className="mt-1">
          Try again
        </Button>
      )}
    </motion.div>
  )
}

function HowItWorks() {
  const steps = [
    {
      icon: RouteIcon,
      title: 'Three truck routes',
      body: 'TomTom truck routing, with your load weight and 53 ft trailer dimensions, so weight limits and low bridges are respected.',
    },
    {
      icon: CloudSun,
      title: 'Weather when you get there',
      body: 'Every checkpoint gets the forecast for the hour your truck reaches it, not the weather right now.',
    },
    {
      icon: ShieldCheck,
      title: 'The safest pick',
      body: 'Fewest No Travel, then Severe, then High miles, then lowest average risk, then the fastest drive.',
    },
  ]
  return (
    <ol className="space-y-4 pt-2">
      {steps.map(({ icon: Icon, title, body }, i) => (
        <motion.li
          key={title}
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.45, ease: EASE_OUT, delay: 0.15 + i * 0.08 }}
          className="flex gap-3"
        >
          <span className="grid size-8 shrink-0 place-items-center rounded-lg border border-line bg-ink-800 text-fg-muted">
            <Icon className="size-4" aria-hidden />
          </span>
          <span>
            <span className="block text-[13.5px] font-medium text-fg">{title}</span>
            <span className="mt-0.5 block text-[12.5px] leading-snug text-fg-muted">{body}</span>
          </span>
        </motion.li>
      ))}
    </ol>
  )
}
