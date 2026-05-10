import { useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { useNavigate } from 'react-router-dom'
import { useOpc } from '../contexts/OpcContext'
import { createOpc, deleteOpc } from '../lib/api'
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
  const [search, setSearch] = useState('')
  const [filter, setFilter] = useState<'all' | 'running' | 'stopped'>('all')
  const [deletingId, setDeletingId] = useState<string | null>(null)

  const handleEnterOpc = (opc: OpcConfig) => {
    selectOpc(opc)
    navigate('/agents')
  }

  const handleDelete = async (opc: OpcConfig) => {
    const confirmMsg = t(
      'opc.delete_confirm',
      `确定要删除公司「${opc.display_name}」吗？该操作无法撤销。`,
      { name: opc.display_name },
    )
    if (!window.confirm(confirmMsg)) return
    setDeletingId(opc.id)
    try {
      await deleteOpc(opc.id)
      toast(t('opc.delete_success', '公司已删除'), 'success')
      await reload()
    } catch (e) {
      toast(String(e), 'error')
    } finally {
      setDeletingId(null)
    }
  }

  const filteredOpcs = useMemo(() => {
    const q = search.trim().toLowerCase()
    return opcs.filter(o => {
      if (filter === 'running' && !o.is_running) return false
      if (filter === 'stopped' && o.is_running) return false
      if (!q) return true
      return o.display_name.toLowerCase().includes(q) || o.name.toLowerCase().includes(q)
    })
  }, [opcs, search, filter])

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
    <div className="companies fade-in">
      <div>
        <h1 className="page-title">公司列表</h1>
        <p className="page-sub">管理 OPC 团队配置</p>
      </div>

      <div className="toolbar" style={{ marginTop: 24, height: 'auto', border: 'none', padding: 0 }}>
        <input
          className="search-input"
          placeholder="搜索公司名称…"
          value={search}
          onChange={e => setSearch(e.target.value)}
        />
        <div className="filter-tabs">
          {(['all', 'running', 'stopped'] as const).map(f => (
            <button
              key={f}
              className={`filter-tab${filter === f ? ' active' : ''}`}
              onClick={() => setFilter(f)}
            >
              {f === 'all' ? '全部' : f === 'running' ? '运行中' : '已停止'}
            </button>
          ))}
        </div>
        <div className="toolbar-spacer" />
        <button className="btn btn-primary" onClick={() => setShowCreate(true)}>
          <Icon name="plus" size={14} /> 创建公司
        </button>
      </div>

      {showCreate && (
        <div className="stat-card" style={{ padding: '16px', marginTop: '16px', maxWidth: '480px' }}>
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

      <div className="company-grid">
        {filteredOpcs.map(opc => (
          <div key={opc.id} className="company-card">
            <div className="company-card-head">
              <div
                className="company-avatar"
                style={{ background: opc.avatar_color ?? 'var(--accent)' }}
              >
                {opc.avatar_initials || opc.display_name.slice(0, 1)}
              </div>
              <div className="company-card-info">
                <div className="company-card-name">{opc.display_name}</div>
                <div className="company-card-id">{opc.name}</div>
              </div>
              {opc.is_running
                ? <span className="tag success"><span className="dot live" /> 运行中</span>
                : <span className="tag"><span className="dot" /> 已停止</span>}
            </div>
            <div className="company-card-stats">
              <div className="stat-item">
                <div className="stat-num">{opc.agent_count}</div>
                <div className="stat-lbl">智能体</div>
              </div>
              <div className="stat-item">
                <div className="stat-num">{opc.channel_count}</div>
                <div className="stat-lbl">频道</div>
              </div>
              <div className="stat-item">
                <div className="stat-num">{opc.message_count_today || '—'}</div>
                <div className="stat-lbl">今日消息</div>
              </div>
            </div>
            <div className="company-card-actions">
              <button className="btn btn-primary btn-sm" onClick={() => handleEnterOpc(opc)}>
                进入公司 <Icon name="arrow-right" size={12} />
              </button>
              <button
                className="btn btn-sm btn-ghost btn-icon"
                disabled={deletingId === opc.id}
                onClick={() => handleDelete(opc)}
              >
                <Icon name="trash" size={14} />
              </button>
            </div>
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

      {opcs.length > 0 && filteredOpcs.length === 0 && (
        <div className="empty-state" style={{ paddingTop: '40px' }}>
          <Icon name="search" size={32} style={{ color: 'var(--text-tertiary)' }} />
          <div className="empty-state-title">{t('opc.search_no_results', '没有匹配的公司')}</div>
        </div>
      )}
    </div>
  )
}
