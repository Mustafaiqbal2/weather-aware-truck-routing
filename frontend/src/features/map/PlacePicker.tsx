import { motion, useReducedMotion } from 'motion/react'
import { Marker, Popup } from 'react-map-gl/maplibre'
import { Button } from '@/components/Button'
import type { PlaceInput } from '@/lib/api/client'
import { cn } from '@/lib/cn'
import { EASE_OUT } from '@/lib/motion'
import { type TripView, useReverseGeocode } from '@/lib/queries'
import { useLayout } from '@/store/layout'
import { type PlaceRole, useTrip } from '@/store/trip'

export interface PickedPoint {
  lng: number
  lat: number
}

/** A pin dropped on empty map: name it, then use it as the start or the end of the trip. */
export function PlacePickPopup({ point, onClose }: { point: PickedPoint; onClose: () => void }) {
  const name = useReverseGeocode(point)
  const setDraftPlace = useTrip((s) => s.setDraftPlace)
  const coords = `${point.lat.toFixed(3)}, ${point.lng.toFixed(3)}`
  const label = name.data?.label ?? (name.isPending ? null : 'Dropped pin')

  const choose = (role: PlaceRole) => {
    const place: PlaceInput = { lat: point.lat, lon: point.lng, label: label ?? `Pin at ${coords}` }
    setDraftPlace(role, place)
    onClose()
    // Phones: once both ends are set, bring the form up so the trip can be planned.
    const { draft } = useTrip.getState()
    if (draft.origin && draft.destination && useLayout.getState().compact)
      useLayout.getState().setSnap('half')
  }

  return (
    <Popup
      longitude={point.lng}
      latitude={point.lat}
      anchor="bottom"
      offset={14}
      closeOnClick={false}
      onClose={onClose}
      maxWidth="280px"
    >
      <div className="w-[252px] p-3.5" role="dialog" aria-label="Dropped pin">
        <p className="text-[11px] font-medium tracking-[0.08em] text-fg-faint uppercase">Dropped pin</p>
        <p className="mt-1 min-h-5 pr-5 text-[14px] font-medium text-fg">
          {label ?? (
            <span
              className="inline-block h-4 w-36 skeleton rounded"
              role="status"
              aria-label="Finding the nearest town"
            />
          )}
        </p>
        <p className="truncate font-mono text-[11.5px] text-fg-faint">
          {name.data?.detail && name.data.detail !== label ? name.data.detail : coords}
        </p>
        <div className="mt-3 grid grid-cols-2 gap-2">
          <Button size="sm" onClick={() => choose('origin')}>
            <PinDot role="origin" /> Start here
          </Button>
          <Button size="sm" onClick={() => choose('destination')}>
            <PinDot role="destination" /> End here
          </Button>
        </div>
      </div>
    </Popup>
  )
}

/** Start and end pins for places that are chosen but not yet planned. */
export function DraftPins({ view }: { view: TripView | undefined }) {
  const draft = useTrip((s) => s.draft)
  const planned = view?.plan
  const pending = (role: PlaceRole) => {
    const place = draft[role]
    const plannedPlace = planned?.[role]
    if (!place) return null
    // Once planned, the route's own end points show the place.
    if (plannedPlace && plannedPlace.lat === place.lat && plannedPlace.lon === place.lon) return null
    return place
  }
  return (['origin', 'destination'] as const).map((role) => {
    const place = pending(role)
    return place ? <DraftPin key={role} role={role} place={place} /> : null
  })
}

function DraftPin({ role, place }: { role: PlaceRole; place: PlaceInput }) {
  const reduced = useReducedMotion()
  return (
    <Marker longitude={place.lon} latitude={place.lat} anchor="center">
      <motion.span
        key={`${place.lat},${place.lon}`}
        initial={reduced ? false : { scale: 0.4, opacity: 0 }}
        animate={{ scale: 1, opacity: 1 }}
        transition={{ duration: 0.35, ease: EASE_OUT }}
        className="pointer-events-none grid place-items-center"
        aria-label={`${role === 'origin' ? 'Start' : 'End'}: ${place.label}`}
        role="img"
      >
        <span
          className={cn(
            'grid size-[18px] place-items-center rounded-full shadow-[0_0_0_4px_rgb(11_14_19/0.6)]',
            role === 'origin' ? 'bg-ink-700' : 'bg-amber-soft',
          )}
        >
          <PinDot role={role} />
        </span>
      </motion.span>
    </Marker>
  )
}

/** The same start/end symbols as the trip form's fields. */
function PinDot({ role }: { role: PlaceRole }) {
  return (
    <span
      aria-hidden
      className={cn(
        'block size-2.5 rounded-full',
        role === 'origin' ? 'border-2 border-fg-muted' : 'bg-amber',
      )}
    />
  )
}
