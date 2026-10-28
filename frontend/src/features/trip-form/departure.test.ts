import { describe, expect, it } from 'vitest'
import { addDays, departureFromValue, departureValue, formatDay, isoDate } from './departure'

describe('departure helpers', () => {
  it('formats the API departure value', () => {
    const date = new Date(2026, 10, 2)
    expect(departureValue({ mode: 'schedule', date, time: '06:30' })).toBe('2026-11-02T06:30')
    expect(departureValue({ mode: 'now', date, time: '06:30' })).toBe('now')
  })

  it('parses it back for the form', () => {
    const fallback = { mode: 'now' as const, date: new Date(2026, 0, 1), time: '09:00' }
    const parsed = departureFromValue('2026-11-02T06:30', fallback)
    expect(parsed.mode).toBe('schedule')
    expect(isoDate(parsed.date)).toBe('2026-11-02')
    expect(parsed.time).toBe('06:30')
    expect(departureFromValue('now', fallback)).toEqual(fallback)
  })

  it('does calendar arithmetic across month ends', () => {
    expect(isoDate(addDays(new Date(2026, 9, 30), 3))).toBe('2026-11-02')
    expect(formatDay(new Date(2026, 10, 2))).toBe('Mon, Nov 2')
  })
})
