import { lazy, Suspense } from 'react'
import { Sidebar } from '@/features/layout/Sidebar'
import { useWarmup } from '@/features/layout/useWarmup'
import { SimulatedBanner } from '@/features/routes/StormDrill'
import { TimelineDock } from '@/features/timeline/TimelineDock'
import { useTripView } from '@/lib/queries'
import { useUrlState } from '@/lib/urlState'

// The map (and MapLibre, the largest dependency) loads in parallel with the first paint.
const MapView = lazy(() => import('@/features/map/MapView').then((m) => ({ default: m.MapView })))

export default function App() {
  useWarmup()
  useUrlState()
  const trip = useTripView()

  return (
    <div className="flex h-full flex-col md:flex-row">
      <Sidebar trip={trip} />
      <main className="relative order-first h-[55vh] shrink-0 overflow-hidden bg-ink-950 md:order-none md:h-full md:flex-1">
        <Suspense fallback={<MapLoading />}>
          <MapView view={trip.view} />
        </Suspense>
        <SimulatedBanner />
        <TimelineDock view={trip.view} />
      </main>
    </div>
  )
}

function MapLoading() {
  return (
    <div className="absolute inset-0 grid place-items-center" aria-busy="true">
      <p className="flex items-center gap-2 text-[12px] text-fg-faint">
        <span className="size-1.5 animate-pulse rounded-full bg-amber" />
        Loading map…
      </p>
    </div>
  )
}
