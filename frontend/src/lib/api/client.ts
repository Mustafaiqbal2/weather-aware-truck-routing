import createClient from 'openapi-fetch'
import type { components, paths } from './schema'

type Schemas = components['schemas']
export type RoutesRequest = Schemas['RoutesRequestRequest']
export type RoutesResponse = Schemas['RoutesResponse']
export type Route = Schemas['RouteOut']
export type Checkpoint = Schemas['CheckpointOut']
export type AssessResponse = Schemas['AssessResponse']
export type AssessedRoute = Schemas['AssessedRoute']
export type AssessedCheckpoint = Schemas['AssessedCheckpoint']
export type Recommendation = Schemas['Recommendation']
export type HeatmapResponse = Schemas['HeatmapResponse']
export type GeocodeResult = Schemas['GeocodeResult']
export type RouteId = Schemas['IdEnum']
export type PlaceInput = Schemas['PlaceRequest']

/** Same origin in production (Vercel Services); the Vite dev server proxies /api. */
const client = createClient<paths>({ baseUrl: import.meta.env.VITE_API_BASE ?? '' })

export class ApiError extends Error {
  readonly code: string
  readonly status: number
  readonly details: unknown

  constructor(status: number, code: string, message: string, details?: unknown) {
    super(message)
    this.name = 'ApiError'
    this.status = status
    this.code = code
    this.details = details
  }
}

type Result<T> = { data?: T; error?: unknown; response: Response }

async function unwrap<T>(call: Promise<Result<T>>): Promise<T> {
  let result: Result<T>
  try {
    result = await call
  } catch {
    throw new ApiError(0, 'network', "Couldn't reach the server. Check your connection.")
  }
  if (result.data !== undefined && result.response.ok) return result.data
  const body = result.error as { error?: { code?: string; message?: string; details?: unknown } }
  const err = body?.error
  throw new ApiError(
    result.response.status,
    err?.code ?? 'error',
    err?.message ?? `Request failed (${result.response.status})`,
    err?.details,
  )
}

export const api = {
  health: (signal?: AbortSignal) => unwrap(client.GET('/api/health', { signal })),
  geocode: (q: string, signal?: AbortSignal) =>
    unwrap(client.GET('/api/geocode', { params: { query: { q } }, signal })),
  reverse: (lat: number, lon: number, signal?: AbortSignal) =>
    unwrap(client.GET('/api/reverse', { params: { query: { lat, lon } }, signal })),
  routes: (body: RoutesRequest, signal?: AbortSignal) => unwrap(client.POST('/api/routes', { body, signal })),
  assess: (body: Schemas['AssessRequestRequest'], signal?: AbortSignal) =>
    unwrap(client.POST('/api/assess', { body, signal })),
  heatmap: (body: Schemas['HeatmapRequestRequest'], signal?: AbortSignal) =>
    unwrap(client.POST('/api/heatmap', { body, signal })),
}
