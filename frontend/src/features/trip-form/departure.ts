import { format } from 'date-fns'

export interface Departure {
  mode: 'now' | 'schedule'
  date: Date
  time: string // "HH:MM", wall clock at the origin
}

export function departureValue(d: Departure): string {
  return d.mode === 'now' ? 'now' : `${format(d.date, 'yyyy-MM-dd')}T${d.time}`
}
