import { useState, useEffect, type SyntheticEvent } from 'react'
import { useCreatePatient } from '../services/queries'

type SignupProps = {
  onSignupSuccess?: () => void
}

type SignupErrors = {
  firstname?: string
  lastname?: string
  email?: string
  password?: string
  dateOfBirth?: string
}

export function Signup({ onSignupSuccess }: SignupProps) {
  const [firstname, setFirstname] = useState('')
  const [lastname, setLastname] = useState('')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [dateOfBirth, setDateOfBirth] = useState('')
  const [errors, setErrors] = useState<SignupErrors>({})
  const createPatientMutation = useCreatePatient()

  const clearFieldError = (field: keyof SignupErrors) =>
    setErrors(prev => ({ ...prev, [field]: undefined }))

  const formCheck = (): boolean => {
    const next: SignupErrors = {}

    if (!firstname.trim()) {
      next.firstname = 'First name is required.'
    } else if (firstname.trim().length < 2) {
      next.firstname = 'First name must be at least 2 characters.'
    } else if (!/^[a-zA-Z\s'\-]+$/.test(firstname.trim())) {
      next.firstname = 'First name must contain only letters.'
    }

    if (!lastname.trim()) {
      next.lastname = 'Last name is required.'
    } else if (lastname.trim().length < 2) {
      next.lastname = 'Last name must be at least 2 characters.'
    } else if (!/^[a-zA-Z\s'\-]+$/.test(lastname.trim())) {
      next.lastname = 'Last name must contain only letters.'
    }

    if (!email.trim()) {
      next.email = 'Email is required.'
    } else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim())) {
      next.email = 'Enter a valid email address.'
    }

    if (!password) {
      next.password = 'Password is required.'
    } else if (password.length < 8) {
      next.password = 'Password must be at least 8 characters.'
    } else if (!/[A-Z]/.test(password)) {
      next.password = 'Password must contain at least one uppercase letter.'
    } else if (!/[a-z]/.test(password)) {
      next.password = 'Password must contain at least one lowercase letter.'
    } else if (!/[0-9]/.test(password)) {
      next.password = 'Password must contain at least one number.'
    }

    if (!dateOfBirth) {
      next.dateOfBirth = 'Date of birth is required.'
    } else {
      const dob = new Date(dateOfBirth)
      const now = new Date()
      const minDob = new Date()
      minDob.setFullYear(now.getFullYear() - 130)
      if (isNaN(dob.getTime())) {
        next.dateOfBirth = 'Enter a valid date.'
      } else if (dob >= now) {
        next.dateOfBirth = 'Date of birth must be in the past.'
      } else if (dob < minDob) {
        next.dateOfBirth = 'Enter a valid date of birth.'
      }
    }

    setErrors(next)
    return Object.keys(next).length === 0
  }

  const handleSubmit = (event: SyntheticEvent) => {
    event.preventDefault()
    if (!formCheck()) return
    createPatientMutation.mutate({
      first_name: firstname.trim(),
      last_name: lastname.trim(),
      email: email.trim(),
      password,
      date_of_birth: dateOfBirth,
    })
  }

  useEffect(() => {
    if (createPatientMutation.isSuccess) {
      onSignupSuccess?.()
    }
  }, [createPatientMutation.isSuccess, onSignupSuccess])

  return (
    <section className="page-form">
      <div className="form-card">
        <h1>Create an account</h1>
        <p>Sign up now to manage patient intake and appointments securely.</p>
        <form onSubmit={handleSubmit} noValidate>
          <label>
            First name
            <input
              type="text"
              value={firstname}
              onChange={(e) => { setFirstname(e.target.value); clearFieldError('firstname') }}
              placeholder="Jane"
              className={errors.firstname ? 'input-error' : ''}
            />
            {errors.firstname && <span className="field-error">{errors.firstname}</span>}
          </label>

          <label>
            Last name
            <input
              type="text"
              value={lastname}
              onChange={(e) => { setLastname(e.target.value); clearFieldError('lastname') }}
              placeholder="Doe"
              className={errors.lastname ? 'input-error' : ''}
            />
            {errors.lastname && <span className="field-error">{errors.lastname}</span>}
          </label>

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
              placeholder="Create a password"
              className={errors.password ? 'input-error' : ''}
            />
            {errors.password && <span className="field-error">{errors.password}</span>}
          </label>

          <label>
            Date of birth
            <input
              type="date"
              value={dateOfBirth}
              onChange={(e) => { setDateOfBirth(e.target.value); clearFieldError('dateOfBirth') }}
              className={errors.dateOfBirth ? 'input-error' : ''}
            />
            {errors.dateOfBirth && <span className="field-error">{errors.dateOfBirth}</span>}
          </label>

          <button type="submit" className="primary-btn" disabled={createPatientMutation.isPending}>
            {createPatientMutation.isPending ? 'Signing up...' : 'Sign up'}
          </button>

          {createPatientMutation.isError && (
            <p className="error-message">Signup failed. Please try again.</p>
          )}
        </form>
      </div>
    </section>
  )
}
