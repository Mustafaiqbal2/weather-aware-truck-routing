import type { HeatmapResponse } from '@/lib/api/client'

export const NODATA = 255

/** Order of the variables in the packed texture's RGBA channels. */
export const CHANNELS = ['risk', 'wind', 'rain', 'snow'] as const
export type Channel = (typeof CHANNELS)[number]

export interface DecodedHeatmap {
  start: Date
  hours: number
  cols: number
  rows: number
  bounds: { west: number; south: number; east: number; north: number }
  /** RGBA bytes, `hours` frames of cols x rows stacked vertically (frame-major). */
  texture: Uint8Array
  /** One byte per cell: corridor fade, 0 outside the corridor. */
  mask: Uint8Array
  scales: Record<Channel, number>
}

function base64ToBytes(b64: string): Uint8Array {
  const bin = atob(b64)
  const out = new Uint8Array(bin.length)
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i)
  return out
}

const smoothstep = (a: number, b: number, x: number) => {
  const t = Math.min(Math.max((x - a) / (b - a), 0), 1)
  return t * t * (3 - 2 * t)
}

/** Unpack the API's per-variable byte frames into one GPU-ready RGBA texture. */
export function decodeHeatmap(data: HeatmapResponse): DecodedHeatmap {
  const { cols, rows, cells, edge } = data.grid
  const hours = data.hours
  const area = cols * rows
  const texture = new Uint8Array(area * hours * 4).fill(NODATA)
  const frames = CHANNELS.map((c) => base64ToBytes(data.frames[c]))

  for (let h = 0; h < hours; h++) {
    const frameOffset = h * area
    for (let k = 0; k < cells.length; k++) {
      const pixel = (frameOffset + cells[k]!) * 4
      const source = h * cells.length + k
      for (let c = 0; c < 4; c++) texture[pixel + c] = frames[c]![source]!
    }
  }

  // Fade out over the outer third of the corridor so the heatmap has no hard edge.
  const mask = new Uint8Array(area)
  for (let k = 0; k < cells.length; k++) {
    mask[cells[k]!] = Math.round(255 * (1 - smoothstep(0.62, 1, edge[k]!)))
  }

  return {
    start: new Date(data.start),
    hours,
    cols,
    rows,
    bounds: { west: data.grid.west, south: data.grid.south, east: data.grid.east, north: data.grid.north },
    texture,
    mask,
    scales: data.scales,
  }
}

/** Value of one channel at one cell and hour (for tests and hover readouts). */
export function sample(heat: DecodedHeatmap, channel: Channel, hour: number, cell: number): number | null {
  const byte = heat.texture[(hour * heat.cols * heat.rows + cell) * 4 + CHANNELS.indexOf(channel)]!
  return byte === NODATA ? null : byte * heat.scales[channel]
}
