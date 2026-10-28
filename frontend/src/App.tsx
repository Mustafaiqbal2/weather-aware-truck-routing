import { lazy, Suspense } from 'react'
import { Sidebar } from '@/features/layout/Sidebar'
import { useWarmup } from '@/features/layout/useWarmup'
import { SimulatedBanner } from '@/features/routes/StormDrill'
import { TimelineDock } from '@/features/timeline/TimelineDock'
import { useTripView } from '@/lib/queries'
import { useUrlState } from '@/lib/urlState'
import { useLayout } from '@/store/layout'

// The map (and MapLibre, the largest dependency) loads in parallel with the first paint.
const MapView = lazy(() => import('@/features/map/MapView').then((m) => ({ default: m.MapView })))

export default function App() {
  useWarmup()
  useUrlState()
  const trip = useTripView()
  const compact = useLayout((s) => s.compact)

  return (
    <div className="relative flex h-full">
      <Sidebar trip={trip} />
      {/* Phones: the map fills the screen under the bottom sheet. */}
      <main
        className={
          compact
            ? 'fixed inset-0 overflow-hidden bg-ink-950'
            : 'relative h-full min-w-0 flex-1 overflow-hidden bg-ink-950'
        }
      >
        <Suspense fallback={<MapLoading />}>
          <MapView view={trip.view} />
        </Suspense>
        <SimulatedBanner />
        {!compact && <TimelineDock view={trip.view} />}
      </main>
    </div>
  )
}

function MapLoading() {
  return (
    <div className="absolute inset-x-0 top-0 grid h-1/2 place-items-center md:h-full" aria-busy="true">
      <p className="flex items-center gap-2 text-[12px] text-fg-faint">
        <span className="size-1.5 animate-pulse rounded-full bg-amber" />
        Loading map…
      </p>
    </div>
  )
}
