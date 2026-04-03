import { useTranslation } from 'react-i18next'
import { LANGUAGES, setLanguage, isRtl } from '../i18n'
import { Icon } from '../components/Icon'

export default function SettingsPage() {
  const { t, i18n } = useTranslation()
  const currentLang = i18n.language

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
                    direction: 'ltr', // language cards are always LTR
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

          {/* RTL hint */}
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
