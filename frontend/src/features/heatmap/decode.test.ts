import { describe, expect, it } from 'vitest'
import type { HeatmapResponse } from '@/lib/api/client'
import { buildLookup, RAMPS, rampColor } from './colormaps'
import { decodeHeatmap, NODATA, sample } from './decode'

const toB64 = (bytes: number[]) => btoa(String.fromCharCode(...bytes))

// A 3 x 2 grid with two corridor cells (indices 1 and 4) and two hours.
const response: HeatmapResponse = {
  start: '2026-11-02T12:00:00Z',
  hours: 2,
  grid: { west: -105, south: 39, east: -100, north: 41, cols: 3, rows: 2, cells: [1, 4], edge: [0, 0.9] },
  scales: { risk: 4 / 250, wind: 0.5, rain: 0.01, snow: 0.02 },
  nodata: 255,
  scenario: 'live',
  frames: {
    risk: toB64([10, 20, 30, 40]), // hour-major: [h0c1, h0c4, h1c1, h1c4]
    wind: toB64([50, 60, 70, 80]),
    rain: toB64([1, 2, 3, 4]),
    snow: toB64([5, 6, 7, 8]),
  },
}

describe('decodeHeatmap', () => {
  const heat = decodeHeatmap(response)

  it('places corridor cells at their grid position in each hourly frame', () => {
    expect(sample(heat, 'wind', 0, 1)).toBe(25)
    expect(sample(heat, 'wind', 0, 4)).toBe(30)
    expect(sample(heat, 'wind', 1, 1)).toBe(35)
    expect(sample(heat, 'snow', 1, 4)).toBeCloseTo(0.16)
    expect(sample(heat, 'risk', 0, 1)).toBeCloseTo(0.16)
  })

  it('marks cells outside the corridor as no data', () => {
    expect(sample(heat, 'wind', 0, 0)).toBeNull()
    expect(heat.texture.length).toBe(3 * 2 * 2 * 4)
    expect(heat.texture[0]).toBe(NODATA)
  })

  it('fades the mask towards the corridor edge', () => {
    expect(heat.mask[1]).toBe(255)
    expect(heat.mask[4]).toBeGreaterThan(0)
    expect(heat.mask[4]).toBeLessThan(80)
    expect(heat.mask[0]).toBe(0)
  })
})

describe('colour lookup', () => {
  it('is transparent for calm conditions and opaque-ish for severe ones', () => {
    expect(rampColor(RAMPS.wind, 0)[3]).toBe(0)
    expect(rampColor(RAMPS.wind, 55)[3]).toBeGreaterThan(0.5)
  })

  it('interpolates between stops', () => {
    const [r, g, b, a] = rampColor(RAMPS.risk, 2.5)
    const high = rampColor(RAMPS.risk, 2)
    const severe = rampColor(RAMPS.risk, 3)
    expect(a).toBeCloseTo((high[3] + severe[3]) / 2)
    expect(r).toBeCloseTo((high[0] + severe[0]) / 2)
    expect(g).toBeCloseTo((high[1] + severe[1]) / 2)
    expect(b).toBeCloseTo((high[2] + severe[2]) / 2)
  })

  it('builds a premultiplied 256 x 4 table with no-data transparent', () => {
    const lut = buildLookup(response.scales)
    expect(lut.length).toBe(256 * 4 * 4)
    const noData = (1 * 256 + 255) * 4 // wind row, byte 255
    expect(Array.from(lut.slice(noData, noData + 4))).toEqual([0, 0, 0, 0])
    const severeWind = (1 * 256 + 110) * 4 // 55 mph
    const [r, , , a] = Array.from(lut.slice(severeWind, severeWind + 4))
    expect(a).toBeGreaterThan(128)
    expect(r).toBeLessThanOrEqual(a!) // premultiplied: colour never exceeds alpha
  })
})
