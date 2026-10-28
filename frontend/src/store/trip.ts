import { create } from 'zustand'
import type { PlaceInput, RouteId, RoutesRequest } from '@/lib/api/client'

export type HeatVariable = 'risk' | 'wind' | 'rain' | 'snow'
/** "storm" overlays a clearly labelled simulated storm on the real forecast. */
export type Scenario = 'live' | 'storm'

export type PlaceRole = 'origin' | 'destination'

export interface SelectedCheckpoint {
  routeId: RouteId
  index: number
  /** Where the selection came from, so the list only auto-scrolls for map clicks. */
  origin: 'map' | 'list'
}

interface TripState {
  /** Places chosen in the form or picked on the map, before they are planned. */
  draft: Record<PlaceRole, PlaceInput | null>
  request: RoutesRequest | null
  /** Increments on every submit; data queries are keyed by it. */
  requestId: number
  selectedRouteId: RouteId | null
  hoveredRouteId: RouteId | null
  selectedCheckpoint: SelectedCheckpoint | null
  heatVariable: HeatVariable
  heatVisible: boolean
  scenario: Scenario

  setDraftPlace: (role: PlaceRole, place: PlaceInput | null) => void
  swapDraft: () => void
  submit: (request: RoutesRequest) => void
  selectRoute: (id: RouteId | null) => void
  hoverRoute: (id: RouteId | null) => void
  selectCheckpoint: (cp: SelectedCheckpoint | null) => void
  setHeatVariable: (v: HeatVariable) => void
  toggleHeat: () => void
  setScenario: (scenario: Scenario) => void
}

export const useTrip = create<TripState>()((set) => ({
  draft: { origin: null, destination: null },
  request: null,
  requestId: 0,
  selectedRouteId: null,
  hoveredRouteId: null,
  selectedCheckpoint: null,
  heatVariable: 'risk',
  heatVisible: true,
  scenario: 'live',

  setDraftPlace: (role, place) => set((s) => ({ draft: { ...s.draft, [role]: place } })),
  swapDraft: () => set((s) => ({ draft: { origin: s.draft.destination, destination: s.draft.origin } })),
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
  setScenario: (scenario) => set({ scenario, selectedCheckpoint: null }),
}))
