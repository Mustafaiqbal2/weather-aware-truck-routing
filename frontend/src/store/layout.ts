import { create } from 'zustand'

/**
 * Screen layout shared by React and imperative map code (which reads `getState()` when it
 * fits the camera). Phones get a full-screen map under a draggable bottom sheet; wider
 * screens keep the sidebar beside the map.
 */

export type SheetSnap = 'peek' | 'half' | 'full'
export interface Padding {
  top: number
  bottom: number
  left: number
  right: number
}

/** Matches Tailwind's `md` breakpoint, where the sidebar moves beside the map. */
export const COMPACT_QUERY = '(max-width: 767.98px)'
/** Desktop: the timeline dock floats over the bottom of the map. */
export const DESKTOP_PADDING: Padding = { top: 72, bottom: 190, left: 72, right: 72 }
/** Map left visible above the sheet when it is fully open (px). */
export const SHEET_TOP_GAP = 56
/** Timeline dock height on phones before it is first measured (px). */
export const DOCK_ESTIMATE = 96
/** Sheet height at its lowest snap: handle, header and a glimpse of the content (px). */
export const SHEET_PEEK = 132

interface LayoutState {
  compact: boolean
  viewportHeight: number
  snap: SheetSnap
  /** Height of the timeline dock riding on top of the sheet (0 when there is none). */
  dockHeight: number
  setCompact: (compact: boolean) => void
  setViewportHeight: (height: number) => void
  setSnap: (snap: SheetSnap) => void
  setDockHeight: (height: number) => void
}

/** Visible height of the sheet at a snap point. */
export function sheetVisible(snap: SheetSnap, viewportHeight: number): number {
  const full = Math.max(SHEET_PEEK, viewportHeight - SHEET_TOP_GAP)
  if (snap === 'full') return full
  if (snap === 'half') return Math.min(full, Math.max(SHEET_PEEK, Math.round(viewportHeight * 0.5)))
  return Math.min(full, SHEET_PEEK)
}

/**
 * Camera padding so routes are framed in the part of the map that is actually visible.
 * A fully open sheet covers the map, so it keeps the half-open framing (no camera jump).
 */
export function mapPadding(
  s: Pick<LayoutState, 'compact' | 'viewportHeight' | 'snap' | 'dockHeight'>,
): Padding {
  if (!s.compact) return DESKTOP_PADDING
  const snap = s.snap === 'full' ? 'half' : s.snap
  const covered = sheetVisible(snap, s.viewportHeight) + s.dockHeight + 34
  return { top: 28, left: 28, right: 28, bottom: Math.min(covered, s.viewportHeight - 140) }
}

function matches(query: string): boolean {
  return typeof window !== 'undefined' && typeof window.matchMedia === 'function'
    ? window.matchMedia(query).matches
    : false
}

export const useLayout = create<LayoutState>()((set) => ({
  compact: matches(COMPACT_QUERY),
  viewportHeight: typeof window !== 'undefined' ? window.innerHeight : 800,
  snap: 'half',
  dockHeight: DOCK_ESTIMATE,
  setCompact: (compact) => set({ compact }),
  setViewportHeight: (viewportHeight) => set({ viewportHeight }),
  setSnap: (snap) => set({ snap }),
  setDockHeight: (dockHeight) => set((s) => (s.dockHeight === dockHeight ? s : { dockHeight })),
}))

// One app-wide listener each; the store is the single source of truth for layout.
if (typeof window !== 'undefined' && typeof window.matchMedia === 'function') {
  window
    .matchMedia(COMPACT_QUERY)
    .addEventListener('change', (e) => useLayout.getState().setCompact(e.matches))
  window.addEventListener('resize', () => useLayout.getState().setViewportHeight(window.innerHeight))
}
