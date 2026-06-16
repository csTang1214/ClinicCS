import { useHealthCheck } from '../services/queries'

type HomeProps = {
  onSelect(action: 'signup' | 'login' | 'chat'): void
  isLoggedIn: boolean
}

export function Home({ isLoggedIn, onSelect }: HomeProps) {
  const { data: healthData, isLoading, error } = useHealthCheck()


  return (
    <section className="page-home">
      <div className="hero-panel">
        <div>
          <p className="eyebrow">Welcome to ClinicChatBot</p>
          <h1>Patient engagement made simple.</h1>
          <p className="hero-copy">
            Build a friendly intake experience with a home page, signup, and login flow.
            Keep your clinic communications clear and accessible.
          </p>

          {/* Health Check Demo */}
          <div className="health-check-demo" style={{ margin: '1rem 0', padding: '1rem', background: '#f5f5f5', borderRadius: '8px' }}>
            <h3>Backend Status</h3>
            {isLoading && <p>Checking backend connection...</p>}
            {error && <p style={{ color: 'red' }}>Backend connection failed</p>}
            {healthData && <p style={{ color: 'green' }}>✅ Backend is healthy: {JSON.stringify(healthData)}</p>}
          </div>
          {isLoggedIn ? (
            <div className="hero-actions">
              <button type="button" className="primary-btn" onClick={() => onSelect('chat')}>
                Manage appointments
              </button>
            </div>
          ) : (
            <div className="hero-actions">
            <button type="button" className="primary-btn" onClick={() => onSelect('signup')}>
              Get started
            </button>
            <button type="button" className="secondary-btn" onClick={() => onSelect('login')}>
              Login
            </button>
          </div>
          )}

        </div>
        <div className="hero-card">
          <h2>Client-first clinic tools</h2>
          <p>Easy navigation, clean signup, and quick access for returning patients.</p>
        </div>
      </div>

      <section className="feature-grid">
        <article className="feature-card">
          <h3>Fast sign up</h3>
          <p>Patients can create an account quickly with a clean form and clear prompts.</p>
        </article>
        <article className="feature-card">
          <h3>Secure login</h3>
          <p>Return users can access care details with a simple login screen.</p>
        </article>
        <article className="feature-card">
          <h3>Responsive layout</h3>
          <p>The interface adapts to desktop and mobile screens for clinic staff and patients.</p>
        </article>
      </section>
    </section>
  )
}
