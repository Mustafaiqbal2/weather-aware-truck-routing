import { Popup } from 'react-map-gl/maplibre'
import { RiskChip } from '@/components/RiskChip'
import { clockParts, formatMiles } from '@/lib/format'
import type { TripView } from '@/lib/queries'
import { weatherCodeLabel, type Level } from '@/lib/risk'
import { useTrip } from '@/store/trip'

export function CheckpointPopup({ view }: { view: TripView | undefined }) {
  const selected = useTrip((s) => s.selectedCheckpoint)
  const selectCheckpoint = useTrip((s) => s.selectCheckpoint)
  if (!view || !selected) return null
  const route = view.routes.find((r) => r.id === selected.routeId)
  const cp = route?.checkpoints.find((c) => c.index === selected.index)
  if (!route || !cp) return null
  const assessed = route.assessment?.checkpoints.find((c) => c.index === cp.index)
  const eta = clockParts(cp.eta, cp.tz)
  const w = assessed?.weather
  const risk = assessed?.risk

  return (
    <Popup
      longitude={cp.lon}
      latitude={cp.lat}
      anchor="bottom"
      offset={16}
      closeOnClick={false}
      onClose={() => selectCheckpoint(null)}
      maxWidth="300px"
    >
      <div className="w-[272px] p-3.5">
        <div className="flex items-start justify-between gap-3 pr-5">
          <div>
            <p className="text-[11px] font-medium tracking-[0.08em] text-fg-faint uppercase">
              Route {route.id} · Mile {Math.round(cp.mile)}
            </p>
            <p className="mt-1 font-mono text-[15px] text-fg">
              {eta.day} {eta.time} <span className="text-fg-muted">{eta.zone}</span>
            </p>
          </div>
        </div>
        {risk && w ? (
          <>
            <div className="mt-3 flex items-center gap-2">
              <RiskChip level={risk.level as Level} />
              <span className="text-[12px] text-fg-muted">{weatherCodeLabel(w.weather_code)}</span>
            </div>
            <dl className="mt-3 grid grid-cols-3 gap-2 font-mono text-[12px]">
              <Reading
                label="Wind"
                value={`${w.wind_mph.toFixed(0)} mph`}
                hint={w.gust_mph ? `gust ${w.gust_mph.toFixed(0)}` : undefined}
              />
              <Reading label="Rain" value={`${w.rain_in_hr.toFixed(2)}″/h`} />
              <Reading label="Snow" value={`${w.snow_in_hr.toFixed(2)}″/h`} />
            </dl>
            <p className="mt-3 text-[12.5px] leading-snug text-fg-muted">{risk.summary}</p>
            <p className="mt-2 text-[11px] text-fg-faint">
              Forecast for {clockParts(w.valid_from, cp.tz).time}–{clockParts(w.valid_to, cp.tz).time}, the
              hour the truck passes {formatMiles(cp.mile)} in.
            </p>
          </>
        ) : assessed ? (
          <p className="mt-3 text-[12.5px] text-fg-muted">
            This checkpoint is beyond the forecast range, so it couldn't be scored.
          </p>
        ) : (
          <div className="mt-3 h-14 skeleton rounded-md" aria-label="Loading weather" />
        )}
      </div>
    </Popup>
  )
}

function Reading({ label, value, hint }: { label: string; value: string; hint?: string | undefined }) {
  return (
    <div className="rounded-md bg-ink-750 px-2 py-1.5">
      <dt className="font-sans text-[10.5px] text-fg-faint">{label}</dt>
      <dd className="text-fg">{value}</dd>
      {hint && <dd className="text-[10.5px] text-fg-faint">{hint}</dd>}
    </div>
  )
}
