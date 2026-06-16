import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { Navbar } from './components/Navbar'
import { Home, Login, Signup, Account, Chat } from './pages'
import { useAuth } from './auth/useAuth'
import './App.css'

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 1000 * 60 * 5,
      gcTime: 1000 * 60 * 10,
    },
  },
})

function AppContent() {
  const { page, setPage, isLoggedIn, logout } = useAuth()

  return (
    <div className="app-shell">
      <Navbar
        activePage={page}
        onNavigate={setPage}
        isLoggedIn={isLoggedIn}
        onLogout={logout}
      />

      <main className="page-content">
        {page === 'home' && <Home isLoggedIn={isLoggedIn} onSelect={setPage} />}
        {page === 'login' && <Login onLoginSuccess={() => setPage('home')} />}
        {page === 'signup' && <Signup onSignupSuccess={() => setPage('login')} />}
        {page === 'account' && isLoggedIn && <Account />}
        {page === 'chat' && isLoggedIn && <Chat />}
      </main>
    </div>
  )
}

export default function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <AppContent />
    </QueryClientProvider>
  )
}