interface DatePickerProps {
  onSelect: (dateISO: string) => void
}

export function DatePicker({ onSelect }: DatePickerProps) {
  // Show the next 14 days starting from tomorrow
  const dates = Array.from({ length: 14 }, (_, i) => {
    const d = new Date()
    d.setDate(d.getDate() + i + 1)
    return d
  })

  return (
    <div className="date-picker">
      <div className="date-picker-header">
        <span className="date-picker-title">Select a Date</span>
        <span className="date-picker-hint">Sundays are unavailable</span>
      </div>
      <div className="date-grid">
        {dates.map(date => {
          const isSunday = date.getDay() === 0
          const isSaturday = date.getDay() === 6
          const iso = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`
          return (
            <button
              key={iso}
              className={`date-btn ${isSunday ? 'date-closed' : isSaturday ? 'date-saturday' : 'date-available'}`}
              onClick={() => onSelect(iso)}
              disabled={isSunday}
              title={isSunday ? 'Clinic closed on Sundays' : undefined}
            >
              <span className="date-weekday">
                {date.toLocaleDateString('en-US', { weekday: 'short' })}
              </span>
              <span className="date-num">{date.getDate()}</span>
              <span className="date-month">
                {date.toLocaleDateString('en-US', { month: 'short' })}
              </span>
              {isSunday && <span className="date-closed-label">Closed</span>}
            </button>
          )
        })}
      </div>
    </div>
  )
}
