import { useLenis } from 'lenis/react'
import { useEffect, useRef } from 'react'
import { RiskChip } from '@/components/RiskChip'
import type { RouteId } from '@/lib/api/client'
import { cn } from '@/lib/cn'
import { clockParts, formatMiles } from '@/lib/format'
import { gsap, prefersReducedMotion, ScrollTrigger, useGSAP } from '@/lib/motion'
import type { RouteView } from '@/lib/queries'
import { LEVEL_COLOR, LEVEL_LABEL, type Level } from '@/lib/risk'
import { useTrip } from '@/store/trip'

/** The selected (or recommended) route: risk along its length and every checkpoint. */
export function RouteDetail({ route, scroller }: { route: RouteView; scroller: HTMLElement | null }) {
  const listRef = useRef<HTMLOListElement>(null)
  const selected = useTrip((s) => s.selectedCheckpoint)
  const selectCheckpoint = useTrip((s) => s.selectCheckpoint)
  const lenis = useLenis()
  const assessed = route.assessment !== undefined

  // Rows ease in as they scroll into the sidebar (no pinning, scroller is the sidebar).
  useGSAP(
    () => {
      if (!scroller || !listRef.current || prefersReducedMotion()) return
      const rows = gsap.utils.toArray<HTMLElement>('[data-row]', listRef.current)
      gsap.set(rows, { opacity: 0, y: 10 })
      ScrollTrigger.batch(rows, {
        scroller,
        start: 'top 98%',
        once: true,
        onEnter: (batch) =>
          gsap.to(batch, {
            opacity: 1,
            y: 0,
            duration: 0.5,
            ease: 'power2.out',
            stagger: 0.035,
            overwrite: true,
          }),
      })
      ScrollTrigger.refresh()
    },
    { scope: listRef, dependencies: [route.id, scroller, assessed], revertOnUpdate: true },
  )

  // A checkpoint clicked on the map scrolls its row into view.
  useEffect(() => {
    if (!selected || selected.origin !== 'map' || selected.routeId !== route.id) return
    const row = listRef.current?.querySelector<HTMLElement>(`[data-index="${selected.index}"]`)
    if (!row) return
    gsap.set(row, { opacity: 1, y: 0 })
    if (lenis) lenis.scrollTo(row, { offset: -96, duration: prefersReducedMotion() ? 0 : 1.1 })
    else row.scrollIntoView({ block: 'center' })
  }, [selected, route.id, lenis])

  const levels = route.checkpoints.map(
    (cp) =>
      (route.assessment?.checkpoints.find((c) => c.index === cp.index)?.risk?.level as Level | undefined) ??
      null,
  )

  return (
    <section aria-label={`Route ${route.id} checkpoints`} className="space-y-3">
      <div className="flex items-baseline justify-between">
        <h3 className="text-[11px] font-medium tracking-[0.08em] text-fg-faint uppercase">
          Route {route.id} · {route.checkpoints.length} checkpoints
        </h3>
        <span className="font-mono text-[11px] text-fg-faint">
          every {route.checkpoints[1]?.mile ?? 0} mi
        </span>
      </div>
      <RiskStrip route={route} levels={levels} />
      <ol ref={listRef} className="relative space-y-1">
        <span className="absolute top-4 bottom-4 left-[60px] w-px bg-line-strong" aria-hidden />
        {route.checkpoints.map((cp, i) => {
          const a = route.assessment?.checkpoints.find((c) => c.index === cp.index)
          const level = levels[i] ?? null
          const isSelected = selected?.routeId === route.id && selected.index === cp.index
          const eta = clockParts(cp.eta, cp.tz)
          return (
            <li key={cp.index} data-row data-index={cp.index}>
              <button
                type="button"
                onClick={() =>
                  selectCheckpoint({ routeId: route.id as RouteId, index: cp.index, origin: 'list' })
                }
                className={cn(
                  'relative flex w-full items-start gap-3 rounded-lg px-2 py-2 text-left transition-colors',
                  isSelected ? 'bg-ink-700' : 'hover:bg-ink-750',
                )}
              >
                <span className="w-9 shrink-0 pt-0.5 text-right font-mono text-[11px] text-fg-faint tabular-nums">
                  {Math.round(cp.mile)}
                </span>
                <span
                  className="relative z-10 mt-1 size-2.5 shrink-0 rounded-full ring-4 ring-ink-850"
                  style={{
                    background: level ? LEVEL_COLOR[level] : assessed ? LEVEL_COLOR.unknown : '#c3cad6',
                  }}
                  aria-hidden
                />
                <span className="min-w-0 flex-1">
                  <span className="flex items-center justify-between gap-2">
                    <span className="font-mono text-[12.5px] text-fg tabular-nums">
                      {eta.day} {eta.time} <span className="text-fg-faint">{eta.zone}</span>
                    </span>
                    {a ? <RiskChip level={level} /> : <span className="h-4 w-14 skeleton rounded-full" />}
                  </span>
                  {a?.weather && (
                    <span className="mt-0.5 block font-mono text-[11.5px] text-fg-muted tabular-nums">
                      wind {a.weather.wind_mph.toFixed(0)} · rain {a.weather.rain_in_hr.toFixed(2)} · snow{' '}
                      {a.weather.snow_in_hr.toFixed(2)}
                    </span>
                  )}
                  {a?.risk && a.risk.level !== 'low' && (
                    <span className="mt-1 block text-[12px] leading-snug text-fg-muted">
                      {a.risk.summary}
                    </span>
                  )}
                  {a && !a.weather && (
                    <span className="mt-0.5 block text-[12px] text-fg-faint">Beyond the forecast range</span>
                  )}
                </span>
              </button>
            </li>
          )
        })}
      </ol>
    </section>
  )
}

/** Risk along the route, drawn to scale by distance. */
function RiskStrip({ route, levels }: { route: RouteView; levels: (Level | null)[] }) {
  const cps = route.checkpoints
  const total = route.distance_mi || 1
  const assessed = route.assessment !== undefined
  return (
    <div>
      <div
        className="flex h-3 w-full overflow-hidden rounded-md bg-ink-700"
        role="img"
        aria-label="Risk along the route by distance"
      >
        {cps.map((cp, i) => {
          const from = i === 0 ? 0 : (cps[i - 1]!.mile + cp.mile) / 2
          const to = i === cps.length - 1 ? total : (cp.mile + cps[i + 1]!.mile) / 2
          const level = levels[i] ?? null
          return (
            <span
              key={cp.index}
              className={cn('h-full', !assessed && 'skeleton')}
              style={{
                width: `${((to - from) / total) * 100}%`,
                background: assessed ? (level ? LEVEL_COLOR[level] : LEVEL_COLOR.unknown) : undefined,
              }}
              title={level ? `${LEVEL_LABEL[level]} near mile ${Math.round(cp.mile)}` : undefined}
            />
          )
        })}
      </div>
      <div className="mt-1 flex justify-between font-mono text-[10.5px] text-fg-faint">
        <span>0</span>
        <span>{formatMiles(total / 2)}</span>
        <span>{formatMiles(total)}</span>
      </div>
    </div>
  )
}
