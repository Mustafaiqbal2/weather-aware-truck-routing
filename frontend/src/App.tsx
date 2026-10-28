import { Sidebar } from '@/features/layout/Sidebar'
import { useWarmup } from '@/features/layout/useWarmup'
import { MapView } from '@/features/map/MapView'
import { TimelineDock } from '@/features/timeline/TimelineDock'
import { useTripView } from '@/lib/queries'

export default function App() {
  useWarmup()
  const trip = useTripView()

  return (
    <div className="flex h-full flex-col md:flex-row">
      <Sidebar trip={trip} />
      <main className="relative order-first h-[55vh] shrink-0 overflow-hidden bg-ink-950 md:order-none md:h-full md:flex-1">
        <MapView view={trip.view} />
        <TimelineDock view={trip.view} />
      </main>
    </div>
  )
}
