const numberFormat = new Intl.NumberFormat('en-US')

export function formatMiles(miles: number): string {
  if (miles >= 100) return `${numberFormat.format(Math.round(miles))} mi`
  if (miles >= 10) return `${Math.round(miles)} mi`
  return `${miles.toFixed(1)} mi`
}

export function formatDuration(seconds: number): string {
  const minutes = Math.round(seconds / 60)
  if (minutes < 60) return `${minutes} min`
  const hours = Math.floor(minutes / 60)
  const rest = minutes % 60
  return rest ? `${hours} h ${rest} min` : `${hours} h`
}

export function formatLoad(lb: number): string {
  return `${numberFormat.format(Math.round(lb))} lb`
}

const clockCache = new Map<string, Intl.DateTimeFormat>()

function clockFormat(timeZone: string, withDay: boolean): Intl.DateTimeFormat {
  const key = `${timeZone}|${withDay}`
  let f = clockCache.get(key)
  if (!f) {
    f = new Intl.DateTimeFormat('en-US', {
      timeZone,
      weekday: withDay ? 'short' : undefined,
      hour: 'numeric',
      minute: '2-digit',
      timeZoneName: 'short',
    })
    clockCache.set(key, f)
  }
  return f
}

/** "Tue 2:20 PM MDT" in the given IANA time zone. */
export function formatClock(iso: string | Date, timeZone: string, withDay = true): string {
  const date = typeof iso === 'string' ? new Date(iso) : iso
  return clockFormat(timeZone, withDay).format(date).replace(',', '')
}

/** Clock parts for compact layouts: { time: "2:20 PM", zone: "MDT", day: "Tue" }. */
export function clockParts(iso: string | Date, timeZone: string) {
  const date = typeof iso === 'string' ? new Date(iso) : iso
  const parts = clockFormat(timeZone, true).formatToParts(date)
  const get = (type: Intl.DateTimeFormatPartTypes) => parts.find((p) => p.type === type)?.value ?? ''
  return {
    day: get('weekday'),
    time: `${get('hour')}:${get('minute')} ${get('dayPeriod')}`.trim(),
    zone: get('timeZoneName'),
  }
}

export function hoursBetween(a: string | Date, b: string | Date): number {
  return (new Date(b).getTime() - new Date(a).getTime()) / 3_600_000
}
