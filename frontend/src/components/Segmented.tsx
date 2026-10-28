import { motion } from 'motion/react'
import { ToggleGroup } from 'radix-ui'
import { useId } from 'react'
import { cn } from '@/lib/cn'

interface Option<T extends string> {
  value: T
  label: React.ReactNode
  title?: string
}

/** Single-choice segmented control with a sliding highlight (Radix ToggleGroup + Motion). */
export function Segmented<T extends string>({
  value,
  onChange,
  options,
  label,
  className,
  size = 'md',
}: {
  value: T
  onChange: (value: T) => void
  options: Option<T>[]
  label: string
  className?: string
  size?: 'sm' | 'md'
}) {
  const layoutId = useId()
  return (
    <ToggleGroup.Root
      type="single"
      value={value}
      onValueChange={(v) => v && onChange(v as T)}
      aria-label={label}
      className={cn('relative flex rounded-lg border border-line bg-ink-900 p-0.5', className)}
    >
      {options.map((opt) => {
        const active = opt.value === value
        return (
          <ToggleGroup.Item
            key={opt.value}
            value={opt.value}
            title={opt.title}
            className={cn(
              'relative flex-1 rounded-md px-2.5 font-medium outline-offset-0 transition-colors duration-150',
              size === 'sm' ? 'h-7 text-[12px]' : 'h-8 text-[13px]',
              active ? 'text-fg' : 'text-fg-faint hover:text-fg-muted',
            )}
          >
            {active && (
              <motion.span
                layoutId={layoutId}
                className="absolute inset-0 rounded-md border border-line-strong bg-ink-750"
                transition={{ type: 'spring', stiffness: 520, damping: 40, mass: 0.6 }}
              />
            )}
            <span className="relative z-10 flex items-center justify-center gap-1.5">{opt.label}</span>
          </ToggleGroup.Item>
        )
      })}
    </ToggleGroup.Root>
  )
}
