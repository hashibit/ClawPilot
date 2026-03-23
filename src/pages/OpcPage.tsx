import { useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { useOpc } from '../contexts/OpcContext'
import { createOpc, deleteOpc, updateOpc, exportOpc, getOpcStats, createSnapshot, getSnapshots, restoreSnapshot, deleteSnapshot, undeploy } from '../lib/api'
import { toast } from '../components/Toast'
import type { OpcConfig, OpcStats } from '../lib/types'
import type { LocalSnapshot } from '../lib/types'

function fmtRelTime(ts: number, t: (key: string, opts?: any) => string) {
  const diff = Math.floor((Date.now() / 1000 - ts))
  if (diff < 3600) return t('common.time_minutes_ago', { count: Math.floor(diff / 60) })
  if (diff < 86400) return t('common.time_hours_ago', { count: Math.floor(diff / 3600) })
  if (diff < 604800) return t('common.time_days_ago', { count: Math.floor(diff / 86400) })
  return t('common.time_days_ago', { count: Math.floor(diff / 86400) })
}

const GRAD_PRESETS = [
  ['#8b5cf6', '#06b6d4'],
  ['#10b981', '#06b6d4'],
  ['#f59e0b', '#f97316'],
  ['#f43f5e', '#ec4899'],
  ['#3b82f6', '#8b5cf6'],
]

interface CreateModalProps {
  onClose: () => void
  onCreated: () => void
}

function CreateModal({ onClose, onCreated }: CreateModalProps) {
  const { t } = useTranslation()
  const [name, setName] = useState('')
  const [displayName, setDisplayName] = useState('')
  const [description, setDescription] = useState('')
  const [gradIdx, setGradIdx] = useState(0)
  const [saving, setSaving] = useState(false)

  const handleCreate = async () => {
    if (!name.trim() || !displayName.trim()) {
      toast(t('opc.form.required_name'), 'error'); return
    }
    setSaving(true)
    const now = Math.floor(Date.now() / 1000)
    const config: OpcConfig = {
      id: crypto.randomUUID(),
      name: name.trim(),
      display_name: displayName.trim(),
      description: description.trim() || undefined,
      avatar_color: GRAD_PRESETS[gradIdx][0],
      avatar_initials: displayName.trim().slice(0, 2),
      is_active: false,
      is_running: false,
      agent_count: 0,
      channel_count: 0,
      message_count_today: 0,
      message_growth: 0,
      created_at: now,
      updated_at: now,
    }
    try {
      await createOpc(config)
      toast(t('opc.create_success'), 'success')
      onCreated()
      onClose()
    } catch (e) {
      toast(t('opc.create_error', { msg: String(e) }), 'error')
    } finally {
      setSaving(false)
    }
  }

  return (
    <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.6)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000 }}>
      <div style={{ background: '#2C2C2E', borderRadius: 12, padding: 20, width: 360, border: '1px solid rgba(255,255,255,0.12)' }}>
        <div style={{ fontSize: 15, fontWeight: 600, color: '#FFFFFF', marginBottom: 14 }}>{t('opc.modal_title')}</div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          <div>
            <div style={{ fontSize: 12, color: 'rgba(255,255,255,0.65)', marginBottom: 4 }}>{t('opc.form.internal_name_label')}</div>
            <input className="field-input" placeholder={t('opc.form.internal_name_placeholder')} value={name} onChange={e => setName(e.target.value)} />
          </div>
          <div>
            <div style={{ fontSize: 12, color: 'rgba(255,255,255,0.65)', marginBottom: 4 }}>{t('opc.form.display_name_label')}</div>
            <input className="field-input" placeholder={t('opc.form.display_name_placeholder')} value={displayName} onChange={e => setDisplayName(e.target.value)} />
          </div>
          <div>
            <div style={{ fontSize: 12, color: 'rgba(255,255,255,0.65)', marginBottom: 4 }}>{t('opc.form.description_label')}</div>
            <input className="field-input" placeholder={t('opc.form.description_placeholder')} value={description} onChange={e => setDescription(e.target.value)} />
          </div>
          <div>
            <div style={{ fontSize: 12, color: 'rgba(255,255,255,0.65)', marginBottom: 6 }}>{t('opc.form.avatar_color_label')}</div>
            <div style={{ display: 'flex', gap: 8 }}>
              {GRAD_PRESETS.map((g, i) => (
                <div key={i} onClick={() => setGradIdx(i)} style={{
                  width: 28, height: 28, borderRadius: 7,
                  background: `linear-gradient(135deg,${g[0]},${g[1]})`,
                  cursor: 'pointer',
                  outline: gradIdx === i ? '2px solid white' : '2px solid transparent',
                  outlineOffset: 2,
                }} />
              ))}
            </div>
          </div>
        </div>
        <div style={{ display: 'flex', gap: 8, marginTop: 16, justifyContent: 'flex-end' }}>
          <button className="tbtn tbtn-ghost" onClick={onClose}>{t('common.button_cancel')}</button>
          <button className="tbtn tbtn-accent" onClick={handleCreate} disabled={saving}>
            {saving ? t('opc.button_creating') : t('opc.button_create')}
          </button>
        </div>
      </div>
    </div>
  )
}

export default function OpcPage() {
  const { t } = useTranslation()
  const { opcs, currentOpc, selectOpc, reload } = useOpc()
  const [stats, setStats] = useState<OpcStats | null>(null)
  const [showCreate, setShowCreate] = useState(false)
  const [snapshots, setSnapshots] = useState<LocalSnapshot[]>([])
  const [snapshotLabel, setSnapshotLabel] = useState('')
  const [snapshotLoading, setSnapshotLoading] = useState(false)
  const [confirmOffline, setConfirmOffline] = useState<OpcConfig | null>(null)


  const selected = currentOpc

  useEffect(() => {
    if (!selected) return
    getOpcStats(selected.id)
      .then(setStats)
      .catch(console.error)
    loadSnapshots(selected.id)
  }, [selected?.id])

  const loadSnapshots = async (opcId: string) => {
    try {
      const list = await getSnapshots(opcId)
      setSnapshots(list)
    } catch { /* ignore */ }
  }

  const handleCreateSnapshot = async () => {
    if (!selected) return
    const label = snapshotLabel.trim() || `${t('opc.snapshot_label_manual', { time: new Date().toLocaleString('zh-CN', { month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' }) })}`
    setSnapshotLoading(true)
    try {
      await createSnapshot(selected.id, label)
      setSnapshotLabel('')
      await loadSnapshots(selected.id)
      toast('快照已创建', 'success')
    } catch (e) {
      toast(t('opc.create_error', { msg: String(e) }), 'error')
    } finally {
      setSnapshotLoading(false)
    }
  }

  const handleRestoreSnapshot = async (snap: LocalSnapshot) => {
    if (!confirm(`确认恢复快照「${snap.label}」？当前 OPC 的所有配置将被覆盖。`)) return
    setSnapshotLoading(true)
    try {
      await restoreSnapshot(snap.id)
      await reload()
      toast('快照已恢复', 'success')
    } catch (e) {
      toast(`恢复失败: ${e}`, 'error')
    } finally {
      setSnapshotLoading(false)
    }
  }

  const handleDeleteSnapshot = async (snap: LocalSnapshot) => {
    if (!confirm(`确认删除快照「${snap.label}」？`)) return
    try {
      await deleteSnapshot(snap.id)
      setSnapshots(prev => prev.filter(s => s.id !== snap.id))
      toast(t('common.status_deleted'), 'success')
    } catch (e) {
      toast(`删除失败: ${e}`, 'error')
    }
  }

  const handleDelete = async (opc: OpcConfig) => {
    if (!confirm(`确认删除「${opc.display_name}」？此操作不可恢复。`)) return
    try {
      await deleteOpc(opc.id)
      toast(t('common.status_deleted'), 'success')
      await reload()
    } catch (e) {
      toast(`删除失败: ${e}`, 'error')
    }
  }

  const handleUndeploy = async (opc: OpcConfig) => {
    try {
      await undeploy(opc.id)
      toast('已下线', 'success')
      await reload()
    } catch (e) {
      toast(`下线失败: ${e}`, 'error')
    } finally {
      setConfirmOffline(null)
    }
  }

  const handleExport = async (opc: OpcConfig) => {
    try {
      const json = await exportOpc(opc.id)
      const blob = new Blob([json], { type: 'application/json' })
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url; a.download = `${opc.name}.json`; a.click()
      URL.revokeObjectURL(url)
    } catch (e) {
      toast(`导出失败: ${e}`, 'error')
    }
  }

  const running = opcs.filter(o => o.is_running && o.office_id)
  const stopped = opcs.filter(o => !o.is_running || !o.office_id)

  return (
    <>
      {showCreate && <CreateModal onClose={() => setShowCreate(false)} onCreated={reload} />}

      {confirmOffline && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.6)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000 }}>
          <div style={{ background: '#1c1c1e', border: '1px solid rgba(255,255,255,0.1)', borderRadius: '14px', padding: '24px', width: '360px', display: 'flex', flexDirection: 'column', gap: '16px' }}>
            <div>
              <div style={{ fontSize: '15px', fontWeight: 600, color: '#EBEBF5', marginBottom: '8px' }}>{t('opc.confirm_undeploy_title', { name: confirmOffline.display_name })}</div>
              <div style={{ fontSize: '13px', color: '#8E8E93', lineHeight: 1.6 }}>
                {t('opc.undeploy_warning_prefix')}
                <ul style={{ margin: '8px 0 0', paddingLeft: '18px', display: 'flex', flexDirection: 'column', gap: '4px' }}>
                  <li>{t('opc.undeploy_warn_agents')}</li>
                  <li>{t('opc.undeploy_warn_channels')}</li>
                  <li>{t('opc.undeploy_warn_office')}</li>
                </ul>
              </div>
            </div>
            <div style={{ display: 'flex', gap: '8px', justifyContent: 'flex-end' }}>
              <button className="tbtn tbtn-ghost" onClick={() => setConfirmOffline(null)}>{t('common.button_cancel')}</button>
              <button className="tbtn tbtn-danger" onClick={() => handleUndeploy(confirmOffline)}>{t('opc.button_confirm_undeploy')}</button>
            </div>
          </div>
        </div>
      )}

      {/* COL2: list-pane */}
      <div className="list-pane">
        <div className="toolbar" style={{ justifyContent: 'space-between' }}>
          <span style={{ fontSize: '15px', fontWeight: 600, color: '#FFFFFF' }}>{t('opc.section_my_companies')}</span>
        </div>
        <div style={{ flex: 1, overflowY: 'auto' }}>
          {running.length > 0 && (
            <>
              <div className="section-label" style={{ padding: '8px 12px 3px' }}>{t('common.status_running')}</div>
              {running.map(opc => (
                <div
                  key={opc.id}
                  className={`list-row${selected?.id === opc.id ? ' selected' : ''}`}
                  onClick={() => selectOpc(opc)}
                >
                  <div className="avatar avatar-lg" style={{ background: `linear-gradient(135deg,${opc.avatar_color ?? '#8b5cf6'},#06b6d4)` }}>
                    {opc.avatar_initials ?? opc.display_name.slice(0, 2)}
                  </div>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div className="flex-center gap-5">
                      <span className="text-sm text-medium">{opc.display_name}</span>
                      <span className="pulse-dot" style={{ width: '6px', height: '6px', borderRadius: '50%', background: '#34c759' }}></span>
                    </div>
                    <div className="text-xs text-dim">{opc.agent_count} {t('common.label_agents')} · {opc.channel_count} 频道</div>
                  </div>
                  <span className="text-xs text-dim">{fmtRelTime(opc.updated_at, t)}</span>
                </div>
              ))}
            </>
          )}
          {stopped.length > 0 && (
            <>
              <div className="section-label" style={{ padding: '10px 12px 3px' }}>{t('common.status_stopped')}</div>
              {stopped.map(opc => (
                <div
                  key={opc.id}
                  className={`list-row${selected?.id === opc.id ? ' selected' : ''}`}
                  onClick={() => selectOpc(opc)}
                >
                  <div className="avatar avatar-lg" style={{ background: `linear-gradient(135deg,${opc.avatar_color ?? '#8E8E93'},#3A3A3C)` }}>
                    {opc.avatar_initials ?? opc.display_name.slice(0, 2)}
                  </div>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div className="flex-center gap-5">
                      <span className="text-sm text-medium text-dim">{opc.display_name}</span>
                      <span style={{ width: '6px', height: '6px', borderRadius: '50%', background: '#48484A', flexShrink: 0 }}></span>
                    </div>
                    <div className="text-xs text-dim">{opc.agent_count} {t('common.label_agents')} · {opc.channel_count} 频道</div>
                  </div>
                  <span className="text-xs text-dim">{fmtRelTime(opc.updated_at, t)}</span>
                </div>
              ))}
            </>
          )}
          {opcs.length === 0 && (
            <div style={{ padding: '20px 12px', fontSize: '12px', color: '#8E8E93', textAlign: 'center' }}>
              {t('opc.empty_state_text')}
            </div>
          )}
          <div style={{ padding: '10px 12px 4px', borderTop: '1px solid rgba(255,255,255,0.06)', marginTop: '6px' }}>
            <button
              onClick={() => setShowCreate(true)}
              style={{ width: '100%', display: 'flex', alignItems: 'center', gap: '6px', padding: '6px 8px', borderRadius: '6px', background: 'none', border: 'none', cursor: 'pointer', color: '#8E8E93', fontSize: '12px' }}
            >
              <svg fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24" width="13" height="13"><path strokeLinecap="round" strokeLinejoin="round" d="M12 6v6m0 0v6m0-6h6m-6 0H6"/></svg>
              {t('opc.button_create_new')}
            </button>
          </div>
        </div>
      </div>

      {/* COL3: detail-pane */}
      <main className="detail-pane">
        {!selected ? (
          <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#8E8E93', fontSize: '13px' }}>
            {t('opc.select_company_prompt')}
          </div>
        ) : (
          <>
            <div className="toolbar" style={{ justifyContent: 'space-between' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                <span style={{ fontSize: '15px', fontWeight: 600, color: '#FFFFFF' }}>{selected.display_name}</span>
                <span className={`status-badge ${selected.is_running ? 'status-green' : 'status-gray'}`}>
                  {selected.is_running ? t('common.status_running') : t('common.status_stopped')}
                </span>
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                <button className="tbtn tbtn-ghost" onClick={() => handleExport(selected)}>
                  <svg fill="none" stroke="currentColor" strokeWidth="1.75" viewBox="0 0 24 24" width="12" height="12" style={{ display: 'inline', marginRight: '4px' }}><path strokeLinecap="round" strokeLinejoin="round" d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4"/></svg>
                  {t('common.button_export')}
                </button>
                <button className="tbtn tbtn-danger" onClick={() => handleDelete(selected)}>{t('common.button_delete')}</button>
              </div>
            </div>

            <div style={{ flex: 1, overflowY: 'auto', padding: '14px 16px', display: 'flex', flexDirection: 'column', gap: '14px' }}>
              {/* 数据概览 */}
              <section>
                <div className="flex-center gap-10" style={{ marginBottom: '8px' }}>
                  <div><div className="text-bold" style={{ fontSize: '15px', color: '#EBEBF5', lineHeight: '1.2' }}>{t('opc.section_data_overview')}</div></div>
                </div>
                <div className="group">
                  <div className="group-row" style={{ justifyContent: 'space-between' }}>
                    <span className="group-label">{t('common.label_agents')}</span>
                    <span className="group-value flex-center gap-5" style={{ flex: 1 }}>{selected.agent_count} {t('common.unit_count')}</span>
                    <a href="#/agents" style={{ fontSize: '11px', color: '#a78bfa', textDecoration: 'none', flexShrink: 0 }}>{t('common.button_manage')}</a>
                  </div>
                  <div className="group-row" style={{ justifyContent: 'space-between' }}>
                    <span className="group-label">飞书频道</span>
                    <span className="group-value flex-center gap-5" style={{ flex: 1 }}>
                      {selected.channel_count} {t('common.unit_count')}
                      {stats && <span className="text-dimmer">（{stats.group_count} {t('common.channel_type_group')}, {stats.dm_count} {t('common.channel_type_dm')}）</span>}
                    </span>
                    <a href="#/bindings" style={{ fontSize: '11px', color: '#a78bfa', textDecoration: 'none', flexShrink: 0 }}>{t('common.button_manage')}</a>
                  </div>
                  <div className="group-row" style={{ justifyContent: 'space-between' }}>
                    <span className="group-label">{t('opc.label_running_status')}</span>
                    <span className="group-value flex-center gap-5" style={{ flex: 1 }}>
                      <span className="pulse-dot" style={{ width: '6px', height: '6px', borderRadius: '50%', background: selected.is_running && selected.office_id ? '#34c759' : '#48484A' }}></span>
                      <span style={{ color: selected.is_running && selected.office_id ? '#34c759' : '#8E8E93' }}>
                        {selected.is_running && selected.office_id ? t('common.status_running') : t('common.status_stopped')}
                      </span>
                      {selected.is_running && selected.office_name && (
                        <>
                          <span style={{ color: '#48484A', fontSize: '11px' }}>·</span>
                          <a href="#/office" style={{ fontSize: '12px', color: '#a78bfa', textDecoration: 'none' }}>
                            {selected.office_name}
                          </a>
                        </>
                      )}
                    </span>
                    {selected.is_running && selected.office_id && (
                      <a
                        style={{ fontSize: '11px', color: '#a78bfa', textDecoration: 'none', flexShrink: 0, cursor: 'pointer' }}
                        onClick={() => setConfirmOffline(selected)}
                      >
                        {t('opc.button_undeploy')}
                      </a>
                    )}
                  </div>
                  <div className="group-row">
                    <span className="group-label">{t('opc.label_messages_today')}</span>
                    <span className="group-value" style={{ color: '#34c759' }}>
                      {selected.message_count_today.toLocaleString()} {t('common.unit_messages')}
                      <span className="text-dimmer"> {selected.message_growth >= 0 ? '↑' : '↓'} {Math.abs(selected.message_growth).toFixed(1)}%</span>
                    </span>
                  </div>
                </div>
              </section>

              {/* 基本信息 */}
              <section>
                <div className="section-label" style={{ padding: '0 0 6px' }}>{t('common.section_basic_info')}</div>
                <div className="group">
                  <div className="group-row"><span className="group-label">内部名称</span><span className="group-value">{selected.name}</span></div>
                  <div className="group-row"><span className="group-label">描述</span><span className="group-value">{selected.description ?? '—'}</span></div>
                  <div className="group-row"><span className="group-label">{t('common.label_created_at')}</span><span className="group-value">{new Date(selected.created_at * 1000).toLocaleDateString()}</span></div>
                  <div className="group-row"><span className="group-label">{t('common.label_updated_at')}</span><span className="group-value">{fmtRelTime(selected.updated_at, t)}</span></div>
                </div>
              </section>

              {/* 配置快照 */}
              <section>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '8px' }}>
                  <div>
                    <span className="section-label" style={{ padding: 0 }}>{t('opc.section_snapshots')}</span>
                    <span style={{ marginLeft: '6px', fontSize: '11px', color: '#636366' }}>{snapshots.length} {t('common.unit_count')}</span>
                  </div>
                </div>

                {/* 创建快照 */}
                <div style={{ display: 'flex', gap: '6px', marginBottom: '10px' }}>
                  <input
                    value={snapshotLabel}
                    onChange={e => setSnapshotLabel(e.target.value)}
                    onKeyDown={e => e.key === 'Enter' && handleCreateSnapshot()}
                    placeholder={t('opc.snapshot_label_placeholder')}
                    className="field-input"
                    style={{ flex: 1 }}
                  />
                  <button
                    className="tbtn tbtn-accent"
                    onClick={handleCreateSnapshot}
                    disabled={snapshotLoading}
                    style={{ whiteSpace: 'nowrap', flexShrink: 0 }}
                  >
                    {snapshotLoading ? t('common.status_processing') : t('opc.button_create_snapshot')}
                  </button>
                </div>

                {/* 快照列表 */}
                {snapshots.length === 0 ? (
                  <div style={{ fontSize: '12px', color: '#636366', padding: '10px 0', textAlign: 'center' }}>
                    {t('opc.empty_snapshots_text')}
                  </div>
                ) : (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                    {snapshots.map(snap => (
                      <div key={snap.id} style={{ display: 'flex', alignItems: 'center', gap: '10px', minHeight: '44px', padding: '4px 12px', background: 'rgba(255,255,255,0.04)', borderRadius: '8px', border: '1px solid rgba(255,255,255,0.08)' }}>
                        <div style={{ flexShrink: 0 }}>
                          <svg fill="none" stroke={snap.is_auto ? '#f59e0b' : '#8b5cf6'} strokeWidth="1.75" viewBox="0 0 24 24" width="15" height="15">
                            <path strokeLinecap="round" strokeLinejoin="round" d="M5 8h14M5 8a2 2 0 110-4h14a2 2 0 110 4M5 8v10a2 2 0 002 2h10a2 2 0 002-2V8m-9 4h4"/>
                          </svg>
                        </div>
                        <div style={{ flex: 1, minWidth: 0 }}>
                          <div style={{ fontSize: '12px', fontWeight: 500, color: '#EBEBF5', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                            {snap.label}
                            {snap.is_auto && <span style={{ marginLeft: '5px', fontSize: '10px', color: '#f59e0b', background: 'rgba(245,158,11,0.12)', padding: '1px 5px', borderRadius: '4px' }}>{t('opc.snapshot_tag_auto')}</span>}
                          </div>
                          <div style={{ fontSize: '11px', color: '#636366' }}>
                            {new Date(snap.created_at * 1000).toLocaleString('zh-CN', { month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' })}
                          </div>
                        </div>
                        <div style={{ display: 'flex', gap: '5px', flexShrink: 0 }}>
                          <button
                            onClick={() => handleRestoreSnapshot(snap)}
                            disabled={snapshotLoading}
                            style={{ padding: '3px 9px', borderRadius: '5px', fontSize: '11px', cursor: 'pointer', border: '1px solid rgba(139,92,246,0.35)', background: 'rgba(139,92,246,0.1)', color: '#a78bfa', opacity: snapshotLoading ? 0.5 : 1 }}
                          >{t('opc.button_restore_snapshot')}</button>
                          <button
                            onClick={() => handleDeleteSnapshot(snap)}
                            style={{ padding: '3px 7px', borderRadius: '5px', fontSize: '11px', cursor: 'pointer', border: '1px solid rgba(244,63,94,0.3)', background: 'none', color: '#f43f5e' }}
                          >×</button>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </section>
            </div>
          </>
        )}
      </main>
    </>
  )
}
