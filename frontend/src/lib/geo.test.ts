import { describe, expect, it } from 'vitest'
import {
  bounds,
  LABEL_BOX,
  labelAnchors,
  decimate,
  haversineMiles,
  type LngLat,
  measureLine,
  mileToProgress,
  pointAtProgress,
  toMercator,
} from './geo'

describe('haversineMiles', () => {
  it('measures one degree of longitude on the equator', () => {
    expect(haversineMiles([0, 0], [1, 0])).toBeCloseTo(69.09, 1)
  })
})

describe('toMercator', () => {
  it('maps the null island to the centre of the world square', () => {
    expect(toMercator([0, 0])).toEqual([0.5, 0.5])
  })
  it('puts the north up (smaller y)', () => {
    expect(toMercator([0, 60])[1]).toBeLessThan(toMercator([0, 30])[1])
  })
})

describe('mileToProgress', () => {
  // A route heading due north from 30°N to 60°N: Mercator stretches the northern part,
  // so the halfway mile sits *before* the halfway point of the drawn line.
  const line: LngLat[] = Array.from({ length: 61 }, (_, i) => [0, 30 + i * 0.5])
  const measure = measureLine(line)
  const miles = measure.miles[measure.miles.length - 1]!

  it('maps the ends to 0 and 1', () => {
    expect(mileToProgress(measure, 0, miles)).toBe(0)
    expect(mileToProgress(measure, miles, miles)).toBeCloseTo(1, 10)
  })

  it('accounts for Mercator stretching', () => {
    const half = mileToProgress(measure, miles / 2, miles)
    expect(half).toBeLessThan(0.45)
    expect(half).toBeGreaterThan(0.3)
  })

  it('round-trips with pointAtProgress', () => {
    const p = mileToProgress(measure, miles / 2, miles)
    const [, lat] = pointAtProgress(line, measure, p)
    expect(lat).toBeCloseTo(45, 1)
  })

  it('rescales backend miles onto the drawn (simplified) line', () => {
    // Backend says the route is 2% longer than the drawn line: same fractional position.
    expect(mileToProgress(measure, miles * 1.02 * 0.5, miles * 1.02)).toBeCloseTo(
      mileToProgress(measure, miles * 0.5, miles),
      10,
    )
  })
})

describe('bounds and decimate', () => {
  it('finds the bounding box of several lines', () => {
    expect(
      bounds([
        [
          [-105, 39],
          [-100, 41],
        ],
        [[-110, 38]],
      ]),
    ).toEqual([
      [-110, 38],
      [-100, 41],
    ])
  })

  it('keeps the first and last points', () => {
    const line: LngLat[] = Array.from({ length: 1000 }, (_, i) => [i, 0])
    const d = decimate(line, 10)
    expect(d).toHaveLength(10)
    expect(d[0]).toEqual([0, 0])
    expect(d[9]).toEqual([999, 0])
  })
})

describe('labelAnchors', () => {
  it('keeps labels of three close, parallel routes from overlapping', () => {
    const line = (lat: number): LngLat[] => Array.from({ length: 200 }, (_, i) => [-105 + i * 0.09, lat])
    const lines = [line(40), line(40.15), line(40.3)]
    const pxPerUnit = 512 * 2 ** 5.5
    const anchors = labelAnchors(lines, pxPerUnit)
    const boxes = anchors.map((a) => {
      const [x, y] = toMercator(a).map((v) => v * pxPerUnit) as [number, number]
      return { x0: x - LABEL_BOX.width / 2, x1: x + LABEL_BOX.width / 2, y0: y - LABEL_BOX.height, y1: y }
    })
    for (let i = 0; i < boxes.length; i++) {
      for (let j = i + 1; j < boxes.length; j++) {
        const a = boxes[i]!
        const b = boxes[j]!
        const overlaps = a.x0 < b.x1 && b.x0 < a.x1 && a.y0 < b.y1 && b.y0 < a.y1
        expect(overlaps).toBe(false)
      }
    }
  })
})
