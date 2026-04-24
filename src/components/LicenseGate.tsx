import { useState, useEffect } from 'react'
import { getLicenseStatus, activateLicense } from '../lib/api'
import { Icon } from './Icon'

// Check if we're in development mode (skip license gate during development)
const IS_DEV = process.env.NODE_ENV === 'development' || import.meta.env.DEV

export default function LicenseGate({ children }: { children: React.ReactNode }) {
  const [activated, setActivated] = useState<boolean | null>(null) // null = loading
  const [key, setKey] = useState('')
  const [error, setError] = useState('')
  const [submitting, setSubmitting] = useState(false)

  useEffect(() => {
    // Skip license check in development
    if (IS_DEV) {
      setActivated(true)
      return
    }

    getLicenseStatus()
      .then(s => setActivated(s.activated))
      .catch(() => setActivated(false))
  }, [])

  const handleActivate = async () => {
    if (!key.trim()) return
    setSubmitting(true)
    setError('')
    try {
      await activateLicense(key.trim())
      setActivated(true)
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Invalid license key')
    }
    setSubmitting(false)
  }

  // Skip activation in development
  if (IS_DEV) return <>{children}</>

  // Loading state
  if (activated === null) {
    return (
      <div style={{
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        height: '100vh', background: 'var(--bg-base)', color: 'var(--text-dimmer)',
        fontSize: '13px',
      }}>
        Loading...
      </div>
    )
  }

  // Activated — render app
  if (activated) return <>{children}</>

  // Activation screen
  return (
    <div style={{
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      height: '100vh', background: 'var(--bg-base)',
    }}>
      <div style={{
        width: '380px', padding: '40px 36px', borderRadius: '16px',
        background: 'var(--bg-surface)',
        border: '1px solid var(--border-subtle)',
      }}>
        {/* Logo */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '8px' }}>
          <div className="logo-box">
            <Icon name="bolt" size={13} stroke="white" strokeWidth={2.2} />
          </div>
          <span style={{ fontSize: '18px', fontWeight: 700, color: 'var(--text-primary)' }}>ClawPilot</span>
        </div>

        <div style={{ fontSize: '13px', color: 'var(--text-dimmer)', marginBottom: '28px', lineHeight: 1.5 }}>
          Enter your license key to activate ClawPilot.
        </div>

        {/* Key input */}
        <input
          type="text"
          value={key}
          onChange={e => setKey(e.target.value.toUpperCase())}
          onKeyDown={e => e.key === 'Enter' && handleActivate()}
          placeholder="CLAW-PILOT-XXXX-XXXX-XXX"
          autoFocus
          style={{
            width: '100%', padding: '12px 14px', borderRadius: '9px',
            border: error
              ? '1.5px solid var(--error)'
              : '1px solid var(--border-subtle)',
            background: 'var(--bg-elevated)',
            color: 'var(--text-primary)', fontSize: '14px', fontFamily: 'monospace',
            letterSpacing: '0.5px', outline: 'none', boxSizing: 'border-box',
          }}
        />

        {error && (
          <div style={{
            marginTop: '8px', fontSize: '12px', color: 'var(--error)',
          }}>
            {error}
          </div>
        )}

        <button
          onClick={handleActivate}
          disabled={submitting || !key.trim()}
          className="tbtn tbtn-primary"
          style={{
            width: '100%', marginTop: '16px', padding: '12px',
            borderRadius: '9px',
            opacity: submitting || !key.trim() ? 0.5 : 1,
            cursor: submitting || !key.trim() ? 'not-allowed' : 'pointer',
          }}
        >
          {submitting ? 'Activating...' : 'Activate'}
        </button>

        <div style={{
          marginTop: '20px', fontSize: '11px', color: 'var(--text-dimmer)',
          textAlign: 'center', lineHeight: 1.5,
        }}>
          Contact support to get your license key
        </div>
      </div>
    </div>
  )
}
