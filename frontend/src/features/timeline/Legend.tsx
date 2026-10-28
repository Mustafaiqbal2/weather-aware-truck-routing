import { RAMPS } from '@/features/heatmap/colormaps'
import { LEVEL_COLOR, LEVEL_LABEL, LEVELS } from '@/lib/risk'
import type { HeatVariable } from '@/store/trip'

/** Legend for the active heatmap layer: risk levels as labelled swatches, weather as a ramp. */
export function Legend({ variable }: { variable: HeatVariable }) {
  if (variable === 'risk') {
    return (
      <ul className="flex flex-wrap items-center gap-x-3 gap-y-1" aria-label="Risk levels">
        {LEVELS.map((level) => (
          <li key={level} className="flex items-center gap-1.5 text-[11px] text-fg-muted">
            <span className="size-2 rounded-sm" style={{ background: LEVEL_COLOR[level] }} />
            {LEVEL_LABEL[level]}
          </li>
        ))}
      </ul>
    )
  }

  const ramp = RAMPS[variable]
  const stops = ramp.stops
    .map((s) => {
      const a = Math.min(0.25 + s.alpha * 1.2, 1)
      const hex = Math.round(a * 255)
        .toString(16)
        .padStart(2, '0')
      return `${s.color}${hex} ${(s.value / ramp.max) * 100}%`
    })
    .join(', ')
  return (
    <div className="flex items-center gap-2.5">
      <span className="text-[11px] font-medium text-fg-muted">
        {ramp.label} <span className="text-fg-faint">{ramp.unit}</span>
      </span>
      <div className="relative w-[200px] md:w-[240px]">
        <div className="h-1.5 rounded-full" style={{ background: `linear-gradient(90deg, ${stops})` }} />
        <div className="relative mt-0.5 h-3 font-mono text-[9.5px] text-fg-faint">
          {ramp.ticks.map((t) => (
            <span
              key={t.label}
              className="absolute -translate-x-1/2"
              style={{ left: `${(t.value / ramp.max) * 100}%` }}
            >
              {t.label}
            </span>
          ))}
        </div>
      </div>
      <span className="text-[10.5px] text-fg-faint">ticks = risk thresholds</span>
    </div>
  )
}
