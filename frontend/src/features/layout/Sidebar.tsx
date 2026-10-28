import { type LenisRef, ReactLenis, useLenis } from 'lenis/react'
import { useEffect, useRef, useState } from 'react'
import { Results } from '@/features/routes/Results'
import { TimelineDock } from '@/features/timeline/TimelineDock'
import { TripForm } from '@/features/trip-form/TripForm'
import { cn } from '@/lib/cn'
import { formatDuration } from '@/lib/format'
import { prefersReducedMotion, ScrollTrigger } from '@/lib/motion'
import type { useTripView } from '@/lib/queries'
import { useLayout } from '@/store/layout'
import { useTrip } from '@/store/trip'
import { MobileSheet } from './MobileSheet'

type TripQueries = ReturnType<typeof useTripView>

/** Keeps ScrollTrigger in step with Lenis's smoothed scroll position. */
function ScrollTriggerSync() {
  useLenis(() => ScrollTrigger.update())
  return null
}

/** Trip form and results: a sidebar beside the map, or a bottom sheet on phones. */
export function Sidebar({ trip }: { trip: TripQueries }) {
  const compact = useLayout((s) => s.compact)
  const setSnap = useLayout((s) => s.setSnap)
  const requestId = useTrip((s) => s.requestId)
  const lenisRef = useRef<LenisRef>(null)
  const resultsRef = useRef<HTMLDivElement>(null)
  const [scroller, setScroller] = useState<HTMLElement | null>(null)

  useEffect(() => {
    setScroller(lenisRef.current?.wrapper ?? null)
  }, [compact])

  // Phones: each new trip opens the sheet halfway, leaving the top half of the screen for
  // the routes (the camera frames them above the sheet)...
  useEffect(() => {
    if (compact && requestId > 0) setSnap('half')
  }, [compact, requestId, setSnap])

  // ...and once its routes arrive, scrolls the sheet down to them.
  const hasRoutes = trip.view !== undefined
  const scrolledFor = useRef(0)
  useEffect(() => {
    const lenis = lenisRef.current?.lenis
    const results = resultsRef.current
    if (!compact || !hasRoutes || !lenis || !results || scrolledFor.current === requestId) return
    scrolledFor.current = requestId
    lenis.resize() // the results just changed the content height
    lenis.scrollTo(results, { offset: 0, duration: prefersReducedMotion() ? 0 : 0.8 })
  }, [compact, hasRoutes, requestId])

  const body = (
    <ReactLenis
      ref={lenisRef}
      root={false}
      options={{ lerp: 0.12, smoothWheel: !prefersReducedMotion() }}
      className="min-h-0 flex-1 overflow-y-auto overscroll-contain"
    >
      <ScrollTriggerSync />
      <div
        className={cn(
          'space-y-7 px-5 pt-5',
          // On phones the part of the sheet below the screen edge must still scroll into view.
          compact ? 'pb-[calc(var(--sheet-hidden,0px)+2.5rem+env(safe-area-inset-bottom))]' : 'pb-10',
        )}
      >
        <TripForm busy={trip.plan.isFetching} />
        <div ref={resultsRef} className="scroll-mt-3">
          <Results trip={trip} scroller={scroller} />
        </div>
      </div>
    </ReactLenis>
  )

  if (compact) {
    return (
      <MobileSheet
        header={
          <div className="flex items-center justify-between gap-3 border-b border-line px-5 pt-1 pb-3">
            <Brand subtitle={!trip.view?.recommendation} />
            <PeekSummary trip={trip} />
          </div>
        }
        dock={<TimelineDock view={trip.view} compact />}
      >
        {body}
      </MobileSheet>
    )
  }

  return (
    <aside className="flex h-full min-h-0 w-[408px] flex-none flex-col border-r border-line bg-ink-850">
      <header className="flex items-center gap-3 border-b border-line px-5 py-4">
        <Brand />
      </header>
      {body}
    </aside>
  )
}

function Brand({ subtitle = true }: { subtitle?: boolean }) {
  return (
    <div className="flex items-center gap-3">
      <img src="/favicon.svg" alt="" className="size-8" />
      <div className="leading-tight">
        <h1 className="text-[15px] font-semibold tracking-tight text-fg">Headwind</h1>
        {subtitle && <p className="text-[12px] text-fg-faint">Weather-aware truck routing</p>}
      </div>
    </div>
  )
}

/** The answer at a glance while the sheet is lowered. */
function PeekSummary({ trip }: { trip: TripQueries }) {
  const recommended = trip.view?.routes.find((r) => r.recommended)
  if (!recommended) return null
  return (
    <p className="flex shrink-0 items-center gap-2 whitespace-nowrap">
      <span className="text-[11px] font-medium tracking-[0.08em] text-amber uppercase">Pick</span>
      <span className="grid size-6 place-items-center rounded-md bg-amber font-mono text-[12px] font-semibold text-ink-950">
        {recommended.id}
      </span>
      <span className="font-mono text-[12px] text-fg-muted">{formatDuration(recommended.duration_s)}</span>
    </p>
  )
}
