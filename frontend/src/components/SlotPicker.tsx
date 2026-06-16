interface SlotPickerProps {
  date: string
  availableSlots: string[]
  occupiedSlots: string[]
  service?: string
  onSelect: (time: string) => void
}

function formatDate(iso: string): string {
  const [y, m, d] = iso.split('-').map(Number)
  return new Date(Date.UTC(y, m - 1, d)).toLocaleDateString('en-US', {
    weekday: 'long', year: 'numeric', month: 'long', day: 'numeric', timeZone: 'UTC',
  })
}

function formatSlot(slot: string): string {
  const [h, min] = slot.split(':').map(Number)
  const period = h >= 12 ? 'PM' : 'AM'
  const hour = h % 12 || 12
  return `${hour}:${String(min).padStart(2, '0')} ${period}`
}

export function SlotPicker({ date, availableSlots, occupiedSlots, service, onSelect }: SlotPickerProps) {
  // Merge and sort all slots so the grid always appears in chronological order
  const allSlots = [...new Set([...availableSlots, ...occupiedSlots])].sort()

  return (
    <div className="slot-picker">
      <div className="slot-picker-header">
        <span className="slot-picker-title">Select a Time Slot</span>
        {service && <span className="slot-picker-service">{service}</span>}
        <span className="slot-picker-date">{formatDate(date)}</span>
      </div>
      <div className="slot-grid">
        {allSlots.map(slot => {
          const isAvailable = availableSlots.includes(slot)
          return (
            <button
              key={slot}
              className={`slot-btn ${isAvailable ? 'slot-available' : 'slot-occupied'}`}
              onClick={() => onSelect(slot)}
              disabled={!isAvailable}
              title={!isAvailable ? 'Already booked' : undefined}
            >
              {formatSlot(slot)}
              {!isAvailable && <span className="slot-badge">Taken</span>}
            </button>
          )
        })}
      </div>
    </div>
  )
}
