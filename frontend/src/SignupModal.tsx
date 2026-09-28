import { useEffect, useState } from 'react'
import type { FormEvent } from 'react'
import { ArrowRight, Eye, EyeOff, RefreshCw, ShieldCheck, UserPlus, X } from 'lucide-react'
import { api } from './api'
import { messageOf } from './ui'
import { toast } from 'sonner'

interface SignupModalProps {
  isOpen: boolean
  onClose: () => void
  onSuccess: (email: string) => void
}

export default function SignupModal({ isOpen, onClose, onSuccess }: SignupModalProps) {
  const [fullName, setFullName] = useState('')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [showPassword, setShowPassword] = useState(false)
  const [showConfirmPassword, setShowConfirmPassword] = useState(false)
  const [busy, setBusy] = useState(false)
  const [errors, setErrors] = useState<Record<string, string>>({})
  const [apiError, setApiError] = useState<string | null>(null)

  // Close on Escape key
  useEffect(() => {
    if (!isOpen) return
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && !busy) {
        onClose()
      }
    }
    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [isOpen, busy, onClose])

  if (!isOpen) return null

  const validate = (): boolean => {
    const errs: Record<string, string> = {}
    const trimmedName = fullName.trim()
    const trimmedEmail = email.trim()

    if (!trimmedName) {
      errs.fullName = 'Full Name is required'
    } else if (trimmedName.length < 2) {
      errs.fullName = 'Please enter a valid full name'
    }

    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
    if (!trimmedEmail) {
      errs.email = 'Email address is required'
    } else if (!emailRegex.test(trimmedEmail)) {
      errs.email = 'Please enter a valid email address'
    }

    if (!password) {
      errs.password = 'Password is required'
    } else if (password.length < 8) {
      errs.password = 'Password must be at least 8 characters'
    }

    if (!confirmPassword) {
      errs.confirmPassword = 'Confirm Password is required'
    } else if (password !== confirmPassword) {
      errs.confirmPassword = 'Passwords do not match'
    }

    setErrors(errs)
    return Object.keys(errs).length === 0
  }

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault()
    setApiError(null)

    if (!validate() || busy) return

    setBusy(true)
    try {
      await api.register({
        email: email.trim().toLowerCase(),
        full_name: fullName.trim(),
        password,
      })
      onSuccess(email.trim().toLowerCase())
    } catch (err: unknown) {
      const msg = messageOf(err)
      if (msg.toLowerCase().includes('already registered') || msg.toLowerCase().includes('already exists') || (err as { status?: number })?.status === 409) {
        setApiError('An account with this email already exists.')
      } else {
        setApiError(msg || 'Unable to create account. Please try again.')
      }
      toast.error(msg || 'Registration failed')
    } finally {
      setBusy(false)
    }
  }

  return (
    <div
      className="signup-modal-backdrop"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget && !busy) onClose()
      }}
      role="dialog"
      aria-modal="true"
      aria-labelledby="signup-modal-title"
    >
      <div className="signup-modal-card card" onMouseDown={(e) => e.stopPropagation()}>
        <header className="signup-modal-header">
          <div className="signup-modal-header-text">
            <div className="signup-badge">
              <UserPlus size={16} />
              <span>Customer Registration</span>
            </div>
            <h2 id="signup-modal-title">Create your account</h2>
            <p className="signup-subtitle">
              Create an account to access your personalized customer panel.
            </p>
          </div>
          <button
            type="button"
            className="signup-modal-close"
            onClick={onClose}
            disabled={busy}
            title="Close"
            aria-label="Close signup modal"
          >
            <X size={18} />
          </button>
        </header>

        {apiError && (
          <div className="signup-alert-error" role="alert">
            <span>{apiError}</span>
          </div>
        )}

        <form className="signup-modal-form" onSubmit={handleSubmit} noValidate>
          <div className="signup-fields-group">
            <label className="signup-input-label">
              <span>Full Name</span>
              <input
                type="text"
                value={fullName}
                onChange={(e) => {
                  setFullName(e.target.value)
                  if (errors.fullName) setErrors((prev) => ({ ...prev, fullName: '' }))
                }}
                placeholder="Jane Doe"
                autoComplete="name"
                disabled={busy}
                required
                className={errors.fullName ? 'has-error' : ''}
              />
              {errors.fullName && <small className="field-error-msg">{errors.fullName}</small>}
            </label>

            <label className="signup-input-label">
              <span>Email Address</span>
              <input
                type="email"
                value={email}
                onChange={(e) => {
                  setEmail(e.target.value)
                  if (errors.email) setErrors((prev) => ({ ...prev, email: '' }))
                }}
                placeholder="name@example.com"
                autoComplete="email"
                disabled={busy}
                required
                className={errors.email ? 'has-error' : ''}
              />
              {errors.email && <small className="field-error-msg">{errors.email}</small>}
            </label>

            <label className="signup-input-label">
              <span>Password</span>
              <div className="password-input-wrap">
                <input
                  type={showPassword ? 'text' : 'password'}
                  value={password}
                  onChange={(e) => {
                    setPassword(e.target.value)
                    if (errors.password) setErrors((prev) => ({ ...prev, password: '' }))
                    if (confirmPassword && e.target.value !== confirmPassword) {
                      setErrors((prev) => ({ ...prev, confirmPassword: 'Passwords do not match' }))
                    } else if (confirmPassword && e.target.value === confirmPassword) {
                      setErrors((prev) => ({ ...prev, confirmPassword: '' }))
                    }
                  }}
                  placeholder="At least 8 characters"
                  autoComplete="new-password"
                  disabled={busy}
                  required
                  className={errors.password ? 'has-error' : ''}
                />
                <button
                  type="button"
                  className="password-toggle-btn"
                  onClick={() => setShowPassword((v) => !v)}
                  tabIndex={-1}
                  aria-label={showPassword ? 'Hide password' : 'Show password'}
                  title={showPassword ? 'Hide password' : 'Show password'}
                >
                  {showPassword ? <EyeOff size={16} /> : <Eye size={16} />}
                </button>
              </div>
              {errors.password && <small className="field-error-msg">{errors.password}</small>}
            </label>

            <label className="signup-input-label">
              <span>Confirm Password</span>
              <div className="password-input-wrap">
                <input
                  type={showConfirmPassword ? 'text' : 'password'}
                  value={confirmPassword}
                  onChange={(e) => {
                    setConfirmPassword(e.target.value)
                    if (errors.confirmPassword) setErrors((prev) => ({ ...prev, confirmPassword: '' }))
                    if (password && e.target.value !== password) {
                      setErrors((prev) => ({ ...prev, confirmPassword: 'Passwords do not match' }))
                    }
                  }}
                  placeholder="Re-enter your password"
                  autoComplete="new-password"
                  disabled={busy}
                  required
                  className={errors.confirmPassword ? 'has-error' : ''}
                />
                <button
                  type="button"
                  className="password-toggle-btn"
                  onClick={() => setShowConfirmPassword((v) => !v)}
                  tabIndex={-1}
                  aria-label={showConfirmPassword ? 'Hide confirm password' : 'Show confirm password'}
                  title={showConfirmPassword ? 'Hide confirm password' : 'Show confirm password'}
                >
                  {showConfirmPassword ? <EyeOff size={16} /> : <Eye size={16} />}
                </button>
              </div>
              {errors.confirmPassword && <small className="field-error-msg">{errors.confirmPassword}</small>}
            </label>
          </div>

          <button className="button primary full signup-submit-btn" disabled={busy} type="submit">
            {busy ? (
              <>
                <RefreshCw className="spin" size={16} />
                <span>Creating Account…</span>
              </>
            ) : (
              <>
                <span>Create Account</span>
                <ArrowRight size={16} />
              </>
            )}
          </button>

          <div className="signup-modal-footer">
            <span className="login-switch-text">Already have an account?</span>{' '}
            <button
              type="button"
              className="login-switch-btn"
              onClick={onClose}
              disabled={busy}
            >
              Login
            </button>
          </div>

          <div className="signup-security-note">
            <ShieldCheck size={14} />
            <span>Encrypted credentials · Argon2 password hashing · Protected customer panel</span>
          </div>
        </form>
      </div>
    </div>
  )
}
