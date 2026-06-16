interface BookingDetails {
  service?: string
  date?: string
  time?: string
  doctorName?: string
  duration?: number
  appointmentId?: number
  originalDate?: string
}

interface BookingConfirmationProps {
  type: 'booking' | 'reschedule'
  details: BookingDetails
  onConfirm: () => void
  onCancel: () => void
}

function formatDate(iso: string): string {
  const [y, m, d] = iso.split('-').map(Number)
  return new Date(y, m - 1, d).toLocaleDateString('en-US', {
    weekday: 'long', year: 'numeric', month: 'long', day: 'numeric',
  })
}

function formatTime(slot: string): string {
  const [h, min] = slot.split(':').map(Number)
  const period = h >= 12 ? 'PM' : 'AM'
  const hour = h % 12 || 12
  return `${hour}:${String(min).padStart(2, '0')} ${period}`
}

function formatDateTime(dateIso?: string, time?: string): string {
  if (!dateIso) return '—'
  const datePart = formatDate(dateIso)
  const timePart = time ? ` at ${formatTime(time)}` : ''
  return `${datePart}${timePart}`
}

export function BookingConfirmation({ type, details, onConfirm, onCancel }: BookingConfirmationProps) {
  const title = type === 'reschedule' ? 'Confirm Reschedule' : 'Confirm Booking'

  return (
    <div className="confirmation-card">
      <div className="confirmation-header">
        <span className="confirmation-icon">{type === 'reschedule' ? '📅' : '✅'}</span>
        <span className="confirmation-title">{title}</span>
      </div>

      <div className="confirmation-details">
        {type === 'reschedule' && details.originalDate && (
          <div className="confirmation-row reschedule-old">
            <span className="confirmation-label">Current appointment</span>
            <span className="confirmation-value strikethrough">
              {formatDateTime(
                new Date(details.originalDate).toISOString().split('T')[0],
                new Date(details.originalDate).toTimeString().slice(0, 5),
              )}
            </span>
          </div>
        )}
        {type === 'reschedule' && (
          <div className="confirmation-row reschedule-arrow">
            <span className="arrow-icon">↓ New appointment</span>
          </div>
        )}
        <div className="confirmation-row">
          <span className="confirmation-label">Service</span>
          <span className="confirmation-value">{details.service || '—'}</span>
        </div>
        <div className="confirmation-row">
          <span className="confirmation-label">Date & Time</span>
          <span className="confirmation-value">{formatDateTime(details.date, details.time)}</span>
        </div>
        <div className="confirmation-row">
          <span className="confirmation-label">Doctor</span>
          <span className="confirmation-value">{details.doctorName || '—'}</span>
        </div>
        {details.duration && (
          <div className="confirmation-row">
            <span className="confirmation-label">Duration</span>
            <span className="confirmation-value">{details.duration} minutes</span>
          </div>
        )}
      </div>

      <div className="confirmation-actions">
        <button className="confirmation-btn confirm-btn" onClick={onConfirm}>
          {type === 'reschedule' ? 'Confirm Reschedule' : 'Confirm Booking'}
        </button>
        <button className="confirmation-btn cancel-btn" onClick={onCancel}>
          Cancel
        </button>
      </div>
    </div>
  )
}
