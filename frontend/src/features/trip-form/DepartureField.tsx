import 'react-day-picker/style.css'
import { addDays, format, startOfDay } from 'date-fns'
import { CalendarDays } from 'lucide-react'
import { AnimatePresence, motion } from 'motion/react'
import { Popover } from 'radix-ui'
import { useState } from 'react'
import { DayPicker } from 'react-day-picker'
import { Segmented } from '@/components/Segmented'
import { EASE_OUT } from '@/lib/motion'
import type { Departure } from './departure'

export function DepartureField({
  value,
  onChange,
  originLabel,
}: {
  value: Departure
  onChange: (d: Departure) => void
  originLabel: string | undefined
}) {
  const [calendarOpen, setCalendarOpen] = useState(false)
  const [today] = useState(() => startOfDay(new Date()))

  return (
    <div className="space-y-2">
      <Segmented
        label="Departure"
        value={value.mode}
        onChange={(mode) => onChange({ ...value, mode })}
        options={[
          { value: 'now', label: 'Leave now' },
          { value: 'schedule', label: 'Schedule' },
        ]}
      />
      <AnimatePresence initial={false}>
        {value.mode === 'schedule' && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.28, ease: EASE_OUT }}
            className="overflow-hidden"
          >
            <div className="flex gap-2 pt-0.5">
              <Popover.Root open={calendarOpen} onOpenChange={setCalendarOpen}>
                <Popover.Trigger className="flex h-10 flex-1 items-center gap-2 rounded-lg border border-line bg-ink-900 px-3 text-left text-[13.5px] text-fg hover:border-line-strong">
                  <CalendarDays className="size-4 text-fg-faint" aria-hidden />
                  {format(value.date, 'EEE, MMM d')}
                </Popover.Trigger>
                <Popover.Portal>
                  <Popover.Content
                    align="start"
                    sideOffset={6}
                    className="z-50 rounded-xl border border-line-strong bg-ink-800 p-3 shadow-[0_16px_48px_rgb(0_0_0/0.55)] data-[state=open]:animate-in data-[state=open]:fade-in-0"
                  >
                    <DayPicker
                      mode="single"
                      required
                      selected={value.date}
                      onSelect={(date) => {
                        if (date) onChange({ ...value, date })
                        setCalendarOpen(false)
                      }}
                      disabled={[{ before: today }, { after: addDays(today, 6) }]}
                      showOutsideDays={false}
                    />
                  </Popover.Content>
                </Popover.Portal>
              </Popover.Root>
              <input
                type="time"
                step={900}
                value={value.time}
                onChange={(e) => onChange({ ...value, time: e.target.value })}
                aria-label="Departure time"
                className="h-10 w-[118px] rounded-lg border border-line bg-ink-900 px-3 font-mono text-[13.5px] text-fg outline-none hover:border-line-strong focus:border-amber/60"
              />
            </div>
            <p className="pt-1.5 text-[11.5px] text-fg-faint">
              Local time{originLabel ? ` in ${originLabel.split(',')[0]}` : ' at the origin'}. Forecasts reach
              7 days out.
            </p>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  )
}
