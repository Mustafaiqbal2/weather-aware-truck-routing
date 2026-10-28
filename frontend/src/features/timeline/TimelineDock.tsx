import { Eye, EyeOff, Pause, Play } from 'lucide-react'
import { motion } from 'motion/react'
import { Slider } from 'radix-ui'
import { useEffect, useMemo } from 'react'
import { Segmented } from '@/components/Segmented'
import { CHANNELS } from '@/features/heatmap/decode'
import { RAMPS } from '@/features/heatmap/colormaps'
import { cn } from '@/lib/cn'
import { clockParts, hoursBetween } from '@/lib/format'
import { EASE_OUT, gsap, prefersReducedMotion } from '@/lib/motion'
import { useHeatmapData, type TripView } from '@/lib/queries'
import { TIMELINE_HOURS, useTimeline } from '@/store/timeline'
import { type HeatVariable, useTrip } from '@/store/trip'
import { Legend } from './Legend'

const PLAY_HOURS_PER_SECOND = 4

export function TimelineDock({ view }: { view: TripView | undefined }) {
  const heat = useHeatmapData(view?.plan)
  const hour = useTimeline((s) => s.hour)
  const playing = useTimeline((s) => s.playing)
  const setHour = useTimeline((s) => s.setHour)
  const setPlaying = useTimeline((s) => s.setPlaying)
  const variable = useTrip((s) => s.heatVariable)
  const setVariable = useTrip((s) => s.setHeatVariable)
  const visible = useTrip((s) => s.heatVisible)
  const toggleHeat = useTrip((s) => s.toggleHeat)
  const selectedId = useTrip((s) => s.selectedRouteId)

  // Play: advance the slider on GSAP's ticker so it stays in step with the map's frames.
  useEffect(() => {
    if (!playing) return
    const tick = (_time: number, deltaMs: number) => {
      const next = useTimeline.getState().hour + (deltaMs / 1000) * PLAY_HOURS_PER_SECOND
      if (next >= TIMELINE_HOURS) {
        setHour(TIMELINE_HOURS)
        setPlaying(false)
      } else setHour(next)
    }
    gsap.ticker.add(tick)
    return () => gsap.ticker.remove(tick)
  }, [playing, setHour, setPlaying])

  // New trip: rewind.
  const requestId = useTrip((s) => s.requestId)
  useEffect(() => {
    setPlaying(false)
    setHour(0)
  }, [requestId, setHour, setPlaying])

  const startIso = heat.data?.start ?? view?.plan.departure
  const tz = view?.plan.origin.tz ?? 'UTC'
  const route =
    view?.routes.find((r) => r.id === (selectedId ?? view.recommendation?.route_id)) ?? view?.routes[0]

  // The truck's time on the road, drawn on the track so the forecast and the trip line up.
  const departure = route?.departure
  const arrival = route?.arrival
  const tripBand = useMemo(() => {
    if (!startIso || !departure || !arrival) return null
    const from = hoursBetween(startIso, departure)
    const to = hoursBetween(startIso, arrival)
    return {
      left: (Math.max(from, 0) / TIMELINE_HOURS) * 100,
      width: ((Math.min(to, TIMELINE_HOURS) - Math.max(from, 0)) / TIMELINE_HOURS) * 100,
    }
  }, [startIso, departure, arrival])

  if (!view) return null
  const start = startIso ? new Date(startIso) : null
  const current = start ? new Date(start.getTime() + hour * 3_600_000) : null
  const label = current ? clockParts(current, tz) : null
  const loading = heat.isPending
  const failed = heat.isError

  return (
    <motion.div
      initial={prefersReducedMotion() ? false : { opacity: 0, y: 24 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.5, ease: EASE_OUT, delay: 0.2 }}
      className="pointer-events-none absolute inset-x-3 bottom-3 z-10 flex justify-center md:inset-x-5 md:bottom-5"
    >
      <div className="pointer-events-auto w-full max-w-[880px] rounded-2xl border border-line-strong bg-ink-850/95 p-3 shadow-[0_20px_60px_rgb(0_0_0/0.55)] md:p-4">
        <div className="flex flex-wrap items-center gap-x-4 gap-y-3">
          <button
            type="button"
            onClick={() => {
              if (!playing && hour >= TIMELINE_HOURS) setHour(0)
              setPlaying(!playing)
            }}
            disabled={!heat.data}
            className="grid size-10 shrink-0 place-items-center rounded-full bg-amber text-ink-950 transition-transform hover:scale-105 active:scale-95 disabled:opacity-40"
            aria-label={playing ? 'Pause forecast' : 'Play forecast'}
          >
            {playing ? (
              <Pause className="size-4" fill="currentColor" />
            ) : (
              <Play className="ml-0.5 size-4" fill="currentColor" />
            )}
          </button>

          <div className="w-[132px] shrink-0">
            <p className="font-mono text-[15px] leading-tight text-fg tabular-nums">
              {label ? `${label.day} ${label.time}` : '—'}
            </p>
            <p className="font-mono text-[11px] text-fg-faint tabular-nums">
              {label?.zone} · +{Math.floor(hour)}h{String(Math.round((hour % 1) * 60)).padStart(2, '0')}
            </p>
          </div>

          <div className="relative min-w-[220px] flex-1">
            <div className="pointer-events-none absolute inset-x-0 top-1/2 h-1.5 -translate-y-1/2">
              {tripBand && tripBand.width > 0 && (
                <span
                  className="absolute top-0 h-full rounded-full bg-amber/25 ring-1 ring-amber/40"
                  style={{ left: `${tripBand.left}%`, width: `${tripBand.width}%` }}
                  title={`Route ${route?.id} on the road`}
                />
              )}
            </div>
            <Slider.Root
              value={[hour]}
              min={0}
              max={TIMELINE_HOURS}
              step={0.25}
              onValueChange={([v]) => {
                if (playing) setPlaying(false)
                setHour(v ?? 0)
              }}
              className="relative flex h-6 touch-none items-center select-none"
              aria-label="Forecast hour"
              disabled={!heat.data}
            >
              <Slider.Track
                className={cn('relative h-1.5 grow rounded-full bg-ink-700', loading && 'skeleton')}
              >
                <Slider.Range className="absolute h-full rounded-full bg-fg/25" />
              </Slider.Track>
              <Slider.Thumb
                aria-label="Forecast hour"
                className="block size-4 rounded-full border-2 border-ink-950 bg-fg shadow-[0_0_0_4px_rgb(245_165_36/0.25)] transition-transform hover:scale-110 focus-visible:outline-2 focus-visible:outline-amber"
              />
            </Slider.Root>
            <Ticks start={start} tz={tz} />
          </div>

          <div className="flex items-center gap-2">
            <Segmented<HeatVariable>
              label="Heatmap layer"
              size="sm"
              value={variable}
              onChange={setVariable}
              options={CHANNELS.map((c) => ({ value: c, label: RAMPS[c].label }))}
            />
            <button
              type="button"
              onClick={toggleHeat}
              className="grid size-8 place-items-center rounded-lg text-fg-faint transition-colors hover:bg-ink-750 hover:text-fg"
              aria-label={visible ? 'Hide heatmap' : 'Show heatmap'}
              aria-pressed={visible}
            >
              {visible ? <Eye className="size-4" /> : <EyeOff className="size-4" />}
            </button>
          </div>
        </div>
        <div className="mt-2.5 hidden items-center justify-between gap-4 md:flex">
          <Legend variable={variable} />
          <p className="hidden text-right text-[11px] text-fg-faint sm:block">
            {failed
              ? `Heatmap unavailable: ${heat.error.message}`
              : loading
                ? 'Loading the 48-hour forecast along the corridor…'
                : 'Forecast along an ~50-mile corridor. Amber band: your trip.'}
          </p>
        </div>
      </div>
    </motion.div>
  )
}

function Ticks({ start, tz }: { start: Date | null; tz: string }) {
  if (!start) return null
  const marks = [0, 12, 24, 36, 48]
  return (
    <div className="pointer-events-none relative mt-0.5 hidden h-3.5 font-mono text-[10px] text-fg-faint sm:block">
      {marks.map((h) => {
        const p = clockParts(new Date(start.getTime() + h * 3_600_000), tz)
        return (
          <span
            key={h}
            className={cn(
              'absolute whitespace-nowrap',
              h === 0 ? 'left-0' : h === 48 ? 'right-0' : '-translate-x-1/2',
            )}
            style={h > 0 && h < 48 ? { left: `${(h / 48) * 100}%` } : undefined}
          >
            {p.day} {p.time.replace(':00', '')}
          </span>
        )
      })}
    </div>
  )
}
