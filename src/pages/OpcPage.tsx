import { useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { useOpc } from '../contexts/OpcContext'
import { createOpc, deleteOpc, exportOpc, getOpcStats, createSnapshot, getSnapshots, restoreSnapshot, deleteSnapshot, undeploy } from '../lib/api'
import { toast } from '../components/Toast'
import type { OpcConfig, OpcStats } from '../lib/types'
import type { LocalSnapshot } from '../lib/types'
import { Icon } from '../components/Icon'
import { formatRelativeTime } from '../lib/formatting'

const COLOR_PRESETS = ['#8b5cf6', '#10b981', '#f59e0b', '#f43f5e', '#3b82f6']

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
      avatar_color: COLOR_PRESETS[gradIdx],
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
    <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.6)', display: 'flex', alignItems: 'flex-start', justifyContent: 'center', paddingTop: '12vh', zIndex: 1000 }}>
      <div style={{ background: '#1c1c1e', borderRadius: 14, padding: 24, width: 420, maxWidth: '90vw', border: '1px solid rgba(255,255,255,0.12)' }}>
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
              {COLOR_PRESETS.map((c, i) => (
                <div key={i} onClick={() => setGradIdx(i)} style={{
                  width: 28, height: 28, borderRadius: 7,
                  background: c,
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
  const [confirmDelete, setConfirmDelete] = useState<OpcConfig | null>(null)

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

  return (
    <>
      {showCreate && <CreateModal onClose={() => setShowCreate(false)} onCreated={reload} />}

      {confirmOffline && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.6)', display: 'flex', alignItems: 'flex-start', justifyContent: 'center', paddingTop: '12vh', zIndex: 1000 }}>
          <div style={{ background: 'var(--bg-elevated)', border: '1px solid var(--border-strong)', borderRadius: '14px', padding: '24px', width: '420px', maxWidth: '90vw', display: 'flex', flexDirection: 'column', gap: '16px' }}>
            <div>
              <div style={{ fontSize: '15px', fontWeight: 600, color: 'var(--text-primary)', marginBottom: '8px' }}>{t('opc.confirm_undeploy_title', { name: confirmOffline.display_name })}</div>
              <div style={{ fontSize: '13px', color: 'var(--text-dimmer)', lineHeight: 1.6 }}>
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

      {confirmDelete && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.6)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000 }}>
          <div style={{ background: 'var(--bg-elevated)', border: '1px solid var(--border-strong)', borderRadius: '14px', padding: '24px', width: '360px', display: 'flex', flexDirection: 'column', gap: '16px' }}>
            <div>
              <div style={{ fontSize: '15px', fontWeight: 600, color: 'var(--text-primary)', marginBottom: '8px' }}>{confirmDelete.display_name}</div>
              <div style={{ fontSize: '13px', color: 'var(--text-secondary)', lineHeight: 1.6 }}>
                {t('opc.confirm_delete')}
              </div>
            </div>
            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '8px' }}>
              <button className="tbtn tbtn-ghost" onClick={() => setConfirmDelete(null)}>{t('common.button_cancel')}</button>
              <button className="tbtn tbtn-danger" onClick={() => handleDelete(confirmDelete)}>{t('common.button_delete')}</button>
            </div>
          </div>
        </div>
      )}

      {/* OPC list */}
      <div className="list-pane">
        <div data-tauri-drag-region className="toolbar" style={{ justifyContent: 'space-between' }}>
          <span style={{ fontSize: '15px', fontWeight: 600, color: 'var(--text-primary)' }}>OPC 管理</span>
        </div>
        <div style={{ flex: 1, overflowY: 'auto' }}>
          {opcs.filter(o => o.is_running).length > 0 && (
            <>
              <div className="section-label" style={{ padding: '8px 12px 3px' }}>{t('common.status_running')}</div>
              {opcs.filter(o => o.is_running).map(opc => (
                <div key={opc.id} className={`list-row${selected?.id === opc.id ? ' selected' : ''}`} onClick={() => selectOpc(opc)} style={{ cursor: 'pointer' }}>
                  <div className="avatar avatar-lg" style={{ background: opc.avatar_color ?? 'var(--accent)' }}>
                    {opc.avatar_initials ?? opc.display_name.slice(0, 2)}
                  </div>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div className="text-sm text-medium" style={{ whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{opc.display_name}</div>
                    <div className="text-xs text-dim">{opc.agent_count} agents</div>
                  </div>
                  <span className="pulse-dot" style={{ width: '6px', height: '6px', borderRadius: '50%', background: 'var(--success)' }} />
                </div>
              ))}
            </>
          )}
          {opcs.filter(o => !o.is_running).length > 0 && (
            <>
              <div className="section-label" style={{ padding: '10px 12px 3px' }}>{t('common.status_stopped')}</div>
              {opcs.filter(o => !o.is_running).map(opc => (
                <div key={opc.id} className={`list-row${selected?.id === opc.id ? ' selected' : ''}`} onClick={() => selectOpc(opc)} style={{ cursor: 'pointer' }}>
                  <div className="avatar avatar-lg" style={{ background: opc.avatar_color ?? 'var(--accent)' }}>
                    {opc.avatar_initials ?? opc.display_name.slice(0, 2)}
                  </div>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div className="text-sm text-medium text-dim" style={{ whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{opc.display_name}</div>
                    <div className="text-xs text-dim">{opc.agent_count} agents</div>
                  </div>
                </div>
              ))}
            </>
          )}
        </div>
        <div style={{ padding: '8px', borderTop: '1px solid var(--border-subtle)' }}>
          <button className="tbtn tbtn-accent" style={{ width: '100%' }} onClick={() => setShowCreate(true)}>
            + {t('opc.button_create_new')}
          </button>
        </div>
      </div>

      {/* Detail pane */}
      <main className="detail-pane">
        {!selected ? (
          <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--text-dimmer)', fontSize: '13px' }}>
            {t('opc.select_company_prompt')}
          </div>
        ) : (
          <>
            <div style={{ padding: '10px 16px 0', display: 'flex', alignItems: 'center', gap: '8px', justifyContent: 'space-between', flexShrink: 0 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                <span style={{ fontSize: '15px', fontWeight: 600, color: 'var(--text-primary)' }}>{selected.display_name}</span>
                <span className={`status-badge ${selected.is_running ? 'status-green' : 'status-gray'}`}>
                  {selected.is_running ? t('common.status_running') : t('common.status_stopped')}
                </span>
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                <button className="tbtn tbtn-ghost" onClick={() => handleExport(selected)}>
                  <Icon name="download" size={12} style={{ display: 'inline', marginRight: '4px' }} />
                  {t('common.button_export')}
                </button>
                <button className="tbtn tbtn-danger" onClick={() => setConfirmDelete(selected)}>{t('common.button_delete')}</button>
              </div>
            </div>

            <div style={{ flex: 1, overflowY: 'auto', padding: '14px 16px', display: 'flex', flexDirection: 'column', gap: '14px' }}>
              {/* 数据概览 */}
              <section>
                <div className="flex-center gap-10" style={{ marginBottom: '8px' }}>
                  <div><div className="text-bold" style={{ fontSize: '15px', color: 'var(--text-primary)', lineHeight: '1.2' }}>{t('opc.section_data_overview')}</div></div>
                </div>
                <div className="group">
                  <div className="group-row" style={{ justifyContent: 'space-between' }}>
                    <span className="group-label">{t('common.label_agents')}</span>
                    <span className="group-value flex-center gap-5" style={{ flex: 1 }}>{selected.agent_count} {t('common.unit_count')}</span>
                    <a href="#/agents" style={{ fontSize: '11px', color: 'var(--accent-hover)', textDecoration: 'none', flexShrink: 0 }}>{t('common.button_manage')}</a>
                  </div>
                  <div className="group-row" style={{ justifyContent: 'space-between' }}>
                    <span className="group-label">飞书频道</span>
                    <span className="group-value flex-center gap-5" style={{ flex: 1 }}>
                      {selected.channel_count} {t('common.unit_count')}
                      {stats && <span className="text-dimmer">（{stats.group_count} {t('common.channel_type_group')}, {stats.dm_count} {t('common.channel_type_dm')}）</span>}
                    </span>
                    <a href="#/bindings" style={{ fontSize: '11px', color: 'var(--accent-hover)', textDecoration: 'none', flexShrink: 0 }}>{t('common.button_manage')}</a>
                  </div>
                  <div className="group-row" style={{ justifyContent: 'space-between' }}>
                    <span className="group-label">{t('opc.label_running_status')}</span>
                    <span className="group-value flex-center gap-5" style={{ flex: 1 }}>
                      <span className="pulse-dot" style={{ width: '6px', height: '6px', borderRadius: '50%', background: selected.is_running && selected.office_id ? 'var(--success)' : 'var(--bg-overlay)' }}></span>
                      <span style={{ color: selected.is_running && selected.office_id ? 'var(--success)' : 'var(--text-dimmer)' }}>
                        {selected.is_running && selected.office_id ? t('common.status_running') : t('common.status_stopped')}
                      </span>
                      {selected.is_running && selected.office_name && (
                        <>
                          <span style={{ color: 'var(--bg-overlay)', fontSize: '11px' }}>·</span>
                          <a href={`#/office?highlight=${selected.office_id}`} style={{ fontSize: '12px', color: 'var(--accent-hover)', textDecoration: 'none' }}>
                            {selected.office_name}
                          </a>
                        </>
                      )}
                    </span>
                    {selected.is_running && selected.office_id && (
                      <a
                        style={{ fontSize: '11px', color: 'var(--accent-hover)', textDecoration: 'none', flexShrink: 0, cursor: 'pointer' }}
                        onClick={() => setConfirmOffline(selected)}
                      >
                        {t('opc.button_undeploy')}
                      </a>
                    )}
                  </div>
                  <div className="group-row">
                    <span className="group-label">{t('opc.label_messages_today')}</span>
                    <span className="group-value" style={{ color: 'var(--success)' }}>
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
                  <div className="group-row"><span className="group-label">{t('common.label_updated_at')}</span><span className="group-value">{formatRelativeTime(selected.updated_at, t)}</span></div>
                </div>
              </section>

              {/* 配置快照 */}
              <section>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '8px' }}>
                  <div>
                    <span className="section-label" style={{ padding: 0 }}>{t('opc.section_snapshots')}</span>
                    <span style={{ marginLeft: '6px', fontSize: '11px', color: 'var(--text-dimmer)' }}>{snapshots.length} {t('common.unit_count')}</span>
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
                  <div style={{ fontSize: '12px', color: 'var(--text-dimmer)', padding: '10px 0', textAlign: 'center' }}>
                    {t('opc.empty_snapshots_text')}
                  </div>
                ) : (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                    {snapshots.map(snap => (
                      <div key={snap.id} style={{ display: 'flex', alignItems: 'center', gap: '10px', minHeight: '44px', padding: '4px 12px', background: 'var(--border-subtle)', borderRadius: '8px', border: '1px solid var(--border-default)' }}>
                        <div style={{ flexShrink: 0 }}>
                          <Icon name="folder" size={15} stroke={snap.is_auto ? '#f59e0b' : 'var(--accent)'} strokeWidth={1.75} />
                        </div>
                        <div style={{ flex: 1, minWidth: 0 }}>
                          <div style={{ fontSize: '12px', fontWeight: 500, color: 'var(--text-primary)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                            {snap.label}
                            {snap.is_auto && <span style={{ marginLeft: '5px', fontSize: '10px', color: '#f59e0b', background: 'rgba(245,158,11,0.12)', padding: '1px 5px', borderRadius: '4px' }}>{t('opc.snapshot_tag_auto')}</span>}
                          </div>
                          <div style={{ fontSize: '11px', color: 'var(--text-dimmer)' }}>
                            {new Date(snap.created_at * 1000).toLocaleString('zh-CN', { month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' })}
                          </div>
                        </div>
                        <div style={{ display: 'flex', gap: '5px', flexShrink: 0 }}>
                          <button
                            onClick={() => handleRestoreSnapshot(snap)}
                            disabled={snapshotLoading}
                            style={{ padding: '3px 9px', borderRadius: '5px', fontSize: '11px', cursor: 'pointer', border: '1px solid var(--accent-strong)', background: 'var(--accent-muted)', color: 'var(--accent-hover)', opacity: snapshotLoading ? 0.5 : 1 }}
                          >{t('opc.button_restore_snapshot')}</button>
                          <button
                            onClick={() => handleDeleteSnapshot(snap)}
                            style={{ padding: '3px 7px', borderRadius: '5px', fontSize: '11px', cursor: 'pointer', border: '1px solid var(--error-muted)', background: 'none', color: 'var(--error)' }}
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
