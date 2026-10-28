import type { ExpressionSpecification, Map as MapLibreMap } from 'maplibre-gl'
import type { RouteId } from '@/lib/api/client'
import { type LineMeasure, type LngLat, measureLine, mileToProgress } from '@/lib/geo'
import { LEVEL_COLOR, type Level } from '@/lib/risk'

/**
 * Imperative owner of every animated map paint property: route draw-on, the risk-colour
 * wipe, focus/hover emphasis and checkpoint reveal. React declares the layers once; this
 * class changes their paint, so animation frames never go through React.
 */

export const ROUTE_IDS: RouteId[] = ['A', 'B', 'C']
export const CHECKPOINT_LAYER = 'checkpoints'
export const CHECKPOINT_RING_LAYER = 'checkpoint-ring'

const NEUTRAL = '#c3cad6'
const TRANSPARENT = 'rgba(0,0,0,0)'
const SOFT_EDGE = 0.0025 // progress units: colour changes blend over a short stretch

export interface SceneCheckpoint {
  index: number
  progress: number
  mile: number
}

export interface SceneRoute {
  id: RouteId
  line: LngLat[]
  measure: LineMeasure
  miles: number
  checkpoints: SceneCheckpoint[]
}

export interface RiskSegment {
  from: number
  to: number
  color: string
}

export function sceneRoute(
  id: RouteId,
  line: LngLat[],
  miles: number,
  checkpoints: { index: number; mile: number }[],
): SceneRoute {
  const measure = measureLine(line)
  return {
    id,
    line,
    measure,
    miles,
    checkpoints: checkpoints.map((c) => ({
      index: c.index,
      mile: c.mile,
      progress: mileToProgress(measure, c.mile, miles),
    })),
  }
}

/** Each checkpoint colours the road halfway to its neighbours, matching the backend's miles. */
export function riskSegments(route: SceneRoute, levels: (Level | null)[]): RiskSegment[] {
  const cps = route.checkpoints
  return cps.map((cp, i) => {
    const from = i === 0 ? 0 : (cps[i - 1]!.progress + cp.progress) / 2
    const to = i === cps.length - 1 ? 1 : (cp.progress + cps[i + 1]!.progress) / 2
    const level = levels[i]
    return { from, to, color: level ? LEVEL_COLOR[level] : LEVEL_COLOR.unknown }
  })
}

const gradient = (stops: [number, string][]): ExpressionSpecification =>
  ['interpolate', ['linear'], ['line-progress'], ...stops.flat()] as ExpressionSpecification

const EMPTY = gradient([
  [0, TRANSPARENT],
  [1, TRANSPARENT],
])

/** line-gradient: solid colour up to `p`, transparent after. */
export function drawGradient(color: string, p: number): ExpressionSpecification {
  if (p <= 0) return EMPTY
  if (p >= 0.999) {
    return gradient([
      [0, color],
      [1, color],
    ])
  }
  return gradient([
    [0, color],
    [p, color],
    [p + 0.0005, TRANSPARENT],
    [1, TRANSPARENT],
  ])
}

/**
 * line-gradient: each segment's risk colour, blended softly at boundaries, shown up to
 * `wipe` (the reveal animation) and never past `draw` (the line drawn so far).
 */
export function riskGradient(segments: RiskSegment[], wipe: number, draw: number): ExpressionSpecification {
  const end = Math.min(wipe, draw)
  if (end <= 0 || segments.length === 0) return EMPTY
  const stops: [number, string][] = []
  const add = (x: number, color: string) => {
    const prev = stops[stops.length - 1]
    if (prev && x <= prev[0]) return
    stops.push([Math.min(x, 1), color])
  }
  for (const seg of segments) {
    if (seg.from >= end) break
    const mid = (seg.from + seg.to) / 2
    const a = seg.from <= 0 ? 0 : Math.min(seg.from + SOFT_EDGE, mid)
    const b = seg.to >= 1 ? 1 : Math.max(seg.to - SOFT_EDGE, mid)
    add(a, seg.color)
    add(Math.min(b, end), seg.color)
  }
  if (end < 1) {
    add(end + 0.0005, TRANSPARENT)
    add(1, TRANSPARENT)
  }
  if (stops.length === 1) add(1, stops[0]![1])
  return gradient(stops)
}

interface Focus {
  selected: RouteId | null
  hovered: RouteId | null
  recommended: RouteId | null
}

export class RouteScene {
  readonly draw: Partial<Record<RouteId, number>> = {}
  readonly wipe: Partial<Record<RouteId, number>> = {}
  private routes: SceneRoute[] = []
  private risk: Partial<Record<RouteId, RiskSegment[]>> = {}
  private focus: Focus = { selected: null, hovered: null, recommended: null }
  private map: MapLibreMap

  constructor(map: MapLibreMap) {
    this.map = map
  }

  setRoutes(routes: SceneRoute[]): void {
    this.routes = routes
    this.risk = {}
    for (const id of ROUTE_IDS) {
      this.draw[id] = 0
      this.wipe[id] = 0
    }
  }

  setRisk(id: RouteId, segments: RiskSegment[]): void {
    this.risk[id] = segments
  }

  setFocus(focus: Focus): void {
    this.focus = focus
    this.apply()
  }

  /** The route that gets emphasis: hovered, else selected, else recommended. */
  get emphasised(): RouteId | null {
    return this.focus.hovered ?? this.focus.selected ?? this.focus.recommended
  }

  apply(): void {
    const map = this.map
    const emphasised = this.emphasised
    for (const route of this.routes) {
      const id = route.id
      if (!map.getLayer(`route-base-${id}`)) continue
      const isEmph = emphasised === id
      const dim = emphasised !== null && !isEmph
      const isRec = this.focus.recommended === id
      const width = isEmph ? 6 : isRec ? 5 : 3.5
      const opacity = dim ? 0.42 : 1
      const draw = this.draw[id] ?? 0
      const wipe = this.wipe[id] ?? 0

      map.setPaintProperty(`route-base-${id}`, 'line-gradient', drawGradient(NEUTRAL, draw))
      map.setPaintProperty(`route-base-${id}`, 'line-width', width)
      map.setPaintProperty(`route-base-${id}`, 'line-opacity', opacity * (wipe >= 1 ? 0 : 0.9))
      map.setPaintProperty(`route-risk-${id}`, 'line-gradient', riskGradient(this.risk[id] ?? [], wipe, draw))
      map.setPaintProperty(`route-risk-${id}`, 'line-width', width)
      map.setPaintProperty(`route-risk-${id}`, 'line-opacity', opacity)
      map.setPaintProperty(`route-casing-${id}`, 'line-width', width + 4)
      map.setPaintProperty(`route-casing-${id}`, 'line-opacity', (dim ? 0.35 : 0.9) * Math.min(draw * 4, 1))
      map.setPaintProperty(`route-glow-${id}`, 'line-opacity', isRec && !dim ? 0.3 * draw : 0)
    }
    this.applyCheckpoints(emphasised)
  }

  private applyCheckpoints(emphasised: RouteId | null): void {
    if (!this.map.getLayer(CHECKPOINT_LAYER)) return
    const ids = this.routes.map((r) => r.id)
    if (ids.length === 0) return
    const byRoute = (pick: (id: RouteId) => ExpressionSpecification | number) =>
      [
        'match',
        ['get', 'routeId'],
        ...ids.flatMap((id) => [id, pick(id)]),
        0,
      ] as unknown as ExpressionSpecification
    const reveal = byRoute((id) => ['step', ['get', 'p'], 1, (this.draw[id] ?? 0) + 1e-6, 0])
    const emphasis = byRoute((id) => (emphasised === null || emphasised === id ? 1 : 0.35))
    const opacity: ExpressionSpecification = ['*', reveal, emphasis]
    this.map.setPaintProperty(CHECKPOINT_LAYER, 'circle-opacity', opacity)
    this.map.setPaintProperty(CHECKPOINT_LAYER, 'circle-stroke-opacity', opacity)
    this.map.setPaintProperty(CHECKPOINT_LAYER, 'circle-radius', [
      'interpolate',
      ['linear'],
      ['zoom'],
      3,
      byRoute((id) => (emphasised === id ? 3.6 : 2.4)),
      9,
      byRoute((id) => (emphasised === id ? 8 : 5)),
    ])
  }
}
