interface ServicePickerProps {
  services: string[]
  onSelect: (service: string) => void
}

const SERVICE_ICONS: Record<string, string> = {
  dental: '🦷',
  dentist: '🦷',
  gp: '👨‍⚕️',
  'general practitioner': '👨‍⚕️',
  physio: '🏃',
  physiotherapy: '🏃',
  dermatology: '🔬',
  dermatologist: '🔬',
  cardiology: '❤️',
  cardiologist: '❤️',
  pediatrics: '👶',
  ophthalmology: '👁️',
  optometry: '👓',
  ortho: '🦴',
  'check-up': '📋',
  checkup: '📋',
  consultation: '💬',
}

function getIcon(service: string): string {
  const lower = service.toLowerCase()
  for (const [key, icon] of Object.entries(SERVICE_ICONS)) {
    if (lower.includes(key)) return icon
  }
  return '🏥'
}

function capitalize(str: string): string {
  return str.charAt(0).toUpperCase() + str.slice(1)
}

export function ServicePicker({ services, onSelect }: ServicePickerProps) {
  return (
    <div className="service-picker">
      <div className="service-picker-header">
        <span className="service-picker-title">Select a Service</span>
      </div>
      <div className="service-grid">
        {services.map(service => (
          <button
            key={service}
            className="service-btn"
            onClick={() => onSelect(service)}
          >
            <span className="service-icon">{getIcon(service)}</span>
            <span className="service-name">{capitalize(service)}</span>
          </button>
        ))}
      </div>
    </div>
  )
}
