import { useState, useEffect } from 'react'
import { getLicenseStatus, activateLicense } from '../lib/api'
import { Icon } from './Icon'

export default function LicenseGate({ children }: { children: React.ReactNode }) {
  const [activated, setActivated] = useState<boolean | null>(null) // null = loading
  const [key, setKey] = useState('')
  const [error, setError] = useState('')
  const [submitting, setSubmitting] = useState(false)

  useEffect(() => {
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
    } catch (e: any) {
      setError(e?.message || 'Invalid license key')
    }
    setSubmitting(false)
  }

  // Loading state
  if (activated === null) {
    return (
      <div style={{
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        height: '100vh', background: '#1C1C1E', color: '#8E8E93',
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
      height: '100vh', background: '#1C1C1E',
    }}>
      <div style={{
        width: '380px', padding: '40px 36px', borderRadius: '16px',
        background: 'rgba(255,255,255,0.03)',
        border: '1px solid rgba(255,255,255,0.08)',
      }}>
        {/* Logo */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '8px' }}>
          <div className="logo-box">
            <Icon name="bolt" size={13} stroke="white" strokeWidth={2.2} />
          </div>
          <span style={{ fontSize: '18px', fontWeight: 700, color: '#FFFFFF' }}>ClawPilot</span>
        </div>

        <div style={{ fontSize: '13px', color: '#8E8E93', marginBottom: '28px', lineHeight: 1.5 }}>
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
              ? '1.5px solid rgba(255,69,58,0.6)'
              : '1px solid rgba(255,255,255,0.12)',
            background: 'rgba(255,255,255,0.04)',
            color: '#EBEBF5', fontSize: '14px', fontFamily: 'monospace',
            letterSpacing: '0.5px', outline: 'none', boxSizing: 'border-box',
          }}
        />

        {error && (
          <div style={{
            marginTop: '8px', fontSize: '12px', color: '#FF453A',
          }}>
            {error}
          </div>
        )}

        <button
          onClick={handleActivate}
          disabled={submitting || !key.trim()}
          style={{
            width: '100%', marginTop: '16px', padding: '12px',
            borderRadius: '9px', border: 'none',
            background: submitting || !key.trim()
              ? 'rgba(139,92,246,0.3)'
              : 'rgba(139,92,246,0.8)',
            color: '#fff', fontSize: '14px', fontWeight: 600,
            cursor: submitting || !key.trim() ? 'not-allowed' : 'pointer',
            transition: 'background 0.15s ease',
          }}
        >
          {submitting ? 'Activating...' : 'Activate'}
        </button>

        <div style={{
          marginTop: '20px', fontSize: '11px', color: '#636366',
          textAlign: 'center', lineHeight: 1.5,
        }}>
          Contact support to get your license key
        </div>
      </div>
    </div>
  )
}
