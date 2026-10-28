import { describe, expect, it } from 'vitest'
import type { LngLat } from '@/lib/geo'
import { LEVEL_COLOR } from '@/lib/risk'
import { drawGradient, riskGradient, riskSegments, sceneRoute } from './scene'

/** Stops of an ['interpolate', ['linear'], ['line-progress'], ...] expression. */
function stops(expr: unknown[]): [number, string][] {
  const flat = expr.slice(3)
  const out: [number, string][] = []
  for (let i = 0; i < flat.length; i += 2) out.push([flat[i] as number, flat[i + 1] as string])
  return out
}

const strictlyIncreasing = (s: [number, string][]) => s.every((v, i) => i === 0 || v[0] > s[i - 1]![0])

describe('drawGradient', () => {
  it('is fully transparent before drawing starts and solid when done', () => {
    expect(stops(drawGradient('#fff', 0) as unknown[]).every(([, c]) => c.startsWith('rgba(0,0,0,0'))).toBe(
      true,
    )
    expect(stops(drawGradient('#fff', 1) as unknown[])).toEqual([
      [0, '#fff'],
      [1, '#fff'],
    ])
  })

  it('cuts off at the drawn progress', () => {
    const s = stops(drawGradient('#fff', 0.4) as unknown[])
    expect(strictlyIncreasing(s)).toBe(true)
    expect(s[1]).toEqual([0.4, '#fff'])
    expect(s[2]![1]).toContain('rgba')
  })
})

describe('riskSegments + riskGradient', () => {
  const line: LngLat[] = Array.from({ length: 101 }, (_, i) => [-105 + i * 0.05, 39])
  const route = sceneRoute(
    'A',
    line,
    100,
    [0, 25, 50, 75, 100].map((mile, index) => ({ index, mile })),
  )

  it('splits the route halfway between checkpoints', () => {
    const segs = riskSegments(route, ['low', 'high', 'severe', null, 'low'])
    expect(segs).toHaveLength(5)
    expect(segs[0]!.from).toBe(0)
    expect(segs[1]!.from).toBeCloseTo(0.125, 2)
    expect(segs[4]!.to).toBe(1)
    expect(segs[2]!.color).toBe(LEVEL_COLOR.severe)
    expect(segs[3]!.color).toBe(LEVEL_COLOR.unknown)
  })

  it('produces valid, strictly increasing stops at any reveal position', () => {
    const segs = riskSegments(route, ['low', 'high', 'severe', 'moderate', 'low'])
    for (const reveal of [0.001, 0.1, 0.125, 0.33, 0.5, 0.874, 0.99, 1]) {
      const s = stops(riskGradient(segs, reveal, 1) as unknown[])
      expect(strictlyIncreasing(s)).toBe(true)
      expect(s.length).toBeGreaterThanOrEqual(2)
      expect(s[s.length - 1]![0]).toBe(1)
    }
  })

  it('shows each colour inside its own segment', () => {
    const segs = riskSegments(route, ['low', 'high', 'severe', 'moderate', 'low'])
    const s = stops(riskGradient(segs, 1, 1) as unknown[])
    const at = (p: number) => s.filter(([x]) => x <= p).at(-1)![1]
    expect(at(0.05)).toBe(LEVEL_COLOR.low)
    expect(at(0.25)).toBe(LEVEL_COLOR.high)
    expect(at(0.5)).toBe(LEVEL_COLOR.severe)
    expect(at(0.74)).toBe(LEVEL_COLOR.moderate)
  })
})
