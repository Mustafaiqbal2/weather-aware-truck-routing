import type { PlaceInput } from '@/lib/api/client'

/** One-click demo trips shown before the first plan. */
export const EXAMPLES: { label: string; origin: PlaceInput; destination: PlaceInput; load: number }[] = [
  {
    label: 'Denver → Chicago',
    origin: { label: 'Denver, CO', lat: 39.7392, lon: -104.9903 },
    destination: { label: 'Chicago, IL', lat: 41.8781, lon: -87.6298 },
    load: 42_000,
  },
  {
    label: 'Seattle → Spokane',
    origin: { label: 'Seattle, WA', lat: 47.6062, lon: -122.3321 },
    destination: { label: 'Spokane, WA', lat: 47.6588, lon: -117.426 },
    load: 35_000,
  },
  {
    label: 'Dallas → Atlanta',
    origin: { label: 'Dallas, TX', lat: 32.7767, lon: -96.797 },
    destination: { label: 'Atlanta, GA', lat: 33.749, lon: -84.388 },
    load: 44_000,
  },
]
