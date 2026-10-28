import { create } from 'zustand'
import type { RouteId, RoutesRequest } from '@/lib/api/client'

export type HeatVariable = 'risk' | 'wind' | 'rain' | 'snow'

export interface SelectedCheckpoint {
  routeId: RouteId
  index: number
  /** Where the selection came from, so the list only auto-scrolls for map clicks. */
  origin: 'map' | 'list'
}

interface TripState {
  request: RoutesRequest | null
  /** Increments on every submit; data queries are keyed by it. */
  requestId: number
  selectedRouteId: RouteId | null
  hoveredRouteId: RouteId | null
  selectedCheckpoint: SelectedCheckpoint | null
  heatVariable: HeatVariable
  heatVisible: boolean

  submit: (request: RoutesRequest) => void
  selectRoute: (id: RouteId | null) => void
  hoverRoute: (id: RouteId | null) => void
  selectCheckpoint: (cp: SelectedCheckpoint | null) => void
  setHeatVariable: (v: HeatVariable) => void
  toggleHeat: () => void
}

export const useTrip = create<TripState>()((set) => ({
  request: null,
  requestId: 0,
  selectedRouteId: null,
  hoveredRouteId: null,
  selectedCheckpoint: null,
  heatVariable: 'risk',
  heatVisible: true,

  submit: (request) =>
    set((s) => ({
      request,
      requestId: s.requestId + 1,
      selectedRouteId: null,
      hoveredRouteId: null,
      selectedCheckpoint: null,
    })),
  selectRoute: (id) =>
    set((s) => (s.selectedRouteId === id ? s : { selectedRouteId: id, selectedCheckpoint: null })),
  hoverRoute: (id) => set({ hoveredRouteId: id }),
  selectCheckpoint: (cp) =>
    set(cp ? { selectedCheckpoint: cp, selectedRouteId: cp.routeId } : { selectedCheckpoint: null }),
  setHeatVariable: (heatVariable) => set({ heatVariable, heatVisible: true }),
  toggleHeat: () => set((s) => ({ heatVisible: !s.heatVisible })),
}))
