import { Command } from 'cmdk'
import { LoaderCircle, MapPin } from 'lucide-react'
import { Popover } from 'radix-ui'
import { useState } from 'react'
import type { PlaceInput } from '@/lib/api/client'
import { cn } from '@/lib/cn'
import { useGeocode } from '@/lib/queries'
import { useDebounced } from '@/lib/useDebounced'

/** Address autocomplete: cmdk for keyboard navigation, Radix Popover for positioning. */
export function PlaceField({
  label,
  value,
  onChange,
  marker,
  autoFocus,
}: {
  label: string
  value: PlaceInput | null
  onChange: (place: PlaceInput | null) => void
  marker: 'origin' | 'destination'
  autoFocus?: boolean
}) {
  const [text, setText] = useState(value?.label ?? '')
  const [open, setOpen] = useState(false)
  const query = useDebounced(text, 220)
  const editing = open && text.trim().length >= 3 && text !== value?.label
  const { data, isFetching, error } = useGeocode(editing ? query : '')

  // Keep the text in sync when the value is set from outside (examples, swap).
  const [syncedValue, setSyncedValue] = useState(value)
  if (value !== syncedValue) {
    setSyncedValue(value)
    setText(value?.label ?? '')
  }

  const choose = (place: PlaceInput) => {
    onChange(place)
    setText(place.label)
    setOpen(false)
  }

  return (
    <Command shouldFilter={false} loop className="relative" label={label}>
      <Popover.Root open={editing} onOpenChange={setOpen}>
        <Popover.Anchor asChild>
          <label className="group flex h-11 items-center gap-3 rounded-lg border border-line bg-ink-900 pr-11 pl-3 transition-colors focus-within:border-amber/60 hover:border-line-strong">
            <span
              className={cn(
                'grid size-5 shrink-0 place-items-center rounded-full',
                marker === 'origin' ? 'bg-ink-700' : 'bg-amber-soft',
              )}
              aria-hidden
            >
              <span
                className={cn(
                  'size-2 rounded-full',
                  marker === 'origin' ? 'border-2 border-fg-muted' : 'bg-amber',
                )}
              />
            </span>
            <span className="sr-only">{label}</span>
            <Command.Input
              value={text}
              onValueChange={(v) => {
                setText(v)
                setOpen(true)
                if (value && v !== value.label) onChange(null)
              }}
              onFocus={() => setOpen(true)}
              onBlur={() => window.setTimeout(() => setOpen(false), 120)}
              placeholder={label}
              autoFocus={autoFocus}
              className="h-full min-w-0 flex-1 bg-transparent text-[14px] text-fg outline-none placeholder:text-fg-faint"
            />
            {isFetching && (
              <LoaderCircle className="size-4 shrink-0 animate-spin text-fg-faint" aria-hidden />
            )}
          </label>
        </Popover.Anchor>
        <Popover.Portal>
          <Popover.Content
            align="start"
            sideOffset={6}
            onOpenAutoFocus={(e) => e.preventDefault()}
            onInteractOutside={(e) => e.preventDefault()}
            className="z-50 w-[var(--radix-popover-trigger-width)] overflow-hidden rounded-xl border border-line-strong bg-ink-800 p-1 shadow-[0_16px_48px_rgb(0_0_0/0.55)] data-[state=open]:animate-in data-[state=open]:fade-in-0 data-[state=open]:zoom-in-[0.98]"
          >
            <Command.List className="max-h-72 overflow-y-auto">
              {error ? (
                <p className="px-3 py-2.5 text-[13px] text-risk-severe">{error.message}</p>
              ) : (
                <Command.Empty className="px-3 py-2.5 text-[13px] text-fg-faint">
                  {isFetching ? 'Searching…' : 'No places found in the US or Canada.'}
                </Command.Empty>
              )}
              {data?.map((place) => (
                <Command.Item
                  key={place.id}
                  value={place.id}
                  onSelect={() => choose({ lat: place.lat, lon: place.lon, label: place.label })}
                  onMouseDown={(e) => e.preventDefault()}
                  className="flex cursor-pointer items-start gap-2.5 rounded-lg px-2.5 py-2 text-[13px] data-[selected=true]:bg-ink-700"
                >
                  <MapPin className="mt-0.5 size-3.5 shrink-0 text-fg-faint" aria-hidden />
                  <span className="min-w-0">
                    <span className="block truncate text-fg">{place.label}</span>
                    {place.detail && place.detail !== place.label && (
                      <span className="block truncate text-[12px] text-fg-faint">{place.detail}</span>
                    )}
                  </span>
                </Command.Item>
              ))}
            </Command.List>
          </Popover.Content>
        </Popover.Portal>
      </Popover.Root>
    </Command>
  )
}
