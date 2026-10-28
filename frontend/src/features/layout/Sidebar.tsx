import { type LenisRef, ReactLenis, useLenis } from 'lenis/react'
import { useEffect, useRef, useState } from 'react'
import { Results } from '@/features/routes/Results'
import { TripForm } from '@/features/trip-form/TripForm'
import { prefersReducedMotion, ScrollTrigger } from '@/lib/motion'
import type { useTripView } from '@/lib/queries'

/** Keeps ScrollTrigger in step with Lenis's smoothed scroll position. */
function ScrollTriggerSync() {
  useLenis(() => ScrollTrigger.update())
  return null
}

export function Sidebar({ trip }: { trip: ReturnType<typeof useTripView> }) {
  const lenisRef = useRef<LenisRef>(null)
  const [scroller, setScroller] = useState<HTMLElement | null>(null)

  useEffect(() => {
    setScroller(lenisRef.current?.wrapper ?? null)
  }, [])

  return (
    <aside className="flex min-h-0 w-full flex-1 flex-col border-line bg-ink-850 md:w-[408px] md:flex-none md:border-r">
      <header className="flex items-center gap-3 border-b border-line px-5 py-4">
        <img src="/favicon.svg" alt="" className="size-8" />
        <div className="leading-tight">
          <h1 className="text-[15px] font-semibold tracking-tight text-fg">Headwind</h1>
          <p className="text-[12px] text-fg-faint">Weather-aware truck routing</p>
        </div>
      </header>
      <ReactLenis
        ref={lenisRef}
        root={false}
        options={{ lerp: 0.12, smoothWheel: !prefersReducedMotion() }}
        className="min-h-0 flex-1 overflow-y-auto overscroll-contain"
      >
        <ScrollTriggerSync />
        <div className="space-y-7 px-5 pt-5 pb-10">
          <TripForm busy={trip.plan.isFetching} />
          <Results trip={trip} scroller={scroller} />
        </div>
      </ReactLenis>
    </aside>
  )
}
