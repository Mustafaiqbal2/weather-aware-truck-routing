import { type LineMeasure, type LngLat, measureLine, mileToProgress, pointAtProgress } from './geo'
import type { RouteView } from './queries'
import type { Level } from './risk'

export interface Track {
  id: string
  recommended: boolean
  line: LngLat[]
  measure: LineMeasure
  miles: number
  departure: number
  arrival: number
  checkpoints: { mile: number; time: number; level: Level | null }[]
}

export function buildTracks(routes: RouteView[]): Track[] {
  return routes.map((r) => {
    const line = r.geometry as LngLat[]
    return {
      id: r.id,
      recommended: r.recommended,
      line,
      measure: measureLine(line),
      miles: r.distance_mi,
      departure: Date.parse(r.departure),
      arrival: Date.parse(r.arrival),
      checkpoints: r.checkpoints.map((cp) => ({
        mile: cp.mile,
        time: Date.parse(cp.eta),
        level:
          (r.assessment?.checkpoints.find((c) => c.index === cp.index)?.risk?.level as Level | undefined) ??
          null,
      })),
    }
  })
}

export interface TruckPosition {
  position: LngLat
  mile: number
  /** Risk where the truck is, from the checkpoint covering this stretch of road. */
  level: Level | null
  state: 'waiting' | 'driving' | 'arrived'
}

/** Where the truck is at time `t` (ms), interpolating between checkpoint ETAs. */
export function truckAt(track: Track, t: number): TruckPosition {
  const cps = track.checkpoints
  let mile: number
  let state: TruckPosition['state'] = 'driving'
  if (t <= track.departure) {
    mile = 0
    state = 'waiting'
  } else if (t >= track.arrival) {
    mile = track.miles
    state = 'arrived'
  } else {
    let i = 0
    while (i < cps.length - 2 && cps[i + 1]!.time <= t) i++
    const a = cps[i]!
    const b = cps[i + 1] ?? a
    const f = b.time > a.time ? (t - a.time) / (b.time - a.time) : 0
    mile = a.mile + (b.mile - a.mile) * Math.min(Math.max(f, 0), 1)
  }
  // The checkpoint whose stretch (halfway to each neighbour) contains this mile.
  let k = 0
  while (k < cps.length - 1 && mile > (cps[k]!.mile + cps[k + 1]!.mile) / 2) k++
  const progress = mileToProgress(track.measure, mile, track.miles)
  return {
    position: pointAtProgress(track.line, track.measure, progress),
    mile,
    level: cps[k]?.level ?? null,
    state,
  }
}
