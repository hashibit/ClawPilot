import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { useNavigate } from 'react-router-dom'
import { useOpc } from '../contexts/OpcContext'
import { createOpc } from '../lib/api'
import type { OpcConfig } from '../lib/types'
import { Icon } from '../components/Icon'
import { toast } from '../components/Toast'

export default function CompanyListPage() {
  const { t } = useTranslation()
  const navigate = useNavigate()
  const { opcs, selectOpc, reload } = useOpc()
  const [showCreate, setShowCreate] = useState(false)
  const [createName, setCreateName] = useState('')
  const [createDisplayName, setCreateDisplayName] = useState('')
  const [creating, setCreating] = useState(false)

  const handleEnterOpc = (opc: OpcConfig) => {
    selectOpc(opc)
    navigate('/agents')
  }

  const handleCreate = async () => {
    if (!createName.trim() || !createDisplayName.trim()) {
      toast(t('opc.form.required_name', '请填写名称'), 'error'); return
    }
    setCreating(true)
    const now = Math.floor(Date.now() / 1000)
    try {
      await createOpc({
        id: crypto.randomUUID(), name: createName.trim(), display_name: createDisplayName.trim(),
        avatar_color: ['#8b5cf6', '#10b981', '#f59e0b', '#3b82f6', '#f43f5e'][opcs.length % 5],
        avatar_initials: createDisplayName.trim().slice(0, 2),
        is_active: false, is_running: false, agent_count: 0, channel_count: 0,
        message_count_today: 0, message_growth: 0, created_at: now, updated_at: now,
      })
      toast(t('opc.create_success'), 'success')
      setShowCreate(false); setCreateName(''); setCreateDisplayName('')
      await reload()
    } catch (e) { toast(String(e), 'error') }
    finally { setCreating(false) }
  }

  return (
    <div style={{ flex: 1, overflow: 'hidden', display: 'flex', flexDirection: 'column' }}>
      <div data-tauri-drag-region className="toolbar" style={{ justifyContent: 'space-between' }}>
        <span style={{ fontSize: '15px', fontWeight: 600 }}>{t('nav.company_list', '公司列表')}</span>
        <button className="tbtn tbtn-accent" style={{ fontSize: '12px' }} onClick={() => setShowCreate(true)}>
          <Icon name="plus" size={12} style={{ marginRight: '4px' }} />
          {t('opc.button_create_new', '创建公司')}
        </button>
      </div>

      <div style={{ flex: 1, overflowY: 'auto', padding: '16px 20px' }}>
        {/* Create form */}
        {showCreate && (
          <div className="stat-card" style={{ padding: '16px', marginBottom: '16px', maxWidth: '480px' }}>
            <div className="text-sm text-bold" style={{ marginBottom: '10px' }}>{t('opc.modal_title', '创建新公司')}</div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
              <input className="field-input" placeholder={t('opc.form.internal_name_placeholder', 'my-company')} value={createName} onChange={e => setCreateName(e.target.value)} />
              <input className="field-input" placeholder={t('opc.form.display_name_placeholder', '我的公司')} value={createDisplayName} onChange={e => setCreateDisplayName(e.target.value)} />
              <div style={{ display: 'flex', gap: '8px', justifyContent: 'flex-end' }}>
                <button className="tbtn tbtn-ghost" onClick={() => { setShowCreate(false); setCreateName(''); setCreateDisplayName('') }}>{t('common.button_cancel')}</button>
                <button className="tbtn tbtn-accent" disabled={creating} onClick={handleCreate}>{creating ? '...' : t('opc.button_create', '创建')}</button>
              </div>
            </div>
          </div>
        )}

        {/* Company cards */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))', gap: '12px' }}>
          {opcs.map(opc => (
            <div key={opc.id} className="stat-card" style={{ padding: '14px', display: 'flex', flexDirection: 'column', gap: '10px' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                <div className="avatar avatar-lg" style={{ background: opc.avatar_color ?? 'var(--accent)' }}>
                  {opc.avatar_initials ?? opc.display_name.slice(0, 2)}
                </div>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div className="text-sm text-bold" style={{ whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                    {opc.display_name}
                  </div>
                  <div className="text-xxs" style={{ color: opc.is_running ? 'var(--success)' : 'var(--text-dimmer)', display: 'flex', alignItems: 'center', gap: '4px' }}>
                    <span style={{ width: '5px', height: '5px', borderRadius: '50%', display: 'inline-block', background: opc.is_running ? 'var(--success)' : 'var(--text-dimmer)' }} />
                    {opc.is_running ? t('common.status_running') : t('common.status_stopped')}
                  </div>
                </div>
              </div>
              <div style={{ display: 'flex', gap: '12px', fontSize: '12px', color: 'var(--text-secondary)' }}>
                <span>{opc.agent_count} {t('overview.agents')}</span>
                <span>{opc.channel_count} {t('overview.channels')}</span>
              </div>
              <button className="tbtn tbtn-ghost" style={{ width: '100%', textAlign: 'center' }} onClick={() => handleEnterOpc(opc)}>
                {t('opc.enter', '进入公司')} <Icon name="chevron-right" size={14} style={{ marginLeft: '4px' }} />
              </button>
            </div>
          ))}
        </div>

        {opcs.length === 0 && !showCreate && (
          <div className="empty-state" style={{ paddingTop: '60px' }}>
            <Icon name="grid" size={40} style={{ color: 'var(--text-tertiary)' }} />
            <div className="empty-state-title">{t('overview.noData', '还没有公司')}</div>
            <div className="empty-state-desc">{t('overview.empty_hint', '点击右上角创建第一个公司')}</div>
          </div>
        )}
      </div>
    </div>
  )
}
