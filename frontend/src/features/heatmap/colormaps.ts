import type { Channel } from './decode'

/**
 * Colour ramps for the heatmap, defined in each variable's real units. Calm conditions
 * are transparent so the map stays readable; colour and opacity grow with the hazard.
 */
export interface RampStop {
  value: number
  color: string
  alpha: number
}

export interface Ramp {
  label: string
  unit: string
  /** Value range shown in the legend. */
  max: number
  stops: RampStop[]
  /** Values worth labelling in the legend (risk thresholds). */
  ticks: { value: number; label: string }[]
}

export const RAMPS: Record<Channel, Ramp> = {
  risk: {
    label: 'Risk',
    unit: '',
    max: 4,
    stops: [
      { value: 0, color: '#3fb8af', alpha: 0 },
      { value: 0.75, color: '#3fb8af', alpha: 0.08 },
      { value: 1, color: '#f2d13d', alpha: 0.34 },
      { value: 2, color: '#ff8a3d', alpha: 0.46 },
      { value: 3, color: '#e5484d', alpha: 0.56 },
      { value: 4, color: '#c04cf5', alpha: 0.66 },
    ],
    ticks: [
      { value: 0.5, label: 'Low' },
      { value: 1.5, label: 'Mod' },
      { value: 2.5, label: 'High' },
      { value: 3.5, label: 'Sev' },
      { value: 4, label: 'No' },
    ],
  },
  wind: {
    label: 'Wind',
    unit: 'mph',
    max: 65,
    stops: [
      { value: 0, color: '#2563eb', alpha: 0 },
      { value: 12, color: '#38bdf8', alpha: 0.06 },
      { value: 25, color: '#5eead4', alpha: 0.3 },
      { value: 35, color: '#f2d13d', alpha: 0.42 },
      { value: 45, color: '#ff8a3d', alpha: 0.52 },
      { value: 55, color: '#e5484d', alpha: 0.62 },
      { value: 65, color: '#c04cf5', alpha: 0.66 },
    ],
    ticks: [
      { value: 25, label: '25' },
      { value: 35, label: '35' },
      { value: 45, label: '45' },
      { value: 55, label: '55' },
    ],
  },
  rain: {
    label: 'Rain',
    unit: 'in/hr',
    max: 1.2,
    stops: [
      { value: 0, color: '#38bdf8', alpha: 0 },
      { value: 0.01, color: '#38bdf8', alpha: 0.12 },
      { value: 0.1, color: '#3b82f6', alpha: 0.36 },
      { value: 0.25, color: '#6366f1', alpha: 0.48 },
      { value: 0.5, color: '#a855f7', alpha: 0.58 },
      { value: 1, color: '#e879f9', alpha: 0.66 },
    ],
    ticks: [
      { value: 0.1, label: '.10' },
      { value: 0.25, label: '.25' },
      { value: 0.5, label: '.50' },
      { value: 1, label: '1.0' },
    ],
  },
  snow: {
    label: 'Snow',
    unit: 'in/hr',
    max: 3.5,
    stops: [
      { value: 0, color: '#cbd5e1', alpha: 0 },
      { value: 0.05, color: '#cbd5e1', alpha: 0.14 },
      { value: 0.5, color: '#e2e8f0', alpha: 0.34 },
      { value: 1, color: '#f8fafc', alpha: 0.46 },
      { value: 2, color: '#c7d2fe', alpha: 0.56 },
      { value: 3, color: '#a5b4fc', alpha: 0.66 },
    ],
    ticks: [
      { value: 0.5, label: '0.5' },
      { value: 1, label: '1' },
      { value: 2, label: '2' },
      { value: 3, label: '3' },
    ],
  },
}

function hexToRgb(hex: string): [number, number, number] {
  const n = Number.parseInt(hex.slice(1), 16)
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255]
}

/** Colour and opacity of a ramp at a value, interpolated between stops. */
export function rampColor(ramp: Ramp, value: number): [number, number, number, number] {
  const { stops } = ramp
  if (value <= stops[0]!.value) {
    const s = stops[0]!
    return [...hexToRgb(s.color), s.alpha]
  }
  for (let i = 1; i < stops.length; i++) {
    const b = stops[i]!
    if (value <= b.value) {
      const a = stops[i - 1]!
      const t = (value - a.value) / (b.value - a.value)
      const ca = hexToRgb(a.color)
      const cb = hexToRgb(b.color)
      return [
        ca[0] + (cb[0] - ca[0]) * t,
        ca[1] + (cb[1] - ca[1]) * t,
        ca[2] + (cb[2] - ca[2]) * t,
        a.alpha + (b.alpha - a.alpha) * t,
      ]
    }
  }
  const last = stops[stops.length - 1]!
  return [...hexToRgb(last.color), last.alpha]
}

/**
 * A 256 x 4 lookup texture (one row per channel), indexed by the raw byte the API sends,
 * so the shader maps bytes to colours with a single texture read. Premultiplied alpha.
 */
export function buildLookup(scales: Record<Channel, number>): Uint8Array {
  const order: Channel[] = ['risk', 'wind', 'rain', 'snow']
  const lut = new Uint8Array(256 * 4 * 4)
  order.forEach((channel, row) => {
    for (let byte = 0; byte < 256; byte++) {
      const [r, g, b, a] = byte === 255 ? [0, 0, 0, 0] : rampColor(RAMPS[channel], byte * scales[channel])
      const o = (row * 256 + byte) * 4
      lut[o] = Math.round(r * a)
      lut[o + 1] = Math.round(g * a)
      lut[o + 2] = Math.round(b * a)
      lut[o + 3] = Math.round(a * 255)
    }
  })
  return lut
}
