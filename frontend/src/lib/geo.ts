/**
 * Geometry helpers for drawing routes on a Web Mercator map.
 *
 * Route mileage comes from the backend (great-circle distance). MapLibre's
 * `line-progress`, used for risk-coloured route lines, measures progress in Web Mercator
 * instead, which stretches distances by 1/cos(latitude). Converting between the two keeps
 * every colour change on the line exactly where the checkpoint boundary is on the ground.
 */

export type LngLat = [number, number]

const EARTH_RADIUS_MI = 3958.7613

export function haversineMiles(a: LngLat, b: LngLat): number {
  const toRad = Math.PI / 180
  const dLat = (b[1] - a[1]) * toRad
  const dLon = (b[0] - a[0]) * toRad
  const h =
    Math.sin(dLat / 2) ** 2 + Math.cos(a[1] * toRad) * Math.cos(b[1] * toRad) * Math.sin(dLon / 2) ** 2
  return 2 * EARTH_RADIUS_MI * Math.asin(Math.min(1, Math.sqrt(h)))
}

/** Web Mercator in the 0..1 world square ([0,0] is top-left), like MapLibre's MercatorCoordinate. */
export function toMercator([lng, lat]: LngLat): [number, number] {
  const x = (lng + 180) / 360
  const sin = Math.sin((lat * Math.PI) / 180)
  const y = 0.5 - Math.log((1 + sin) / (1 - sin)) / (4 * Math.PI)
  return [x, y]
}

export interface LineMeasure {
  /** Cumulative great-circle miles at each vertex. */
  miles: Float64Array
  /** Cumulative Web Mercator length at each vertex. */
  mercator: Float64Array
}

export function measureLine(line: LngLat[]): LineMeasure {
  const miles = new Float64Array(line.length)
  const mercator = new Float64Array(line.length)
  let prev = toMercator(line[0]!)
  for (let i = 1; i < line.length; i++) {
    const a = line[i - 1]!
    const b = line[i]!
    const m = toMercator(b)
    miles[i] = miles[i - 1]! + haversineMiles(a, b)
    mercator[i] = mercator[i - 1]! + Math.hypot(m[0] - prev[0], m[1] - prev[1])
    prev = m
  }
  return { miles, mercator }
}

/** Index of the segment containing `value` in an ascending array (binary search). */
function segmentIndex(cum: Float64Array, value: number): number {
  let lo = 0
  let hi = cum.length - 1
  while (hi - lo > 1) {
    const mid = (lo + hi) >> 1
    if (cum[mid]! <= value) lo = mid
    else hi = mid
  }
  return lo
}

/** Convert a mile position along the route into MapLibre line-progress (0..1). */
export function mileToProgress(measure: LineMeasure, mile: number, routeMiles: number): number {
  const { miles, mercator } = measure
  const total = miles[miles.length - 1]!
  // Scale backend miles (full-resolution geometry) onto the simplified line we draw.
  const target = Math.min(Math.max((mile / routeMiles) * total, 0), total)
  const i = segmentIndex(miles, target)
  const span = miles[i + 1]! - miles[i]!
  const f = span > 0 ? (target - miles[i]!) / span : 0
  const m = mercator[i]! + f * (mercator[i + 1]! - mercator[i]!)
  return m / mercator[mercator.length - 1]!
}

/** Point at a given line-progress (0..1) along the line. */
export function pointAtProgress(line: LngLat[], measure: LineMeasure, progress: number): LngLat {
  const { mercator } = measure
  const target = Math.min(Math.max(progress, 0), 1) * mercator[mercator.length - 1]!
  const i = Math.min(segmentIndex(mercator, target), line.length - 2)
  const span = mercator[i + 1]! - mercator[i]!
  const f = span > 0 ? (target - mercator[i]!) / span : 0
  const a = line[i]!
  const b = line[i + 1]!
  return [a[0] + (b[0] - a[0]) * f, a[1] + (b[1] - a[1]) * f]
}

export function bounds(lines: LngLat[][]): [LngLat, LngLat] {
  let w = 180
  let s = 90
  let e = -180
  let n = -90
  for (const line of lines) {
    for (const [x, y] of line) {
      if (x < w) w = x
      if (x > e) e = x
      if (y < s) s = y
      if (y > n) n = y
    }
  }
  return [
    [w, s],
    [e, n],
  ]
}

/**
 * Where to put each route's label so labels don't collide: the point in the middle half
 * of each route that is farthest (in screen-proportional Mercator units) from the others.
 */
export function labelAnchors(lines: LngLat[][]): LngLat[] {
  const decimated = lines.map((line) => {
    const step = Math.max(1, Math.floor(line.length / 120))
    return line.filter((_, i) => i % step === 0).map(toMercator)
  })
  return lines.map((line, r) => {
    const measure = measureLine(line)
    let best: LngLat = pointAtProgress(line, measure, 0.5)
    let bestScore = -1
    for (let p = 0.3; p <= 0.701; p += 0.05) {
      const candidate = pointAtProgress(line, measure, p)
      const m = toMercator(candidate)
      let nearest = Infinity
      decimated.forEach((other, o) => {
        if (o === r) return
        for (const q of other) nearest = Math.min(nearest, Math.hypot(q[0] - m[0], q[1] - m[1]))
      })
      const score = nearest === Infinity ? 1 - Math.abs(p - 0.5) : nearest
      if (score > bestScore) {
        bestScore = score
        best = candidate
      }
    }
    return best
  })
}

/** Keep at most `max` points (always the first and last) for compact request bodies. */
export function decimate(line: LngLat[], max: number): LngLat[] {
  if (line.length <= max) return line
  const step = (line.length - 1) / (max - 1)
  return Array.from({ length: max }, (_, i) => line[Math.round(i * step)]!)
}
