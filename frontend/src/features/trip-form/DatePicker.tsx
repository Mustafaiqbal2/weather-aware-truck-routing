import 'react-day-picker/style.css'
import { DayPicker, type Matcher } from 'react-day-picker'

/** Calendar for scheduled departures; loaded only when the driver chooses Schedule. */
export default function DatePicker({
  selected,
  onSelect,
  disabled,
}: {
  selected: Date
  onSelect: (date: Date) => void
  disabled: Matcher[]
}) {
  return (
    <DayPicker
      mode="single"
      required
      selected={selected}
      onSelect={(date) => date && onSelect(date)}
      disabled={disabled}
      showOutsideDays={false}
    />
  )
}
