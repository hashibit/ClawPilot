import { useTranslation } from 'react-i18next'
import { LANGUAGES, setLanguage, isRtl } from '../i18n'
import { Icon } from '../components/Icon'
import { useState, useEffect } from 'react'
import { call, getLicenseStatus, deactivateLicense, type LicenseStatus } from '../lib/api'

export default function SettingsPage() {
  const { t, i18n } = useTranslation()
  const currentLang = i18n.language

  const [opcRoot, setOpcRoot] = useState('~/.openclaw/OPC')
  const [saving, setSaving] = useState(false)
  const [saveMsg, setSaveMsg] = useState('')
  const [license, setLicense] = useState<LicenseStatus | null>(null)

  useEffect(() => {
    call<string>('get_opc_root', {}).then(root => {
      if (root) setOpcRoot(root)
    }).catch(() => {})
    getLicenseStatus().then(setLicense).catch(() => {})
  }, [])

  const handleDeactivate = async () => {
    if (!confirm('Are you sure you want to deactivate your license?')) return
    try {
      await deactivateLicense()
      window.location.reload()
    } catch {}
  }

  const handleSave = async () => {
    setSaving(true)
    setSaveMsg('')
    try {
      await call('set_opc_root', { opc_root: opcRoot })
      setSaveMsg(t('settings.saved'))
      setTimeout(() => setSaveMsg(''), 2000)
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : String(e)
      setSaveMsg(t('settings.save_failed', { msg }))
    }
    setSaving(false)
  }

  return (
    <div style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
      <div data-tauri-drag-region className="toolbar" style={{ justifyContent: 'flex-start' }}>
        <span style={{ fontSize: '15px', fontWeight: 600 }}>{t('settings.title')}</span>
      </div>

      <div style={{ flex: 1, overflowY: 'auto', padding: '20px 24px', maxWidth: '600px' }}>

        {/* Language */}
        <section style={{ marginBottom: '28px' }}>
          <div style={{ fontSize: '13px', fontWeight: 600, color: '#EBEBF5', marginBottom: '4px' }}>
            {t('settings.language')}
          </div>
          <div style={{ fontSize: '11px', color: '#8E8E93', marginBottom: '12px' }}>
            {t('settings.languageDesc')}
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: '8px' }}>
            {LANGUAGES.map(lang => {
              const active = currentLang === lang.code
              return (
                <button
                  key={lang.code}
                  onClick={() => setLanguage(lang.code)}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: '10px',
                    padding: '10px 14px',
                    borderRadius: '9px',
                    border: active
                      ? '1.5px solid rgba(167,139,250,0.7)'
                      : '1px solid rgba(255,255,255,0.08)',
                    background: active
                      ? 'rgba(139,92,246,0.15)'
                      : 'rgba(255,255,255,0.04)',
                    cursor: 'pointer',
                    textAlign: 'left',
                    transition: 'all 0.15s ease',
                    direction: 'ltr',
                  }}
                >
                  <span style={{ fontSize: '20px', lineHeight: 1, flexShrink: 0 }}>{lang.flag}</span>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{
                      fontSize: '13px', fontWeight: 500,
                      color: active ? '#a78bfa' : '#EBEBF5',
                      overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                    }}>
                      {lang.label}
                    </div>
                    <div style={{ fontSize: '10px', color: '#8E8E93', marginTop: '1px' }}>
                      {lang.code}{lang.rtl ? ' · RTL' : ''}
                    </div>
                  </div>
                  {active && (
                    <div style={{ flexShrink: 0 }}>
                      <Icon name="check" size={14} stroke="#a78bfa" strokeWidth={2.5} />
                    </div>
                  )}
                </button>
              )
            })}
          </div>

          {isRtl(currentLang) && (
            <div style={{
              marginTop: '10px', padding: '8px 12px', borderRadius: '7px',
              background: 'rgba(167,139,250,0.1)', border: '1px solid rgba(167,139,250,0.25)',
              fontSize: '11px', color: '#a78bfa', display: 'flex', alignItems: 'center', gap: '6px',
            }}>
              <Icon name="info" size={12} />
              RTL layout active — text flows right to left
            </div>
          )}
        </section>

        {/* Theme */}
        <section style={{ marginBottom: '28px' }}>
          <div style={{ fontSize: '13px', fontWeight: 600, color: '#EBEBF5', marginBottom: '4px' }}>
            {t('settings.theme')}
          </div>
          <div style={{ fontSize: '11px', color: '#8E8E93', marginBottom: '12px' }}>
            {t('settings.themeDesc')}
          </div>
          <div style={{
            display: 'flex', alignItems: 'center', gap: '10px',
            padding: '10px 14px', borderRadius: '9px',
            border: '1.5px solid rgba(167,139,250,0.7)',
            background: 'rgba(139,92,246,0.15)',
            width: 'fit-content',
          }}>
            <Icon name="moon" size={16} stroke="#a78bfa" strokeWidth={2} />
            <span style={{ fontSize: '13px', color: '#a78bfa', fontWeight: 500 }}>{t('settings.dark')}</span>
            <Icon name="check" size={14} stroke="#a78bfa" strokeWidth={2.5} />
          </div>
        </section>

        {/* Deployment Directory */}
        <section style={{ marginBottom: '28px' }}>
          <div style={{ fontSize: '13px', fontWeight: 600, color: '#EBEBF5', marginBottom: '4px' }}>
            部署目录
          </div>
          <div style={{ fontSize: '11px', color: '#8E8E93', marginBottom: '12px' }}>
            OPC 部署根目录，格式：{opcRoot}/{'{opc_id}'}/workspace-{'{agent_name}'}
          </div>

          <div style={{
            display: 'flex', alignItems: 'center', gap: '8px',
          }}>
            <input
              type="text"
              value={opcRoot}
              onChange={e => setOpcRoot(e.target.value)}
              placeholder="~/.openclaw/OPC"
              style={{
                flex: 1,
                padding: '10px 14px',
                borderRadius: '9px',
                border: '1px solid rgba(255,255,255,0.08)',
                background: 'rgba(255,255,255,0.04)',
                color: '#EBEBF5',
                fontSize: '13px',
                outline: 'none',
                fontFamily: 'monospace',
              }}
            />
            <button
              onClick={handleSave}
              disabled={saving}
              style={{
                padding: '10px 16px',
                borderRadius: '9px',
                border: 'none',
                background: saving ? 'rgba(139,92,246,0.3)' : 'rgba(139,92,246,0.7)',
                color: '#fff',
                fontSize: '13px',
                fontWeight: 500,
                cursor: saving ? 'not-allowed' : 'pointer',
              }}
            >
              {saving ? '保存中…' : '保存'}
            </button>
          </div>
          {saveMsg && (
            <div style={{
              marginTop: '8px', fontSize: '12px',
              color: saveMsg.includes('失败') ? '#ff6b6b' : '#34c759',
            }}>
              {saveMsg}
            </div>
          )}
        </section>

        {/* License */}
        {license && (
          <section style={{ marginBottom: '28px' }}>
            <div style={{ fontSize: '13px', fontWeight: 600, color: '#EBEBF5', marginBottom: '4px' }}>
              License
            </div>
            <div style={{ fontSize: '11px', color: '#8E8E93', marginBottom: '12px' }}>
              Your license activation status
            </div>
            <div style={{
              padding: '14px 16px', borderRadius: '9px',
              border: '1px solid rgba(255,255,255,0.08)',
              background: 'rgba(255,255,255,0.03)',
              display: 'flex', alignItems: 'center', justifyContent: 'space-between',
            }}>
              <div>
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '4px' }}>
                  <div style={{
                    width: '8px', height: '8px', borderRadius: '50%',
                    background: license.activated ? '#34C759' : '#FF453A',
                  }} />
                  <span style={{ fontSize: '13px', color: '#EBEBF5', fontWeight: 500 }}>
                    {license.activated ? 'Activated' : 'Not activated'}
                  </span>
                </div>
                {license.license_key && (
                  <div style={{ fontSize: '12px', color: '#8E8E93', fontFamily: 'monospace' }}>
                    {license.license_key}
                  </div>
                )}
              </div>
              {license.activated && (
                <button
                  onClick={handleDeactivate}
                  style={{
                    padding: '6px 12px', borderRadius: '7px',
                    border: '1px solid rgba(255,69,58,0.3)',
                    background: 'transparent', color: '#FF453A',
                    fontSize: '12px', cursor: 'pointer',
                  }}
                >
                  Deactivate
                </button>
              )}
            </div>
          </section>
        )}

        {/* About */}
        <section>
          <div style={{ fontSize: '13px', fontWeight: 600, color: '#EBEBF5', marginBottom: '12px' }}>
            {t('settings.about')}
          </div>
          <div style={{
            padding: '14px 16px', borderRadius: '9px',
            border: '1px solid rgba(255,255,255,0.08)',
            background: 'rgba(255,255,255,0.03)',
          }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '10px' }}>
              <div className="logo-box">
                <Icon name="bolt" size={13} stroke="white" strokeWidth={2.2} />
              </div>
              <span style={{ fontSize: '14px', fontWeight: 700, color: '#FFFFFF' }}>ClawPilot</span>
            </div>
            <div style={{ fontSize: '12px', color: '#8E8E93', lineHeight: 1.6 }}>
              {t('settings.appDesc')}
            </div>
            <div style={{ fontSize: '11px', color: '#636366', marginTop: '8px' }}>
              {t('settings.version')} 0.1.0
            </div>
          </div>
        </section>
      </div>
    </div>
  )
}
