import { describe, expect, it } from 'vitest'
import type { RoutesRequest } from './api/client'
import { fromSearch, toSearch } from './urlState'

const request: RoutesRequest = {
  origin: { lat: 39.7392, lon: -104.9903, label: 'Denver, CO' },
  destination: { lat: 41.8781, lon: -87.6298, label: 'Chicago, IL' },
  departure: '2026-11-02T06:30',
  load_lb: 42000,
  interval_mi: 10,
}

describe('shareable links', () => {
  it('round-trips a trip through the URL', () => {
    expect(fromSearch(toSearch(request, 'storm'))).toEqual({ request, scenario: 'storm' })
    expect(fromSearch(toSearch({ ...request, departure: 'now' }, 'live'))?.request.departure).toBe('now')
  })

  it('rejects incomplete or malformed links', () => {
    expect(fromSearch('')).toBeNull()
    expect(fromSearch('o=1,2,A&d=3,4,B&load=abc')).toBeNull()
    expect(fromSearch('o=1,2,A&d=3,4,B&load=100&dep=tomorrow')).toBeNull()
  })

  it('falls back to a valid interval', () => {
    expect(fromSearch('o=1,2,A&d=3,4,B&load=100&every=7')?.request.interval_mi).toBe(25)
  })
})
