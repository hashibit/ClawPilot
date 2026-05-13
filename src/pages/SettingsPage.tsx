import { useTranslation } from 'react-i18next'
import { LANGUAGES, setLanguage, isRtl } from '../i18n'
import { Icon } from '../components/Icon'
import { useState, useEffect } from 'react'
import { call, getLicenseStatus, deactivateLicense, type LicenseStatus } from '../lib/api'
import { toast } from '../components/Toast'

export default function SettingsPage() {
  const { t, i18n } = useTranslation()
  const currentLang = i18n.language

  const [opcRoot, setOpcRoot] = useState('~/.openclaw/OPC')
  const [saving, setSaving] = useState(false)
  const [license, setLicense] = useState<LicenseStatus | null>(null)

  useEffect(() => {
    call<string>('get_opc_root', {}).then(root => { if (root) setOpcRoot(root) }).catch(() => {})
    getLicenseStatus().then(setLicense).catch(() => {})
  }, [])

  const handleDeactivate = async () => {
    if (!confirm(t('settings.deactivate_license_confirm', '确定要停用许可证吗？'))) return
    try { await deactivateLicense(); window.location.reload() } catch {}
  }

  const handleSave = async () => {
    setSaving(true)
    try {
      await call('set_opc_root', { opc_root: opcRoot })
      toast(t('settings.saved'), 'success')
    } catch (e: unknown) {
      toast(e instanceof Error ? e.message : String(e), 'error')
    }
    setSaving(false)
  }

  return (
    <div className="page-scroll">

      <div>
        <h1 className="page-title">{t('settings.title')}</h1>
        <p className="page-sub">{t('settings.global_config', '全局系统配置')}</p>
      </div>

      {/* ── Workspace ── */}
      <div className="section-card">
        <div className="section-card-head">
          <div className="flex-center gap-10">
            <div style={{ width: 32, height: 32, borderRadius: 8, background: 'var(--bg-elevated)', display: 'grid', placeItems: 'center' }}>
              <Icon name="folder" size={15} />
            </div>
            <div>
              <h3 className="section-card-title">{t('settings.workspace', '工作区')}</h3>
              <div className="section-card-sub">{t('settings.workspace_subtitle', 'OPC 配置根目录')}</div>
            </div>
          </div>
        </div>
        <div className="section-card-body has-rows">
          <div className="field-row">
            <div className="field-label-cell">
              <div className="field-name">opc_root</div>
              <div className="field-hint">{t('settings.workspace_desc', '所有公司配置的存放目录')}</div>
            </div>
            <div className="field-value-cell">
              <div className="flex gap-8">
                <input className="field-input mono flex-1 text-xs" value={opcRoot} onChange={e => setOpcRoot(e.target.value)} placeholder="~/.openclaw/OPC" />
                <button className="btn btn-sm btn-primary" onClick={handleSave} disabled={saving}>
                  {saving ? '...' : t('common.button_save', '保存')}
                </button>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* ── Language ── */}
      <div className="section-card">
        <div className="section-card-head">
          <div className="flex-center gap-10">
            <div style={{ width: 32, height: 32, borderRadius: 8, background: 'var(--bg-elevated)', display: 'grid', placeItems: 'center' }}>
              <Icon name="cloud" size={15} />
            </div>
            <div>
              <h3 className="section-card-title">{t('settings.language', '语言')}</h3>
              <div className="section-card-sub">{t('settings.languageDesc')}</div>
            </div>
          </div>
        </div>
        <div className="section-card-body">
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(160px, 1fr))', gap: 8 }}>
            {LANGUAGES.map(lang => {
              const active = currentLang === lang.code
              return (
                <button
                  key={lang.code}
                  onClick={() => setLanguage(lang.code)}
                  style={{
                    display: 'flex', alignItems: 'center', gap: 10,
                    padding: '10px 14px', borderRadius: 'var(--radius-md)',
                    border: active ? '1.5px solid var(--accent)' : '1px solid var(--border-subtle)',
                    background: active ? 'var(--accent-soft)' : 'var(--bg-canvas)',
                    cursor: 'pointer', textAlign: 'left', transition: 'all 0.15s ease',
                  }}
                >
                  <div className="flex-grow">
                    <div style={{ fontSize: 13, fontWeight: 500, color: active ? 'var(--accent)' : 'var(--text-primary)' }}>
                      {lang.label}
                    </div>
                    <div className="muted mt-1" style={{ fontSize: 10 }}>
                      {lang.code}
                    </div>
                  </div>
                  {active && <Icon name="check" size={14} stroke="var(--accent)" strokeWidth={2.5} />}
                </button>
              )
            })}
          </div>
          {isRtl(currentLang) && (
            <div style={{ marginTop: 10, padding: '8px 12px', borderRadius: 'var(--radius-md)', background: 'var(--accent-soft)', fontSize: 11, color: 'var(--accent)', display: 'flex', alignItems: 'center', gap: 6 }}>
              <Icon name="info" size={12} /> RTL layout active
            </div>
          )}
        </div>
      </div>

      {/* ── Theme ── */}
      <div className="section-card">
        <div className="section-card-head">
          <div className="flex-center gap-10">
            <div style={{ width: 32, height: 32, borderRadius: 8, background: 'var(--bg-elevated)', display: 'grid', placeItems: 'center' }}>
              <Icon name="moon" size={15} />
            </div>
            <div>
              <h3 className="section-card-title">{t('settings.theme')}</h3>
              <div className="section-card-sub">{t('settings.themeDesc')}</div>
            </div>
          </div>
        </div>
        <div className="section-card-body">
          <div style={{
            display: 'inline-flex', alignItems: 'center', gap: 8,
            padding: '8px 14px', borderRadius: 'var(--radius-md)',
            border: '1.5px solid var(--accent)', background: 'var(--accent-soft)',
          }}>
            <Icon name="moon" size={14} stroke="var(--accent)" />
            <span className="text-sm" style={{ color: 'var(--accent)', fontWeight: 500 }}>{t('settings.dark')}</span>
            <Icon name="check" size={13} stroke="var(--accent)" strokeWidth={2.5} />
          </div>
        </div>
      </div>

      {/* ── License ── */}
      {license && (
        <div className="section-card">
          <div className="section-card-head">
            <div className="flex-center gap-10">
              <div style={{ width: 32, height: 32, borderRadius: 8, background: 'var(--bg-elevated)', display: 'grid', placeItems: 'center' }}>
                <Icon name="key" size={15} />
              </div>
              <div>
                <h3 className="section-card-title">{t('settings.license_section', '许可证')}</h3>
                <div className="section-card-sub">{t('settings.license_subtitle', '激活状态与密钥信息')}</div>
              </div>
            </div>
          </div>
          <div className="section-card-body">
            <div className="flex-between">
              <div className="flex-center gap-8">
                <span style={{ width: 8, height: 8, borderRadius: '50%', background: license.activated ? 'var(--success)' : 'var(--text-muted)', boxShadow: license.activated ? '0 0 6px var(--success)' : 'none' }} />
                <span className="text-sm" style={{ fontWeight: 500 }}>
                  {license.activated ? t('settings.license_activated', '已激活') : t('settings.license_not_activated', '未激活')}
                </span>
                {license.license_key && (
                  <span className="mono-xs muted" style={{ marginLeft: 8 }}>
                    {license.license_key}
                  </span>
                )}
              </div>
              {license.activated && (
                <button className="btn btn-sm btn-danger" onClick={handleDeactivate}>
                  {t('settings.deactivate', '停用')}
                </button>
              )}
            </div>
          </div>
        </div>
      )}

      {/* ── About ── */}
      <div className="section-card">
        <div className="section-card-head">
          <div className="flex-center gap-10">
            <div className="logo-box" style={{ width: 32, height: 32, borderRadius: 8, fontSize: 11 }}>CP</div>
            <div>
              <h3 className="section-card-title">ClawPilot</h3>
              <div className="section-card-sub">v0.4.2</div>
            </div>
          </div>
        </div>
        <div className="section-card-body">
          <div className="muted" style={{ fontSize: 12.5, lineHeight: 1.7 }}>
            {t('settings.appDesc')}
          </div>
        </div>
      </div>
    </div>
  )
}
