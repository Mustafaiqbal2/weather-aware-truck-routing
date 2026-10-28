export const LEVELS = ['low', 'moderate', 'high', 'severe', 'no_travel'] as const
export type Level = (typeof LEVELS)[number]

export const LEVEL_LABEL: Record<Level, string> = {
  low: 'Low',
  moderate: 'Moderate',
  high: 'High',
  severe: 'Severe',
  no_travel: 'No Travel',
}

/** Same values as the --color-risk-* tokens in index.css (needed as JS for the map). */
export const LEVEL_COLOR: Record<Level | 'unknown', string> = {
  low: '#3fb8af',
  moderate: '#f2d13d',
  high: '#ff8a3d',
  severe: '#e5484d',
  no_travel: '#c04cf5',
  unknown: '#5b6474',
}

export const levelValue = (level: Level): number => LEVELS.indexOf(level)

export const DRIVER_LABEL = {
  wind: 'Wind',
  rain: 'Rain',
  snow: 'Snow',
  load: 'Load rule',
} as const

/** WMO weather codes, condensed to what matters on the road. */
export function weatherCodeLabel(code: number | null | undefined): string {
  if (code == null) return 'Unknown'
  if (code === 0) return 'Clear'
  if (code <= 3) return 'Cloudy'
  if (code === 45 || code === 48) return 'Fog'
  if (code >= 51 && code <= 57) return 'Drizzle'
  if (code >= 61 && code <= 67) return code >= 66 ? 'Freezing rain' : 'Rain'
  if (code >= 71 && code <= 77) return 'Snow'
  if (code >= 80 && code <= 82) return 'Showers'
  if (code === 85 || code === 86) return 'Snow showers'
  if (code >= 95) return 'Thunderstorm'
  return 'Mixed'
}
