export interface Departure {
  mode: 'now' | 'schedule'
  date: Date
  time: string // "HH:MM", wall clock at the origin
}

export function departureValue(d: Departure): string {
  return d.mode === 'now' ? 'now' : `${isoDate(d.date)}T${d.time}`
}

/** The form's departure state for an API departure value ("now" or local "YYYY-MM-DDTHH:MM"). */
export function departureFromValue(value: string, fallback: Departure): Departure {
  if (value === 'now') return { ...fallback, mode: 'now' }
  const [datePart = '', timePart = ''] = value.split('T')
  const [y, m, d] = datePart.split('-').map(Number)
  if (!y || !m || !d) return fallback
  return { mode: 'schedule', date: new Date(y, m - 1, d), time: timePart.slice(0, 5) }
}

const pad = (n: number) => String(n).padStart(2, '0')

/** Calendar date as YYYY-MM-DD in the browser's local calendar. */
export function isoDate(date: Date): string {
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`
}

export function startOfDay(date: Date): Date {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate())
}

export function addDays(date: Date, days: number): Date {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate() + days)
}

const dayLabel = new Intl.DateTimeFormat('en-US', { weekday: 'short', month: 'short', day: 'numeric' })

/** "Mon, Nov 2" */
export function formatDay(date: Date): string {
  return dayLabel.format(date)
}
