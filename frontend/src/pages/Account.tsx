import { useCurrentUser, useCurrentUserAppointments, type Appointment } from '../services/queries'

const STATUS_STYLES: Record<string, string> = {
  scheduled: 'appt-status--scheduled',
  completed: 'appt-status--completed',
  cancelled: 'appt-status--cancelled',
  rescheduled: 'appt-status--rescheduled',
}

function formatDate(iso: string) {
  return new Date(iso).toLocaleDateString('en-US', {
    weekday: 'short',
    year: 'numeric',
    month: 'short',
    day: 'numeric',
  })
}

function formatTime(iso: string) {
  return new Date(iso).toLocaleTimeString('en-US', {
    hour: 'numeric',
    minute: '2-digit',
  })
}

function AppointmentCard({ appt }: { appt: Appointment }) {
  const doctorName = appt.doctor_first_name
    ? `Dr. ${appt.doctor_first_name} ${appt.doctor_last_name}`
    : 'Unknown Doctor'

  return (
    <div className="appt-card">
      <div className="appt-card-header">
        <div>
          <p className="appt-date">{formatDate(appt.appointment_date)}</p>
          <p className="appt-time">{formatTime(appt.appointment_date)} &middot; {appt.duration_minutes} min</p>
        </div>
        <span className={`appt-status ${STATUS_STYLES[appt.status] ?? ''}`}>
          {appt.status}
        </span>
      </div>
      <div className="appt-card-body">
        <p className="appt-doctor">{doctorName}</p>
        {appt.specialty && <p className="appt-specialty">{appt.specialty}</p>}
        {appt.notes && <p className="appt-notes">{appt.notes}</p>}
        <p className="appt-id">Appointment ID: {appt.id}</p>
      </div>
    </div>
  )
}

export function Account() {
  const { data: user, isLoading: userLoading } = useCurrentUser()
  const { data: appointments, isLoading: apptLoading } = useCurrentUserAppointments()

  if (userLoading) {
    return <div className="page-form">Loading account information...</div>
  }

  if (!user) {
    return (
      <div className="page-form">
        <div className="form-card">
          <h1>Account</h1>
          <p>No account information available.</p>
        </div>
      </div>
    )
  }

  const upcoming = appointments?.filter(a => a.status === 'scheduled' || a.status === 'rescheduled') ?? []
  const past = appointments?.filter(a => a.status === 'completed' || a.status === 'cancelled') ?? []

  return (
    <section className="page-form">
      <div className="form-card account-card">
        <h1>My Account</h1>

        <div className="info-section">
          <h2>Account Details</h2>
          <p><strong>Email:</strong> {user.email}</p>
          {user.id && <p><strong>ID:</strong> {user.id}</p>}
        </div>

        <div className="info-section">
          <h2>My Appointments</h2>
          {apptLoading ? (
            <p className="appt-loading">Loading appointments...</p>
          ) : appointments?.length === 0 ? (
            <p className="appt-empty">No appointments found. Use the chat to book one.</p>
          ) : (
            <>
              {upcoming.length > 0 && (
                <div className="appt-group">
                  <h3 className="appt-group-label">Upcoming</h3>
                  {upcoming.map(a => <AppointmentCard key={a.id} appt={a} />)}
                </div>
              )}
              {past.length > 0 && (
                <div className="appt-group">
                  <h3 className="appt-group-label">Past</h3>
                  {past.map(a => <AppointmentCard key={a.id} appt={a} />)}
                </div>
              )}
            </>
          )}
        </div>
      </div>
    </section>
  )
}
