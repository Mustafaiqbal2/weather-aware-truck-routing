import { motion, useReducedMotion } from 'motion/react'
import type { AssessedRoute } from '@/lib/api/client'
import { formatMiles } from '@/lib/format'
import { EASE_OUT } from '@/lib/motion'
import { LEVEL_COLOR, LEVEL_LABEL, LEVELS } from '@/lib/risk'

/** Stacked bar: share of the route's miles in each risk level. */
export function RiskBar({ miles }: { miles: AssessedRoute['miles'] | undefined }) {
  const reduced = useReducedMotion()
  if (!miles) return <div className="h-2 w-full skeleton rounded-full" aria-label="Assessing weather" />

  const parts = [
    ...LEVELS.map((l) => ({ key: l, value: miles[l], color: LEVEL_COLOR[l], label: LEVEL_LABEL[l] })),
    { key: 'unknown', value: miles.unknown, color: LEVEL_COLOR.unknown, label: 'Beyond forecast' },
  ].filter((p) => p.value > 0.05)
  const total = parts.reduce((s, p) => s + p.value, 0) || 1
  const description = parts.map((p) => `${p.label} ${formatMiles(p.value)}`).join(', ')

  return (
    <div
      className="flex h-2 w-full gap-px overflow-hidden rounded-full bg-ink-700"
      role="img"
      aria-label={description}
    >
      {parts.map((p, i) => (
        <motion.span
          key={p.key}
          className="h-full first:rounded-l-full last:rounded-r-full"
          style={{ background: p.color }}
          initial={reduced ? false : { flexGrow: 0 }}
          animate={{ flexGrow: p.value / total }}
          transition={{ duration: 0.9, ease: EASE_OUT, delay: reduced ? 0 : 0.08 * i }}
          title={`${p.label}: ${formatMiles(p.value)}`}
        />
      ))}
    </div>
  )
}
