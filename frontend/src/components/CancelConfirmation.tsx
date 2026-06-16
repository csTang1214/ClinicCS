interface AppointmentDetails {
  id: number
  date: string
  doctorName: string
  service: string
  status: string
}

interface CancelConfirmationProps {
  details: AppointmentDetails
  onConfirm: () => void
  onCancel: () => void
}

export function CancelConfirmation({ details, onConfirm, onCancel }: CancelConfirmationProps) {
  const apptDate = new Date(details.date)
  const formattedDate = apptDate.toLocaleDateString('en-US', {
    weekday: 'long', year: 'numeric', month: 'long', day: 'numeric',
  })
  const formattedTime = apptDate.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' })

  return (
    <div className="confirmation-card cancel-card">
      <div className="confirmation-header">
        <span className="confirmation-icon">⚠️</span>
        <span className="confirmation-title">Cancel Appointment</span>
      </div>

      <div className="confirmation-details">
        <div className="confirmation-row">
          <span className="confirmation-label">Appointment ID</span>
          <span className="confirmation-value">#{details.id}</span>
        </div>
        <div className="confirmation-row">
          <span className="confirmation-label">Service</span>
          <span className="confirmation-value">{details.service}</span>
        </div>
        <div className="confirmation-row">
          <span className="confirmation-label">Date & Time</span>
          <span className="confirmation-value">{formattedDate} at {formattedTime}</span>
        </div>
        <div className="confirmation-row">
          <span className="confirmation-label">Doctor</span>
          <span className="confirmation-value">{details.doctorName}</span>
        </div>
      </div>

      <p className="cancel-warning">This action cannot be undone.</p>

      <div className="confirmation-actions">
        <button className="confirmation-btn destructive-btn" onClick={onConfirm}>
          Confirm Cancellation
        </button>
        <button className="confirmation-btn keep-btn" onClick={onCancel}>
          Keep Appointment
        </button>
      </div>
    </div>
  )
}
