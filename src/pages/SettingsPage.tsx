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
    <div className="settings-page fade-in">
      <div style={{ marginBottom: 8 }}>
        <h1 className="page-title">{t('settings.title')}</h1>
        <p className="page-sub">全局系统配置</p>
      </div>

      {/* Workspace section */}
      <div className="settings-section">
        <div className="settings-section-head">
          <h3 className="settings-section-title">工作区</h3>
          <p className="settings-section-sub">OPC 配置根目录</p>
        </div>
        <div className="settings-section-body">
          <div className="field-row">
            <div className="field-label-cell">
              <div className="field-name">opc_root</div>
              <div className="field-hint">
                存放所有公司配置的目录，格式：{opcRoot}/{'{'}{`opc_id`}{'}'}/workspace-{'{'}{`agent_name`}{'}'}
              </div>
            </div>
            <div className="field-value-cell">
              <div style={{ display: 'flex', gap: 8 }}>
                <input
                  className="input mono"
                  style={{ flex: 1 }}
                  value={opcRoot}
                  onChange={e => setOpcRoot(e.target.value)}
                  placeholder="~/.openclaw/OPC"
                />
                <button className="btn btn-sm btn-primary" onClick={handleSave} disabled={saving}>
                  {saving ? '保存中…' : '保存'}
                </button>
              </div>
              {saveMsg && (
                <div style={{ fontSize: 12, color: saveMsg.includes('失败') ? 'var(--danger)' : 'var(--success)' }}>
                  {saveMsg}
                </div>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* Appearance section */}
      <div className="settings-section">
        <div className="settings-section-head">
          <h3 className="settings-section-title">外观</h3>
          <p className="settings-section-sub">{t('settings.languageDesc')}</p>
        </div>
        <div className="settings-section-body">
          {/* Language */}
          <div className="field-row">
            <div className="field-label-cell">
              <div className="field-name">{t('settings.language')}</div>
            </div>
            <div className="field-value-cell">
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: 8 }}>
                {LANGUAGES.map(lang => {
                  const active = currentLang === lang.code
                  return (
                    <button
                      key={lang.code}
                      onClick={() => setLanguage(lang.code)}
                      style={{
                        display: 'flex',
                        alignItems: 'center',
                        gap: 10,
                        padding: '10px 14px',
                        borderRadius: 9,
                        border: active ? '1.5px solid var(--accent-hover)' : '1px solid var(--border-subtle)',
                        background: active ? 'var(--accent-muted)' : 'rgba(255,255,255,0.04)',
                        cursor: 'pointer',
                        textAlign: 'left',
                        transition: 'all 0.15s ease',
                        direction: 'ltr',
                      }}
                    >
                      <span style={{ fontSize: 20, lineHeight: 1, flexShrink: 0 }}>{lang.flag}</span>
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{
                          fontSize: 13, fontWeight: 500,
                          color: active ? 'var(--accent-hover)' : 'var(--text-primary)',
                          overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                        }}>
                          {lang.label}
                        </div>
                        <div style={{ fontSize: 10, color: 'var(--text-muted)', marginTop: 1 }}>
                          {lang.code}{lang.rtl ? ' · RTL' : ''}
                        </div>
                      </div>
                      {active && <Icon name="check" size={14} stroke="#a78bfa" strokeWidth={2.5} />}
                    </button>
                  )
                })}
              </div>
              {isRtl(currentLang) && (
                <div style={{
                  marginTop: 10, padding: '8px 12px', borderRadius: 7,
                  background: 'var(--accent-muted)', border: '1px solid rgba(167,139,250,0.25)',
                  fontSize: 11, color: 'var(--accent-hover)', display: 'flex', alignItems: 'center', gap: 6,
                }}>
                  <Icon name="info" size={12} />
                  RTL layout active — text flows right to left
                </div>
              )}
            </div>
          </div>

          {/* Theme */}
          <div className="field-row">
            <div className="field-label-cell">
              <div className="field-name">{t('settings.theme')}</div>
              <div className="field-hint">{t('settings.themeDesc')}</div>
            </div>
            <div className="field-value-cell">
              <div style={{
                display: 'flex', alignItems: 'center', gap: 10,
                padding: '10px 14px', borderRadius: 9,
                border: '1.5px solid var(--accent-hover)',
                background: 'var(--accent-muted)',
                width: 'fit-content',
              }}>
                <Icon name="moon" size={16} stroke="#a78bfa" strokeWidth={2} />
                <span style={{ fontSize: 13, color: 'var(--accent-hover)', fontWeight: 500 }}>{t('settings.dark')}</span>
                <Icon name="check" size={14} stroke="#a78bfa" strokeWidth={2.5} />
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* License section */}
      {license && (
        <div className="settings-section">
          <div className="settings-section-head">
            <h3 className="settings-section-title">License</h3>
            <p className="settings-section-sub">Your license activation status</p>
          </div>
          <div className="settings-section-body">
            <div className="field-row">
              <div className="field-label-cell">
                <div className="field-name">激活状态</div>
              </div>
              <div className="field-value-cell">
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                    <span className={license.activated ? 'dot live' : 'dot danger'} style={{ width: 8, height: 8, borderRadius: '50%', display: 'inline-block' }} />
                    <span style={{ fontSize: 13, color: 'var(--text-primary)', fontWeight: 500 }}>
                      {license.activated ? 'Activated' : 'Not activated'}
                    </span>
                  </div>
                  {license.activated && (
                    <button
                      onClick={handleDeactivate}
                      className="btn btn-sm btn-danger"
                    >
                      Deactivate
                    </button>
                  )}
                </div>
                {license.license_key && (
                  <div className="mono" style={{ fontSize: 12, color: 'var(--text-muted)' }}>
                    {license.license_key}
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* About section */}
      <div className="settings-section">
        <div className="settings-section-head">
          <h3 className="settings-section-title">{t('settings.about')}</h3>
        </div>
        <div className="settings-section-body">
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 10 }}>
            <div className="logo-box">
              <Icon name="bolt" size={13} stroke="white" strokeWidth={2.2} />
            </div>
            <span style={{ fontSize: 14, fontWeight: 700, color: 'var(--text-primary)' }}>ClawPilot</span>
          </div>
          <div style={{ fontSize: 12, color: 'var(--text-muted)', lineHeight: 1.6 }}>
            {t('settings.appDesc')}
          </div>
          <div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 8 }}>
            {t('settings.version')} 0.1.0
          </div>
        </div>
      </div>
    </div>
  )
}
