import { describe, expect, it } from 'vitest'
import { clockParts, formatDuration, formatMiles, toLocalInput } from './format'

describe('format', () => {
  it('formats durations and miles', () => {
    expect(formatDuration(45 * 60)).toBe('45 min')
    expect(formatDuration(15 * 3600 + 40 * 60)).toBe('15 h 40 min')
    expect(formatDuration(2 * 3600)).toBe('2 h')
    expect(formatMiles(1002.4)).toBe('1,002 mi')
    expect(formatMiles(8.44)).toBe('8.4 mi')
  })

  it('shows clock times in the place they happen', () => {
    const parts = clockParts('2026-11-02T20:30:00Z', 'America/Chicago')
    expect(parts).toEqual({ day: 'Mon', time: '2:30 PM', zone: 'CST' })
  })

  it('converts an instant to wall-clock time at the origin for the API', () => {
    expect(toLocalInput('2026-11-02T13:00:00Z', 'America/Denver')).toBe('2026-11-02T06:00')
    expect(toLocalInput('2026-07-02T13:00:00Z', 'America/Denver')).toBe('2026-07-02T07:00')
  })
})
