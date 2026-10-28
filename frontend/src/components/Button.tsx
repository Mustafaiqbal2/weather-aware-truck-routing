import { cva, type VariantProps } from 'class-variance-authority'
import type { ButtonHTMLAttributes } from 'react'
import { cn } from '@/lib/cn'

const button = cva(
  'inline-flex items-center justify-center gap-2 rounded-lg font-medium whitespace-nowrap transition-[background-color,color,box-shadow,transform] duration-150 ease-out select-none active:scale-[0.98] disabled:pointer-events-none disabled:opacity-45',
  {
    variants: {
      variant: {
        primary:
          'bg-amber text-ink-950 shadow-[0_0_0_1px_rgb(255_195_92/0.4),0_8px_24px_-8px_rgb(245_165_36/0.6)] hover:bg-amber-bright',
        ghost: 'text-fg-muted hover:bg-ink-750 hover:text-fg',
        subtle: 'border border-line-strong bg-ink-800 text-fg hover:bg-ink-750',
      },
      size: {
        md: 'h-10 px-4 text-[14px]',
        sm: 'h-8 px-3 text-[13px]',
        icon: 'size-8',
      },
    },
    defaultVariants: { variant: 'subtle', size: 'md' },
  },
)

export function Button({
  className,
  variant,
  size,
  type = 'button',
  ...props
}: ButtonHTMLAttributes<HTMLButtonElement> & VariantProps<typeof button>) {
  return <button type={type} className={cn(button({ variant, size }), className)} {...props} />
}
