import { cn } from '@/lib/cn'
import { LEVEL_COLOR, LEVEL_LABEL, type Level } from '@/lib/risk'

/** Risk level as colour plus text, never colour alone. */
export function RiskChip({ level, className }: { level: Level | null; className?: string }) {
  const color = level ? LEVEL_COLOR[level] : LEVEL_COLOR.unknown
  return (
    <span
      className={cn(
        'inline-flex h-5 items-center gap-1.5 rounded-full px-2 text-[11px] font-semibold tracking-wide whitespace-nowrap',
        className,
      )}
      style={{ background: `${color}22`, color, boxShadow: `inset 0 0 0 1px ${color}40` }}
    >
      {level === 'no_travel' ? (
        <svg viewBox="0 0 12 12" className="size-2.5" aria-hidden>
          <circle cx="6" cy="6" r="5" fill="none" stroke="currentColor" strokeWidth="1.6" />
          <path d="M3.2 6h5.6" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
        </svg>
      ) : (
        <span className="size-1.5 rounded-full" style={{ background: color }} />
      )}
      {level ? LEVEL_LABEL[level] : 'No data'}
    </span>
  )
}
