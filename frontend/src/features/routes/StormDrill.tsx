import { CloudLightning } from 'lucide-react'
import { Switch } from 'radix-ui'
import { cn } from '@/lib/cn'
import { useTrip } from '@/store/trip'

/** Opt-in simulated storm for demos. Every result it affects is labelled as simulated. */
export function StormDrill() {
  const scenario = useTrip((s) => s.scenario)
  const setScenario = useTrip((s) => s.setScenario)
  const on = scenario === 'storm'
  return (
    <div
      className={cn(
        'flex items-center gap-3 rounded-xl border border-dashed px-3.5 py-2.5 transition-colors',
        on ? 'border-risk-no-travel/50 bg-risk-no-travel/8' : 'border-line-strong',
      )}
    >
      <CloudLightning
        className={cn('size-4 shrink-0', on ? 'text-risk-no-travel' : 'text-fg-faint')}
        aria-hidden
      />
      <label htmlFor="storm-drill" className="min-w-0 flex-1 cursor-pointer">
        <span className="block text-[13px] text-fg">Storm drill</span>
        <span className="block text-[11.5px] leading-snug text-fg-faint">
          Lay a simulated storm over the real forecast to see the rules react. Not real weather.
        </span>
      </label>
      <Switch.Root
        id="storm-drill"
        checked={on}
        onCheckedChange={(checked) => setScenario(checked ? 'storm' : 'live')}
        className="relative h-5 w-9 shrink-0 rounded-full bg-ink-600 transition-colors data-[state=checked]:bg-risk-no-travel"
      >
        <Switch.Thumb className="block size-4 translate-x-0.5 rounded-full bg-fg shadow transition-transform duration-200 data-[state=checked]:translate-x-[18px]" />
      </Switch.Root>
    </div>
  )
}

/** Banner over the map whenever the storm drill is on. */
export function SimulatedBanner() {
  const on = useTrip((s) => s.scenario === 'storm' && s.request !== null)
  if (!on) return null
  return (
    <div className="pointer-events-none absolute inset-x-0 top-3 z-10 flex justify-center">
      <p
        role="status"
        className="flex items-center gap-2 rounded-full border border-risk-no-travel/50 px-3.5 py-1.5 text-[11.5px] font-semibold tracking-wide text-fg uppercase shadow-lg"
        style={{
          background:
            'repeating-linear-gradient(135deg, rgb(192 76 245 / 0.28) 0 10px, rgb(15 19 26 / 0.92) 10px 20px)',
        }}
      >
        <CloudLightning className="size-3.5 text-risk-no-travel" aria-hidden />
        Simulated storm · not real weather
      </p>
    </div>
  )
}
