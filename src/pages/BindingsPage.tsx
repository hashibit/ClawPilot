import { useState, useRef, useCallback, useLayoutEffect, useEffect } from 'react'
import { useTranslation } from 'react-i18next'
import { useOpc } from '../contexts/OpcContext'
import { useApi } from '../hooks/useApi'
import {
    getChannels, upsertChannel, testFeishuConnection,
    getBindings, createBinding, updateBinding, deleteBinding, toggleBinding,
    getAgents,
} from '../lib/api'
import { toast } from '../components/Toast'
import type { ChannelConfig, BindingRule, AgentConfig } from '../lib/types'
import { Icon } from '../components/Icon'
import { agentAvatarText } from '../lib/agent-avatar'

/* ── Geometry helpers ── */
interface Pt { x: number; y: number }

function ptOf(el: HTMLElement, ctr: HTMLElement): Pt {
    const r = el.getBoundingClientRect(), cr = ctr.getBoundingClientRect()
    return { x: r.left + r.width / 2 - cr.left, y: r.top + r.height / 2 - cr.top }
}

function bPath(a: Pt, b: Pt): string {
    const dx = Math.abs(b.x - a.x) * 0.5
    return `M ${a.x} ${a.y} C ${a.x + dx} ${a.y}, ${b.x - dx} ${b.y}, ${b.x} ${b.y}`
}

export default function BindingsPage() {
    const { t } = useTranslation()
    const { currentOpc } = useOpc()

    /* ── Channel state ── */
    const [channel, setChannel] = useState<ChannelConfig | null>(null)
    const [appId, setAppId] = useState('')
    const [appSecret, setAppSecret] = useState('')
    const [channelEditing, setChannelEditing] = useState(false)
    const [testing, setTesting] = useState(false)
    const [savingChannel, setSavingChannel] = useState(false)

    /* ── Binding state ── */
    const [bindings, setBindings] = useState<BindingRule[]>([])
    const [agents, setAgents] = useState<AgentConfig[]>([])
    const [selectedBindingId, setSelectedBindingId] = useState<string | null>(null)

    /* ── New-group modal ── */
    const [showGroupModal, setShowGroupModal] = useState(false)
    const [modalForm, setModalForm] = useState({ channel_name: '', channel_id: '' })
    const [savingBinding, setSavingBinding] = useState(false)

    /* ── Edit-group modal (click existing group) ── */
    const [editBinding, setEditBinding] = useState<BindingRule | null>(null)

    /* ── Trigger mode confirm (shown after drag-drop before saving) ── */
    const [triggerConfirm, setTriggerConfirm] = useState<{
        agentId: string; agentName: string; sourceId: string; pos: Pt
    } | null>(null)

    /* ── Drag state ── */
    const canvasRef = useRef<HTMLDivElement>(null)
    const groupPortRefs = useRef<Map<string, HTMLDivElement>>(new Map())
    const agentPortRefs = useRef<Map<string, HTMLDivElement>>(new Map())
    const [curves, setCurves] = useState<{ id: string; d: string; color: string; enabled: boolean }[]>([])

    // Free-position for group cards, persisted to localStorage per OPC
    const posKeyRef = useRef('')
    posKeyRef.current = currentOpc ? `bind-pos-${currentOpc.id}` : ''

    const [positions, setPositionsRaw] = useState<Map<string, Pt>>(new Map())

    // Reload positions from localStorage when OPC changes
    useEffect(() => {
        if (!posKeyRef.current) { setPositionsRaw(new Map()); return }
        try {
            const raw = localStorage.getItem(posKeyRef.current)
            if (raw) setPositionsRaw(new Map(JSON.parse(raw)))
            else setPositionsRaw(new Map())
        } catch { setPositionsRaw(new Map()) }
    }, [currentOpc?.id])

    const setPositions = useCallback((updater: Map<string, Pt> | ((prev: Map<string, Pt>) => Map<string, Pt>)) => {
        setPositionsRaw(prev => {
            const next = typeof updater === 'function' ? updater(prev) : updater
            const key = posKeyRef.current
            if (key) {
                try { localStorage.setItem(key, JSON.stringify(Array.from(next.entries()))) } catch { /* ignore */ }
            }
            return next
        })
    }, [])

    // Drag modes: 'move' = reposition card, 'bind' = drag to agent
    const [dragMode, setDragMode] = useState<'move' | 'bind' | null>(null)
    const [dragFrom, setDragFrom] = useState<string | null>(null)
    const [dragPt, setDragPt] = useState<Pt | null>(null)
    const [dragOffset, setDragOffset] = useState<Pt>({ x: 0, y: 0 })
    const [dragCurve, setDragCurve] = useState<string | null>(null)
    const [dropTarget, setDropTarget] = useState<string | null>(null)
    const [dragLabel, setDragLabel] = useState<string>('')

    /* ── Pending group (created via modal, waiting for drag) ── */
    const [pendingGroup, setPendingGroup] = useState<Omit<BindingRule, 'agent_id' | 'agent_name' | 'trigger_mode'> | null>(null)

    /* ── Recalculate Bézier curves ── */
    const recalcCurves = useCallback(() => {
        const ctr = canvasRef.current
        if (!ctr) return
        const result: typeof curves = []
        for (const b of bindings) {
            if (dragMode === 'bind' && dragFrom === b.id) continue // hide curve only when re-binding
            const gEl = groupPortRefs.current.get(b.id)
            const aEl = agentPortRefs.current.get(b.agent_id)
            if (!gEl || !aEl) continue
            const from = ptOf(gEl, ctr)
            const to = ptOf(aEl, ctr)
            // Color by trigger mode: MENTION = accent, ALL = warning/orange
            const color = b.trigger_mode === 'ALL' ? 'var(--warning, #f59e0b)' : 'var(--accent)'
            result.push({ id: b.id, d: bPath(from, to), color, enabled: b.is_enabled })
        }
        setCurves(result)
    }, [bindings, agents, dragFrom, dragMode, positions])

    useLayoutEffect(() => {
        recalcCurves()
        window.addEventListener('resize', recalcCurves)
        return () => window.removeEventListener('resize', recalcCurves)
    }, [recalcCurves])

    /* ── Data loading ── */
    const { reload: reloadData } = useApi(
        () => currentOpc
            ? Promise.all([getChannels(currentOpc.id), getBindings(currentOpc.id), getAgents(currentOpc.id)])
            : Promise.resolve(null),
        [currentOpc?.id],
        {
            onSuccess: (result) => {
                if (!result) return
                const [channels, bindingList, agentList] = result
                const feishu = channels.find(c => c.channel_type === 'FEISHU') ?? null
                setChannel(feishu)
                setAppId(feishu?.feishu_config?.app_id ?? '')
                setAppSecret(feishu?.feishu_config?.app_secret ?? '')
                setChannelEditing(false)
                setBindings(bindingList)
                setAgents(agentList as AgentConfig[])
                // Assign default positions for new bindings
                setPositions(prev => {
                    const next = new Map(prev)
                    bindingList.forEach((b: BindingRule, i: number) => {
                        if (!next.has(b.id)) {
                            next.set(b.id, { x: 60, y: 55 + i * 100 })
                        }
                    })
                    return next
                })
            },
            onError: (e) => toast(e.message, 'error'),
        }
    )

    /* ── Channel handlers ── */
    const handleSaveChannel = async () => {
        if (!currentOpc) return
        setSavingChannel(true)
        const nowTs = Math.floor(Date.now() / 1000)
        const config: ChannelConfig = channel
            ? { ...channel, feishu_config: { app_id: appId, app_secret: appSecret }, updated_at: nowTs }
            : {
                id: crypto.randomUUID(), opc_id: currentOpc.id,
                channel_type: 'FEISHU', is_enabled: true,
                feishu_config: { app_id: appId, app_secret: appSecret },
                is_connected: false, created_at: nowTs, updated_at: nowTs,
            }
        try {
            await upsertChannel(config)
            await reloadData()
            toast(t('bindings.channel_config_saved', { channel: t('bindings.feishu') }), 'success')
        } catch (e) { toast(String(e), 'error') }
        finally { setSavingChannel(false) }
    }

    const handleTestConnection = async () => {
        if (!appId || !appSecret) { toast(t('bindings.feishu_missing_credentials'), 'error'); return }
        setTesting(true)
        try {
            const ok = await testFeishuConnection(appId, appSecret)
            toast(ok ? t('bindings.feishu_connect_success') : t('bindings.feishu_connect_failed'), ok ? 'success' : 'error')
        } catch (e) { toast(String(e), 'error') }
        finally { setTesting(false) }
    }

    /* ── New group modal ── */
    const openGroupModal = () => {
        setModalForm({ channel_name: '', channel_id: '' })
        setShowGroupModal(true)
    }

    const handleCreateGroup = () => {
        if (!currentOpc) return
        if (!modalForm.channel_id.trim()) { toast(t('bindings.channel_id_required'), 'error'); return }
        const now = Math.floor(Date.now() / 1000)
        const group: Omit<BindingRule, 'agent_id' | 'agent_name' | 'trigger_mode'> = {
            id: crypto.randomUUID(), opc_id: currentOpc.id,
            channel_id: modalForm.channel_id, channel_name: modalForm.channel_name || modalForm.channel_id,
            channel_type: 'GROUP',
            is_enabled: true, created_at: now, updated_at: now,
        }
        setPendingGroup(group)
        setPositions(prev => {
            const next = new Map(prev)
            next.set('__pending__', { x: 60, y: 55 + bindings.length * 100 })
            return next
        })
        setShowGroupModal(false)
        toast('拖动右侧圆点到智能体完成绑定', 'info')
    }

    /* ── Drag: start from group card (move) or port (bind) ── */
    const startMove = (id: string, label: string, e: React.MouseEvent) => {
        e.preventDefault()
        e.stopPropagation()
        const ctr = canvasRef.current
        if (!ctr) return
        const cr = ctr.getBoundingClientRect()
        const pos = positions.get(id) ?? { x: 60, y: 40 }
        setDragMode('move')
        setDragFrom(id)
        setDragLabel(label)
        setDragOffset({ x: e.clientX - cr.left - pos.x, y: e.clientY - cr.top - pos.y })
    }

    const startBind = (id: string, label: string, e: React.MouseEvent) => {
        e.preventDefault()
        e.stopPropagation()
        const ctr = canvasRef.current
        if (!ctr) return
        const cr = ctr.getBoundingClientRect()
        setDragMode('bind')
        setDragFrom(id)
        setDragPt({ x: e.clientX - cr.left, y: e.clientY - cr.top })
        setDragLabel(label)
        setDragOffset({ x: 0, y: 0 })
    }

    /* ── Global mouse move/up for drag ── */
    useEffect(() => {
        if (!dragFrom || !dragMode) return
        const ctr = canvasRef.current
        if (!ctr) return

        const onMove = (e: MouseEvent) => {
            const cr = ctr.getBoundingClientRect()
            const pt = { x: e.clientX - cr.left, y: e.clientY - cr.top }

            if (dragMode === 'move') {
                const leftCol = ctr.querySelector('.bind-freeform') as HTMLElement
                if (leftCol) {
                    const w = leftCol.offsetWidth
                    const h = leftCol.offsetHeight
                    // Half-tile + port overhang + margin
                    const hx = 56, hy = 48
                    const x = Math.max(hx, Math.min(w - hx, pt.x - dragOffset.x))
                    const y = Math.max(hy, Math.min(h - hy, pt.y - dragOffset.y))
                    setPositions(prev => new Map(prev).set(dragFrom!, { x, y }))
                }
                return
            }

            // Bind mode
            setDragPt(pt)

            // Check if hovering an agent tile
            let hit: string | null = null
            agentPortRefs.current.forEach((el, agentId) => {
                const tile = el.closest('.bind-tile')
                if (!tile) return
                const r = tile.getBoundingClientRect()
                if (e.clientX >= r.left - 4 && e.clientX <= r.right + 4 &&
                    e.clientY >= r.top - 4 && e.clientY <= r.bottom + 4) {
                    hit = agentId
                }
            })
            setDropTarget(hit)

            // Curve from group port to cursor/agent
            const srcEl = groupPortRefs.current.get(dragFrom!)
            if (srcEl) {
                const from = ptOf(srcEl, ctr)
                const to = hit
                    ? ptOf(agentPortRefs.current.get(hit)!, ctr)
                    : pt
                setDragCurve(bPath(from, to))
            }
        }

        const onUp = async (e: MouseEvent) => {
            if (dragMode === 'bind' && dropTarget && dragFrom) {
                const agent = agents.find(a => a.id === dropTarget)
                if (!agent) { cleanup(); return }

                const cr = ctr.getBoundingClientRect()
                const pos: Pt = { x: e.clientX - cr.left, y: e.clientY - cr.top }

                if (dragFrom === '__pending__' && pendingGroup) {
                    setTriggerConfirm({ agentId: agent.id, agentName: agent.display_name, sourceId: '__pending__', pos })
                } else {
                    const existing = bindings.find(b => b.id === dragFrom)
                    if (existing && existing.agent_id !== dropTarget) {
                        setTriggerConfirm({ agentId: agent.id, agentName: agent.display_name, sourceId: existing.id, pos })
                    }
                }
            }
            cleanup()
        }

        const cleanup = () => {
            setDragMode(null)
            setDragFrom(null)
            setDragPt(null)
            setDragCurve(null)
            setDropTarget(null)
            setDragLabel('')
        }

        window.addEventListener('mousemove', onMove)
        window.addEventListener('mouseup', onUp)
        return () => { window.removeEventListener('mousemove', onMove); window.removeEventListener('mouseup', onUp) }
    }, [dragFrom, dragMode, dropTarget, pendingGroup, agents, bindings, dragOffset])

    /* ── Esc key closes any open modal/popover ── */
    useEffect(() => {
        const onKey = (e: KeyboardEvent) => {
            if (e.key !== 'Escape') return
            if (triggerConfirm) { setTriggerConfirm(null); return }
            if (editBinding) { setEditBinding(null); return }
            if (showGroupModal) { setShowGroupModal(false); return }
            if (channelEditing) { setChannelEditing(false); return }
        }
        window.addEventListener('keydown', onKey)
        return () => window.removeEventListener('keydown', onKey)
    }, [triggerConfirm, editBinding, showGroupModal, channelEditing])

    /* ── Confirm trigger mode after drag-drop ── */
    const handleTriggerConfirm = async (mode: 'MENTION' | 'ALL') => {
        if (!triggerConfirm) return
        const { agentId, agentName, sourceId } = triggerConfirm
        setSavingBinding(true)
        try {
            if (sourceId === '__pending__' && pendingGroup) {
                const binding: BindingRule = { ...pendingGroup, agent_id: agentId, agent_name: agentName, trigger_mode: mode }
                await createBinding(binding)
                await reloadData()
                setPendingGroup(null)
            } else {
                const existing = bindings.find(b => b.id === sourceId)
                if (existing) {
                    const updated = { ...existing, agent_id: agentId, agent_name: agentName, trigger_mode: mode, updated_at: Math.floor(Date.now() / 1000) }
                    await updateBinding(existing.id, updated)
                    setBindings(prev => prev.map(b => b.id === updated.id ? updated : b))
                }
            }
            toast(t('bindings.binding_saved'), 'success')
        } catch (e) { toast(String(e), 'error') }
        finally { setSavingBinding(false); setTriggerConfirm(null) }
    }

    /* ── Toggle ── */
    const handleToggleBinding = async (binding: BindingRule) => {
        try {
            await toggleBinding(binding.id, !binding.is_enabled)
            const updated = { ...binding, is_enabled: !binding.is_enabled }
            setBindings(prev => prev.map(b => b.id === binding.id ? updated : b))
        } catch (e) { toast(String(e), 'error') }
    }

    /* ── Delete ── */
    const handleDeleteBinding = async (id: string) => {
        try {
            await deleteBinding(id)
            setBindings(prev => prev.filter(b => b.id !== id))
            setSelectedBindingId(null)
            setEditBinding(null)
            toast(t('common.deleted'), 'success')
        } catch (e) { toast(String(e), 'error') }
    }

    /* ── Edit existing group info ── */
    const openEditModal = (b: BindingRule) => {
        setEditBinding({ ...b })
    }

    const handleSaveEdit = async () => {
        if (!editBinding) return
        if (!editBinding.channel_id.trim()) { toast(t('bindings.channel_id_required'), 'error'); return }
        setSavingBinding(true)
        try {
            const updated = { ...editBinding, updated_at: Math.floor(Date.now() / 1000) }
            await updateBinding(editBinding.id, updated)
            setBindings(prev => prev.map(b => b.id === updated.id ? updated : b))
            setEditBinding(null)
            toast(t('bindings.binding_saved'), 'success')
        } catch (e) { toast(String(e), 'error') }
        finally { setSavingBinding(false) }
    }

    const maskedAppId = appId ? appId.slice(0, 8) + '···' : '—'

    if (!currentOpc) {
        return (
            <div className="flex-center justify-center flex-1 text-sm text-dimmer">
                {t('bindings.select_opc_hint')}
            </div>
        )
    }

    const hasDrag = dragMode === 'bind'

    const boundAgentIds = new Set(bindings.map(b => b.agent_id))

    return (
        <div className="page-scroll">

            {/* Page header */}
            <div className="flex-center" style={{ justifyContent: 'space-between' }}>
                <div>
                    <h1 className="page-title">渠道端管理</h1>
                    <p className="page-sub">配置飞书应用凭证，将群组消息路由到指定 Agent</p>
                </div>
                <button className="btn btn-sm btn-primary" onClick={openGroupModal}>
                    <Icon name="plus" size={12} /> 添加群组
                </button>
            </div>

            {/* ── Section 1: Channel ── */}
            <div className="section-card">
                <div className="section-card-head" style={{ cursor: 'pointer' }} onClick={() => setChannelEditing(e => !e)}>
                    <div className="flex-center gap-12">
                        <span style={{ width: 36, height: 36, borderRadius: 9, background: '#0066FF', display: 'grid', placeItems: 'center', color: '#fff', fontWeight: 700, fontSize: 11, flexShrink: 0, letterSpacing: '0.02em' }}>飞书</span>
                        <div style={{ minWidth: 0 }}>
                            <div className="text-sm text-bold">飞书应用</div>
                            <div className="text-xxs muted mono mt-1">{maskedAppId}</div>
                        </div>
                        {channel
                            ? <span className="tag success" style={{ marginLeft: 4 }}><span className="dot live" /> 已连接</span>
                            : <span className="tag" style={{ marginLeft: 4 }}>未配置</span>
                        }
                    </div>
                    <div className="flex-center gap-8">
                        <button className="btn btn-sm" onClick={e => { e.stopPropagation(); handleTestConnection() }} disabled={testing || !appId || !appSecret}>
                            {testing ? '测试中…' : '测试连接'}
                        </button>
                        <Icon name={channelEditing ? 'chevron-up' : 'chevron-down'} size={14} className="muted" />
                    </div>
                </div>

                {channelEditing && (
                    <>
                        <div className="section-card-body">
                            <div className="field-row">
                                <div className="field-label-cell">
                                    <div className="field-name">App ID</div>
                                    <div className="field-hint">cli_ 开头的应用 ID</div>
                                </div>
                                <div className="field-value-cell">
                                    <input type="text" className="field-input" value={appId} onChange={e => setAppId(e.target.value)} placeholder="cli_..." />
                                </div>
                            </div>
                            <div className="field-row">
                                <div className="field-label-cell">
                                    <div className="field-name">App Secret</div>
                                    <div className="field-hint">应用凭证密钥</div>
                                </div>
                                <div className="field-value-cell">
                                    <input type="password" className="field-input" value={appSecret} onChange={e => setAppSecret(e.target.value)} placeholder="••••••••" />
                                </div>
                            </div>
                        </div>
                        <div className="modal-footer">
                            <button className="btn btn-sm" onClick={() => setChannelEditing(false)}>取消</button>
                            <button className="btn btn-sm btn-primary" onClick={handleSaveChannel} disabled={savingChannel}>
                                {savingChannel ? t('common.saving') : t('common.button_save')}
                            </button>
                        </div>
                    </>
                )}
            </div>

            {/* ── Section 2: Binding Canvas ── */}
            <div className="section-card">
                <div className="bind-canvas" ref={canvasRef}>
                    {/* ── Left: Groups (free-position) ── */}
                    <div className="bind-col bind-col-left">
                        <div className="bind-freeform">
                            {bindings.map(b => {
                                const agent = agents.find(a => a.id === b.agent_id)
                                const agentColor = agent?.gradient_start ?? 'var(--accent)'
                                const pos = positions.get(b.id) ?? { x: 60, y: 40 }
                                const isMoving = dragMode === 'move' && dragFrom === b.id
                                return (
                                    <div
                                        key={b.id}
                                        className={'bind-tile bind-tile-group' + (!b.is_enabled ? ' is-disabled' : '')}
                                        style={{ position: 'absolute', left: pos.x, top: pos.y, transform: 'translate(-50%, -50%)' }}
                                        onMouseDown={e => { if (e.button === 0) startMove(b.id, b.channel_name || '(unnamed)', e) }}
                                        onDoubleClick={() => openEditModal(b)}
                                    >
                                        <div className="bind-tile-avatar" style={{ background: 'var(--bg-elevated)' }}>
                                            <Icon name="message" size={13} />
                                        </div>
                                        <div className="bind-tile-name">{b.channel_name || '(unnamed)'}</div>
                                        {/* Port on right edge — drag to bind */}
                                        <div
                                            className={'bind-port bind-port-right' + (b.is_enabled ? ' is-active' : '')}
                                            style={{ borderColor: b.is_enabled ? agentColor : undefined }}
                                            ref={el => { if (el) groupPortRefs.current.set(b.id, el); else groupPortRefs.current.delete(b.id) }}
                                            onMouseDown={e => { if (e.button === 0) startBind(b.id, b.channel_name || '', e) }}
                                        />
                                    </div>
                                )
                            })}
                            {/* Pending group */}
                            {pendingGroup && (() => {
                                const pos = positions.get('__pending__') ?? { x: 60, y: 40 + bindings.length * 56 }
                                return (
                                    <div
                                        className="bind-tile bind-tile-group is-pending"
                                        style={{ position: 'absolute', left: pos.x, top: pos.y, transform: 'translate(-50%, -50%)' }}
                                        onMouseDown={e => { if (e.button === 0) startMove('__pending__', pendingGroup.channel_name, e) }}
                                    >
                                        <div className="bind-tile-avatar" style={{ background: 'var(--accent-soft)' }}>
                                            <Icon name="plus" size={13} />
                                        </div>
                                        <div className="bind-tile-name">{pendingGroup.channel_name}</div>
                                        <div
                                            className="bind-port bind-port-right is-pending-port"
                                            ref={el => { if (el) groupPortRefs.current.set('__pending__', el); else groupPortRefs.current.delete('__pending__') }}
                                            onMouseDown={e => { if (e.button === 0) startBind('__pending__', pendingGroup.channel_name, e) }}
                                        />
                                    </div>
                                )
                            })()}
                            {bindings.length === 0 && !pendingGroup && (
                                <div className="bind-empty-hint" style={{ position: 'absolute', inset: 0, display: 'grid', placeItems: 'center' }}>
                                    点击「添加群组」创建
                                </div>
                            )}
                        </div>
                    </div>

                    {/* ── SVG curves (horizontal Bézier) ── */}
                    <svg className="bind-svg">
                        {curves.map(c => (
                            <g key={c.id}>
                                <path d={c.d} fill="none" stroke={c.color} strokeWidth={c.enabled ? 5 : 2} strokeOpacity={c.enabled ? 0.08 : 0.03} strokeLinecap="round" />
                                <path
                                    d={c.d} fill="none" stroke={c.color} strokeWidth={2} strokeLinecap="round"
                                    strokeOpacity={c.enabled ? 0.6 : 0.2}
                                    strokeDasharray={c.enabled ? 'none' : '5 4'}
                                    className="bind-curve"
                                    style={{ pointerEvents: 'stroke', cursor: 'pointer' }}
                                    onClick={() => {
                                        const b = bindings.find(x => x.id === c.id)
                                        if (b) openEditModal(b)
                                    }}
                                />
                                {c.enabled && (
                                    <circle r="2.5" fill={c.color} opacity="0.8">
                                        <animateMotion dur="2.5s" repeatCount="indefinite" path={c.d} />
                                    </circle>
                                )}
                            </g>
                        ))}
                        {dragCurve && (
                            <path d={dragCurve} fill="none" stroke="var(--accent)" strokeWidth={2} strokeLinecap="round" strokeDasharray="6 4" opacity={0.7} />
                        )}
                    </svg>

                    {/* ── Right: Agents (grid of tiles) ── */}
                    <div className="bind-col bind-col-right">
                        <div className="bind-agent-grid">
                            {agents.map(agent => {
                                const agentColor = agent.gradient_start ?? 'var(--accent)'
                                const initials = agentAvatarText(agent)
                                const isBound = boundAgentIds.has(agent.id)
                                const isHover = dropTarget === agent.id
                                return (
                                    <div
                                        key={agent.id}
                                        className={'bind-tile' + (isHover ? ' is-drop-target' : '') + (!isBound ? ' is-unbound' : '')}
                                    >
                                        <div
                                            className="bind-port bind-port-left"
                                            style={{ borderColor: isBound ? agentColor : undefined }}
                                            ref={el => { if (el) agentPortRefs.current.set(agent.id, el); else agentPortRefs.current.delete(agent.id) }}
                                        />
                                        <div className="bind-tile-avatar" style={{ background: agentColor }}>
                                            {initials}
                                        </div>
                                        <div className="bind-tile-name">{agent.display_name}</div>
                                    </div>
                                )
                            })}
                        </div>
                        {agents.length === 0 && (
                            <div className="bind-empty-hint">暂无智能体</div>
                        )}
                    </div>
                </div>

                {hasDrag && (
                    <div className="bind-drag-hint">拖动到右侧智能体完成绑定</div>
                )}
            </div>

            {/* ── New Group Modal ── */}
            {showGroupModal && (
                <div className="modal-backdrop" onClick={() => setShowGroupModal(false)}>
                    <div className="modal" onClick={e => e.stopPropagation()}>
                        <div className="modal-header">
                            <h2 className="modal-title">添加群组</h2>
                            <button className="modal-close" onClick={() => setShowGroupModal(false)}>
                                <Icon name="close" size={16} />
                            </button>
                        </div>
                        <div className="modal-body">
                            <div className="field-row">
                                <div className="field-label-cell">
                                    <div className="field-name">群组名称</div>
                                    <div className="field-hint">飞书群组的显示名称</div>
                                </div>
                                <div className="field-value-cell">
                                    <input type="text" className="field-input" value={modalForm.channel_name} onChange={e => setModalForm(p => ({ ...p, channel_name: e.target.value }))} placeholder="例：产品讨论群" autoFocus />
                                </div>
                            </div>
                            <div className="field-row">
                                <div className="field-label-cell">
                                    <div className="field-name">群组 ID</div>
                                    <div className="field-hint">oc_ 开头的群组标识</div>
                                </div>
                                <div className="field-value-cell">
                                    <input type="text" className="field-input mono" value={modalForm.channel_id} onChange={e => setModalForm(p => ({ ...p, channel_id: e.target.value }))} placeholder="oc_xxx..." />
                                </div>
                            </div>
                        </div>
                        <div className="modal-footer">
                            <button className="btn btn-sm" onClick={() => setShowGroupModal(false)}>取消</button>
                            <button className="btn btn-sm btn-primary" onClick={handleCreateGroup} disabled={savingBinding}>
                                创建群组
                            </button>
                        </div>
                    </div>
                </div>
            )}

            {/* ── Edit Binding Modal ── */}
            {editBinding && (
                <div className="modal-backdrop" onClick={() => setEditBinding(null)}>
                    <div className="modal" onClick={e => e.stopPropagation()}>
                        <div className="modal-header">
                            <h2 className="modal-title">编辑绑定</h2>
                            <button className="modal-close" onClick={() => setEditBinding(null)}>
                                <Icon name="close" size={16} />
                            </button>
                        </div>
                        <div className="modal-body">
                            <div className="field-row">
                                <div className="field-label-cell">
                                    <div className="field-name">群组名称</div>
                                </div>
                                <div className="field-value-cell">
                                    <input type="text" className="field-input" value={editBinding.channel_name} onChange={e => setEditBinding(p => p ? { ...p, channel_name: e.target.value } : p)} />
                                </div>
                            </div>
                            <div className="field-row">
                                <div className="field-label-cell">
                                    <div className="field-name">群组 ID</div>
                                </div>
                                <div className="field-value-cell">
                                    <input type="text" className="field-input mono" value={editBinding.channel_id} onChange={e => setEditBinding(p => p ? { ...p, channel_id: e.target.value } : p)} />
                                </div>
                            </div>
                            <div className="field-row">
                                <div className="field-label-cell">
                                    <div className="field-name">触发模式</div>
                                </div>
                                <div className="field-value-cell">
                                    <div className="seg">
                                        <span className={'seg-item' + (editBinding.trigger_mode === 'MENTION' ? ' active' : '')} onClick={() => setEditBinding(p => p ? { ...p, trigger_mode: 'MENTION' } : p)} style={{ cursor: 'pointer' }}>@ 触发</span>
                                        <span className={'seg-item' + (editBinding.trigger_mode === 'ALL' ? ' active' : '')} onClick={() => setEditBinding(p => p ? { ...p, trigger_mode: 'ALL' } : p)} style={{ cursor: 'pointer' }}>全部消息</span>
                                    </div>
                                </div>
                            </div>
                            <div className="field-row">
                                <div className="field-label-cell">
                                    <div className="field-name">关联智能体</div>
                                </div>
                                <div className="field-value-cell">
                                    <div className="text-sm" style={{ padding: '8px 0', color: 'var(--text-secondary)' }}>
                                        {agents.find(a => a.id === editBinding.agent_id)?.display_name ?? '—'}
                                        <span className="text-xxs muted" style={{ marginLeft: 8 }}>拖动连线可更改</span>
                                    </div>
                                </div>
                            </div>
                        </div>
                        <div className="modal-footer">
                            <button className="btn btn-sm btn-danger" onClick={() => { handleDeleteBinding(editBinding.id); setEditBinding(null) }}>
                                <Icon name="trash" size={12} /> 解绑
                            </button>
                            <div style={{ flex: 1 }} />
                            <button className="btn btn-sm" onClick={() => setEditBinding(null)}>取消</button>
                            <button className="btn btn-sm btn-primary" onClick={handleSaveEdit} disabled={savingBinding}>
                                <Icon name="check" size={12} /> 保存
                            </button>
                        </div>
                    </div>
                </div>
            )}

            {/* ── Trigger Mode Confirm Popover (after drag-drop) ── */}
            {triggerConfirm && (
                <div className="modal-backdrop" onClick={() => setTriggerConfirm(null)}>
                    <div className="bind-trigger-popover" onClick={e => e.stopPropagation()}>
                        <div className="bind-trigger-title">
                            选择触发模式
                        </div>
                        <div className="bind-trigger-sub">
                            绑定到 <strong>{triggerConfirm.agentName}</strong>
                        </div>
                        <div className="bind-trigger-options">
                            <button
                                className="bind-trigger-option"
                                onClick={() => handleTriggerConfirm('MENTION')}
                                disabled={savingBinding}
                            >
                                <div className="bind-trigger-option-title">@ 触发</div>
                                <div className="bind-trigger-option-desc">仅 @机器人 时响应</div>
                            </button>
                            <button
                                className="bind-trigger-option"
                                onClick={() => handleTriggerConfirm('ALL')}
                                disabled={savingBinding}
                            >
                                <div className="bind-trigger-option-title">全部消息</div>
                                <div className="bind-trigger-option-desc">群内所有消息都响应</div>
                            </button>
                        </div>
                        <button className="btn btn-xs" style={{ marginTop: 8, width: '100%' }} onClick={() => setTriggerConfirm(null)}>
                            取消
                        </button>
                    </div>
                </div>
            )}
        </div>
    )
}
