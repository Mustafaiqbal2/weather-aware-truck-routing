import { ArrowDownUp, LoaderCircle, Navigation } from 'lucide-react'
import { type FormEvent, useState } from 'react'
import { Button } from '@/components/Button'
import { Segmented } from '@/components/Segmented'
import type { PlaceInput, RoutesRequest } from '@/lib/api/client'
import { cn } from '@/lib/cn'
import { useTrip } from '@/store/trip'
import { type Departure, departureFromValue, departureValue } from './departure'
import { DepartureField } from './DepartureField'
import { EXAMPLES } from './examples'
import { PlaceField } from './PlaceField'

const LOAD_PRESETS = [20_000, 35_000, 42_000, 45_000]
const MAX_LOAD = 120_000

function nextQuarterHour(): string {
  const d = new Date(Date.now() + 15 * 60_000)
  const minutes = Math.ceil(d.getMinutes() / 15) * 15
  d.setMinutes(minutes, 0, 0)
  return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`
}

export function TripForm({ busy }: { busy: boolean }) {
  const submit = useTrip((s) => s.submit)
  const current = useTrip((s) => s.request)
  // Places live in the store so a pin dropped on the map can fill them too.
  const origin = useTrip((s) => s.draft.origin)
  const destination = useTrip((s) => s.draft.destination)
  const setDraftPlace = useTrip((s) => s.setDraftPlace)
  const swapDraft = useTrip((s) => s.swapDraft)
  const setOrigin = (place: PlaceInput | null) => setDraftPlace('origin', place)
  const setDestination = (place: PlaceInput | null) => setDraftPlace('destination', place)
  const [departure, setDeparture] = useState<Departure>(() => ({
    mode: 'now',
    date: new Date(),
    time: nextQuarterHour(),
  }))
  const [load, setLoad] = useState('42000')
  const [interval, setSampleInterval] = useState<'10' | '25' | '50'>('25')

  const loadLb = Number(load)
  const loadValid = load !== '' && Number.isFinite(loadLb) && loadLb >= 0 && loadLb <= MAX_LOAD
  const canSubmit = origin !== null && destination !== null && loadValid && !busy

  const request = (o = origin, d = destination, l = loadLb): RoutesRequest | null =>
    o && d
      ? {
          origin: o,
          destination: d,
          departure: departureValue(departure),
          load_lb: l,
          interval_mi: Number(interval) as 10 | 25 | 50,
        }
      : null

  const onSubmit = (e: FormEvent) => {
    e.preventDefault()
    const r = request()
    if (r && canSubmit) submit(r)
  }

  const runExample = (ex: (typeof EXAMPLES)[number]) => {
    setOrigin(ex.origin)
    setDestination(ex.destination)
    setLoad(String(ex.load))
    const r = request(ex.origin, ex.destination, ex.load)
    if (r) submit(r)
  }

  // Follow trips started elsewhere (a shared link, or "Plan for" in the departure chart).
  const [synced, setSynced] = useState(current)
  if (current !== synced) {
    setSynced(current)
    if (current && JSON.stringify(current) !== JSON.stringify(request())) {
      setOrigin(current.origin)
      setDestination(current.destination)
      setLoad(String(current.load_lb))
      setSampleInterval(String(current.interval_mi ?? 25) as '10' | '25' | '50')
      setDeparture(departureFromValue(current.departure, departure))
    }
  }

  const dirty = current !== null && JSON.stringify(current) !== JSON.stringify(request())

  return (
    <form onSubmit={onSubmit} className="space-y-4" aria-label="Plan a trip">
      <div className="relative space-y-2">
        <PlaceField label="Origin" marker="origin" value={origin} onChange={setOrigin} />
        <PlaceField label="Destination" marker="destination" value={destination} onChange={setDestination} />
        <button
          type="button"
          onClick={swapDraft}
          className="absolute top-1/2 right-2.5 grid size-7 -translate-y-1/2 place-items-center rounded-md border border-line-strong bg-ink-800 text-fg-muted transition-colors hover:text-fg"
          aria-label="Swap origin and destination"
        >
          <ArrowDownUp className="size-3.5" />
        </button>
      </div>

      <Field label="Departure">
        <DepartureField value={departure} onChange={setDeparture} originLabel={origin?.label} />
      </Field>

      <Field label="Load weight" htmlFor="load">
        <div className="flex items-center gap-2">
          <div
            className={cn(
              'flex h-10 min-w-0 flex-1 items-center rounded-lg border bg-ink-900 pr-3 focus-within:border-amber/60',
              loadValid ? 'border-line hover:border-line-strong' : 'border-risk-severe/70',
            )}
          >
            <input
              id="load"
              inputMode="numeric"
              value={load === '' ? '' : Number(load).toLocaleString('en-US')}
              onChange={(e) => setLoad(e.target.value.replace(/[^\d]/g, '').slice(0, 6))}
              className="h-full min-w-0 flex-1 bg-transparent px-3 font-mono text-[14px] text-fg outline-none"
              aria-invalid={!loadValid}
              aria-describedby="load-help"
            />
            <span className="text-[12px] text-fg-faint">lb</span>
          </div>
          <div className="flex gap-1" role="group" aria-label="Load presets">
            {LOAD_PRESETS.map((p) => (
              <button
                key={p}
                type="button"
                onClick={() => setLoad(String(p))}
                aria-pressed={Number(load) === p}
                className={cn(
                  'h-10 w-10 rounded-lg border font-mono text-[11.5px] transition-colors',
                  Number(load) === p
                    ? 'border-amber/50 bg-amber-soft text-amber-bright'
                    : 'border-line text-fg-faint hover:border-line-strong hover:text-fg-muted',
                )}
              >
                {(p / 1000).toFixed(0)}k
              </button>
            ))}
          </div>
        </div>
        <p id="load-help" className={cn('text-[11.5px]', loadValid ? 'text-fg-faint' : 'text-risk-severe')}>
          {loadValid
            ? 'Cargo only. Load rules apply above 30,000 and 40,000 lb.'
            : 'Enter a load between 0 and 120,000 lb.'}
        </p>
      </Field>

      <Field label="Checkpoint every">
        <Segmented
          label="Checkpoint interval"
          value={interval}
          onChange={setSampleInterval}
          options={[
            { value: '10', label: '10 mi' },
            { value: '25', label: '25 mi' },
            { value: '50', label: '50 mi' },
          ]}
        />
      </Field>

      <Button type="submit" variant="primary" className="w-full" disabled={!canSubmit}>
        {busy ? (
          <LoaderCircle className="size-4 animate-spin" aria-hidden />
        ) : (
          <Navigation className="size-4" aria-hidden />
        )}
        {busy ? 'Planning…' : dirty ? 'Update routes' : 'Plan routes'}
      </Button>

      {current === null && (
        <div className="flex flex-wrap items-center gap-1.5 pt-1">
          <span className="mr-0.5 text-[12px] text-fg-faint">Try</span>
          {EXAMPLES.map((ex) => (
            <button
              key={ex.label}
              type="button"
              onClick={() => runExample(ex)}
              className="h-7 rounded-full border border-line px-2.5 text-[12px] text-fg-muted transition-colors hover:border-amber/40 hover:text-fg"
            >
              {ex.label}
            </button>
          ))}
        </div>
      )}
    </form>
  )
}

function Field({ label, htmlFor, children }: { label: string; htmlFor?: string; children: React.ReactNode }) {
  return (
    <div className="space-y-1.5">
      <label
        htmlFor={htmlFor}
        className="block text-[11px] font-medium tracking-[0.08em] text-fg-faint uppercase"
      >
        {label}
      </label>
      {children}
    </div>
  )
}
