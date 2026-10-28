import { create } from 'zustand'

export const TIMELINE_HOURS = 48

/**
 * The forecast slider position, in fractional hours after the heatmap's start hour.
 * Kept apart from the trip store because it changes every animation frame while playing;
 * the heatmap layer subscribes to it directly, outside React, so the map never re-renders.
 */
interface TimelineState {
  hour: number
  playing: boolean
  setHour: (hour: number) => void
  setPlaying: (playing: boolean) => void
}

export const useTimeline = create<TimelineState>()((set) => ({
  hour: 0,
  playing: false,
  setHour: (hour) => set({ hour: Math.min(Math.max(hour, 0), TIMELINE_HOURS) }),
  setPlaying: (playing) => set({ playing }),
}))
