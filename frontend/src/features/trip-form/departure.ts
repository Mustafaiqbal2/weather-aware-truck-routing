import { format } from 'date-fns'

export interface Departure {
  mode: 'now' | 'schedule'
  date: Date
  time: string // "HH:MM", wall clock at the origin
}

export function departureValue(d: Departure): string {
  return d.mode === 'now' ? 'now' : `${format(d.date, 'yyyy-MM-dd')}T${d.time}`
}

/** The form's departure state for an API departure value ("now" or local "YYYY-MM-DDTHH:MM"). */
export function departureFromValue(value: string, fallback: Departure): Departure {
  if (value === 'now') return { ...fallback, mode: 'now' }
  const [datePart = '', timePart = ''] = value.split('T')
  const [y, m, d] = datePart.split('-').map(Number)
  if (!y || !m || !d) return fallback
  return { mode: 'schedule', date: new Date(y, m - 1, d), time: timePart.slice(0, 5) }
}
