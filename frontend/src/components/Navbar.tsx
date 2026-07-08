import type { PageType } from '../pages/index.ts'

type NavbarProps = {
  activePage: PageType
  onNavigate(page: PageType): void
  isLoggedIn: boolean
  onLogout(): void
}

const linkItems: Array<{ key: NavbarProps['activePage']; label: string }> = [
  { key: 'home', label: 'Home' },
  { key: 'policy', label: 'Policy' },
  { key: 'signup', label: 'Sign Up' },
  { key: 'login', label: 'Login' },
]

export function Navbar({ activePage, onNavigate, isLoggedIn, onLogout }: NavbarProps) {
  console.log('Navbar - isLoggedIn prop:', isLoggedIn)
  console.log('Navbar - activePage:', activePage)

  const handleLogout = () => {
    console.log('Navbar - handleLogout called')
    onLogout()
    onNavigate('home')
  }

  return (
    <header className="navbar">
      <div className="navbar-brand">ClinicChatBot</div>
      <nav className="navbar-links" aria-label="Main navigation">
        {!isLoggedIn ? (
          linkItems.map((item) => (
            <button
              type="button"
              key={item.key}
              className={activePage === item.key ? 'nav-button active' : 'nav-button'}
              onClick={() => onNavigate(item.key)}
            >
              {item.label}
            </button>
          ))
        ) : (
          <>
            <button
              type="button"
              className={activePage === 'home' ? 'nav-button active' : 'nav-button'}
              onClick={() => onNavigate('home')}
            >
              Home
            </button>
            <button
              type="button"
              className={activePage === 'policy' ? 'nav-button active' : 'nav-button'}
              onClick={() => onNavigate('policy')}
            >
              Policy
            </button>
            <button
              type="button"
              className={activePage === 'chat' ? 'nav-button active' : 'nav-button'}
              onClick={() => onNavigate('chat')}
            >
              Chat
            </button>
            <button
              type="button"
              className={activePage === 'account' ? 'nav-button active' : 'nav-button'}
              onClick={() => onNavigate('account')}
            >
              Account
            </button>
            <button type="button" className="nav-button" onClick={handleLogout}>
              Sign out
            </button>
          </>
        )}
      </nav>
    </header>
  )
}
