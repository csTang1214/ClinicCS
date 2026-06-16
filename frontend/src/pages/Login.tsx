import { useState, useEffect, type SyntheticEvent } from 'react'
import { useLogin } from '../services/queries'

type LoginProps = {
  onLoginSuccess?: () => void
}

type LoginErrors = {
  email?: string
  password?: string
}

export function Login({ onLoginSuccess }: LoginProps) {
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [errors, setErrors] = useState<LoginErrors>({})
  const loginMutation = useLogin()

  const clearFieldError = (field: keyof LoginErrors) =>
    setErrors(prev => ({ ...prev, [field]: undefined }))

  const formCheck = (): boolean => {
    const next: LoginErrors = {}

    if (!email.trim()) {
      next.email = 'Email is required.'
    } else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim())) {
      next.email = 'Enter a valid email address.'
    }

    if (!password) {
      next.password = 'Password is required.'
    }

    setErrors(next)
    return Object.keys(next).length === 0
  }

  const handleSubmit = (event: SyntheticEvent) => {
    event.preventDefault()
    if (!formCheck()) return
    loginMutation.mutate({ email: email.trim(), password })
  }

  useEffect(() => {
    if (loginMutation.isSuccess) {
      onLoginSuccess?.()
    }
  }, [loginMutation.isSuccess, onLoginSuccess])

  return (
    <section className="page-form">
      <div className="form-card">
        <h1>Welcome back</h1>
        <p>Enter your details to sign in to your clinic account.</p>
        <form onSubmit={handleSubmit} noValidate>
          <label>
            Email address
            <input
              type="email"
              value={email}
              onChange={(e) => { setEmail(e.target.value); clearFieldError('email') }}
              placeholder="you@example.com"
              className={errors.email ? 'input-error' : ''}
            />
            {errors.email && <span className="field-error">{errors.email}</span>}
          </label>

          <label>
            Password
            <input
              type="password"
              value={password}
              onChange={(e) => { setPassword(e.target.value); clearFieldError('password') }}
              placeholder="Enter your password"
              className={errors.password ? 'input-error' : ''}
            />
            {errors.password && <span className="field-error">{errors.password}</span>}
          </label>

          <button type="submit" className="primary-btn" disabled={loginMutation.isPending}>
            {loginMutation.isPending ? 'Logging in...' : 'Login'}
          </button>

          {loginMutation.isError && (
            <p className="error-message">Login failed. Please check your email and password.</p>
          )}
        </form>
      </div>
    </section>
  )
}
