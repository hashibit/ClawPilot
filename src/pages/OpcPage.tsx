import { useEffect, useState } from 'react'
import { useOpc } from '../contexts/OpcContext'
import { createOpc, deleteOpc, updateOpc, exportOpc, getOpcStats } from '../lib/api'
import { toast } from '../components/Toast'
import type { OpcConfig, OpcStats } from '../lib/types'

function fmtRelTime(ts: number) {
  const diff = Math.floor((Date.now() / 1000 - ts))
  if (diff < 3600) return `${Math.floor(diff / 60)}分钟前`
  if (diff < 86400) return `${Math.floor(diff / 3600)}小时前`
  if (diff < 604800) return `${Math.floor(diff / 86400)}天前`
  return `${Math.floor(diff / 604800)}周前`
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
  const [name, setName] = useState('')
  const [displayName, setDisplayName] = useState('')
  const [description, setDescription] = useState('')
  const [gradIdx, setGradIdx] = useState(0)
  const [saving, setSaving] = useState(false)

  const handleCreate = async () => {
    if (!name.trim() || !displayName.trim()) {
      toast('请填写名称', 'error'); return
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
      toast('创建成功', 'success')
      onCreated()
      onClose()
    } catch (e) {
      toast(`创建失败: ${e}`, 'error')
    } finally {
      setSaving(false)
    }
  }

  return (
    <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.6)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000 }}>
      <div style={{ background: '#2C2C2E', borderRadius: 12, padding: 20, width: 360, border: '1px solid rgba(255,255,255,0.12)' }}>
        <div style={{ fontSize: 15, fontWeight: 600, color: '#FFFFFF', marginBottom: 14 }}>创建新 OPC 公司</div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          <div>
            <div style={{ fontSize: 12, color: 'rgba(255,255,255,0.65)', marginBottom: 4 }}>内部名称（英文）</div>
            <input className="field-input" placeholder="my-company" value={name} onChange={e => setName(e.target.value)} />
          </div>
          <div>
            <div style={{ fontSize: 12, color: 'rgba(255,255,255,0.65)', marginBottom: 4 }}>显示名称</div>
            <input className="field-input" placeholder="我的公司" value={displayName} onChange={e => setDisplayName(e.target.value)} />
          </div>
          <div>
            <div style={{ fontSize: 12, color: 'rgba(255,255,255,0.65)', marginBottom: 4 }}>描述（可选）</div>
            <input className="field-input" placeholder="简短描述..." value={description} onChange={e => setDescription(e.target.value)} />
          </div>
          <div>
            <div style={{ fontSize: 12, color: 'rgba(255,255,255,0.65)', marginBottom: 6 }}>头像颜色</div>
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
          <button className="tbtn tbtn-ghost" onClick={onClose}>取消</button>
          <button className="tbtn tbtn-accent" onClick={handleCreate} disabled={saving}>
            {saving ? '创建中...' : '创建'}
          </button>
        </div>
      </div>
    </div>
  )
}

export default function OpcPage() {
  const { opcs, currentOpc, selectOpc, reload } = useOpc()
  const [stats, setStats] = useState<OpcStats | null>(null)
  const [showCreate, setShowCreate] = useState(false)
  const selected = currentOpc

  useEffect(() => {
    if (!selected) return
    getOpcStats(selected.id)
      .then(setStats)
      .catch(console.error)
  }, [selected?.id])

  const handleDelete = async (opc: OpcConfig) => {
    if (!confirm(`确认删除「${opc.display_name}」？此操作不可恢复。`)) return
    try {
      await deleteOpc(opc.id)
      toast('已删除', 'success')
      await reload()
    } catch (e) {
      toast(`删除失败: ${e}`, 'error')
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

      {/* COL2: list-pane */}
      <div className="list-pane">
        <div className="toolbar" style={{ justifyContent: 'space-between' }}>
          <span style={{ fontSize: '15px', fontWeight: 600, color: '#FFFFFF' }}>我的公司</span>
        </div>
        <div style={{ flex: 1, overflowY: 'auto' }}>
          {running.length > 0 && (
            <>
              <div className="section-label" style={{ padding: '8px 12px 3px' }}>运行中</div>
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
                    <div className="text-xs text-dim">{opc.agent_count} 智能体 · {opc.channel_count} 频道</div>
                  </div>
                  <span className="text-xs text-dim">{fmtRelTime(opc.updated_at)}</span>
                </div>
              ))}
            </>
          )}
          {stopped.length > 0 && (
            <>
              <div className="section-label" style={{ padding: '10px 12px 3px' }}>已停止</div>
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
                    <div className="text-xs text-dim">{opc.agent_count} 智能体 · {opc.channel_count} 频道</div>
                  </div>
                  <span className="text-xs text-dim">{fmtRelTime(opc.updated_at)}</span>
                </div>
              ))}
            </>
          )}
          {opcs.length === 0 && (
            <div style={{ padding: '20px 12px', fontSize: '12px', color: '#8E8E93', textAlign: 'center' }}>
              暂无公司，点击下方按钮创建
            </div>
          )}
          <div style={{ padding: '10px 12px 4px', borderTop: '1px solid rgba(255,255,255,0.06)', marginTop: '6px' }}>
            <button
              onClick={() => setShowCreate(true)}
              style={{ width: '100%', display: 'flex', alignItems: 'center', gap: '6px', padding: '6px 8px', borderRadius: '6px', background: 'none', border: 'none', cursor: 'pointer', color: '#8E8E93', fontSize: '12px' }}
            >
              <svg fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24" width="13" height="13"><path strokeLinecap="round" strokeLinejoin="round" d="M12 6v6m0 0v6m0-6h6m-6 0H6"/></svg>
              创建新OPC公司
            </button>
          </div>
        </div>
      </div>

      {/* COL3: detail-pane */}
      <main className="detail-pane">
        {!selected ? (
          <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#8E8E93', fontSize: '13px' }}>
            请选择一个公司
          </div>
        ) : (
          <>
            <div className="toolbar" style={{ justifyContent: 'space-between' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                <span style={{ fontSize: '15px', fontWeight: 600, color: '#FFFFFF' }}>{selected.display_name}</span>
                <span className={`status-badge ${selected.is_running ? 'status-green' : 'status-gray'}`}>
                  {selected.is_running ? '运行中' : '已停止'}
                </span>
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                <button className="tbtn tbtn-ghost" onClick={() => handleExport(selected)}>
                  <svg fill="none" stroke="currentColor" strokeWidth="1.75" viewBox="0 0 24 24" width="12" height="12" style={{ display: 'inline', marginRight: '4px' }}><path strokeLinecap="round" strokeLinejoin="round" d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4"/></svg>
                  导出
                </button>
                <button className="tbtn tbtn-danger" onClick={() => handleDelete(selected)}>删除</button>
              </div>
            </div>

            <div style={{ flex: 1, overflowY: 'auto', padding: '14px 16px', display: 'flex', flexDirection: 'column', gap: '14px' }}>
              {/* 数据概览 */}
              <section>
                <div className="flex-center gap-10" style={{ marginBottom: '8px' }}>
                  <div><div className="text-bold" style={{ fontSize: '15px', color: '#EBEBF5', lineHeight: '1.2' }}>数据概览</div></div>
                </div>
                <div className="group">
                  <div className="group-row"><span className="group-label">智能体</span><span className="group-value flex-center gap-5">{selected.agent_count} 个<a href="#/agents" style={{ fontSize: '11px', color: '#a78bfa', textDecoration: 'none' }}>管理 →</a></span></div>
                  <div className="group-row"><span className="group-label">飞书频道</span>
                    <span className="group-value flex-center gap-5">
                      {selected.channel_count} 个
                      {stats && <span className="text-dimmer">（{stats.group_count} 群聊, {stats.dm_count} 私聊）</span>}
                      <a href="#/bindings" style={{ fontSize: '11px', color: '#a78bfa', textDecoration: 'none' }}>管理 →</a>
                    </span>
                  </div>
                  <div className="group-row">
                    <span className="group-label">运行状态</span>
                    <span className="group-value flex-center gap-5">
                      <span className="pulse-dot" style={{ width: '6px', height: '6px', borderRadius: '50%', background: selected.is_running && selected.office_id ? '#34c759' : '#48484A' }}></span>
                      <span style={{ color: selected.is_running && selected.office_id ? '#34c759' : '#8E8E93' }}>
                        {selected.is_running && selected.office_id ? '运行中' : '已停止'}
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
                  </div>
                  <div className="group-row">
                    <span className="group-label">今日消息</span>
                    <span className="group-value" style={{ color: '#34c759' }}>
                      {selected.message_count_today.toLocaleString()} 条
                      <span className="text-dimmer"> {selected.message_growth >= 0 ? '↑' : '↓'} {Math.abs(selected.message_growth).toFixed(1)}%</span>
                    </span>
                  </div>
                </div>
              </section>

              {/* 基本信息 */}
              <section>
                <div className="section-label" style={{ padding: '0 0 6px' }}>基本信息</div>
                <div className="group">
                  <div className="group-row"><span className="group-label">内部名称</span><span className="group-value">{selected.name}</span></div>
                  <div className="group-row"><span className="group-label">描述</span><span className="group-value">{selected.description ?? '—'}</span></div>
                  <div className="group-row"><span className="group-label">创建时间</span><span className="group-value">{new Date(selected.created_at * 1000).toLocaleDateString()}</span></div>
                  <div className="group-row"><span className="group-label">更新时间</span><span className="group-value">{fmtRelTime(selected.updated_at)}</span></div>
                </div>
              </section>
            </div>
          </>
        )}
      </main>
    </>
  )
}
