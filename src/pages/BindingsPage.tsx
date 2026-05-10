import { useState } from 'react'
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

export default function BindingsPage() {
    const { t } = useTranslation()
    const { currentOpc } = useOpc()

    const [channel, setChannel] = useState<ChannelConfig | null>(null)
    const [appId, setAppId] = useState('')
    const [appSecret, setAppSecret] = useState('')
    const [channelEditing, setChannelEditing] = useState(false)
    const [testing, setTesting] = useState(false)
    const [savingChannel, setSavingChannel] = useState(false)

    const [bindings, setBindings] = useState<BindingRule[]>([])
    const [agents, setAgents] = useState<AgentConfig[]>([])
    const [selectedBinding, setSelectedBinding] = useState<BindingRule | null>(null)
    const [bindingForm, setBindingForm] = useState<Partial<BindingRule>>({})
    const [bindingEditing, setBindingEditing] = useState(false)
    const [isNewBinding, setIsNewBinding] = useState(false)
    const [savingBinding, setSavingBinding] = useState(false)

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
            },
            onError: (e) => toast(e.message, 'error'),
        }
    )

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

    const handleAddBinding = () => {
        if (!currentOpc) return
        const now = Math.floor(Date.now() / 1000)
        const draft: BindingRule = {
            id: crypto.randomUUID(), opc_id: currentOpc.id,
            channel_id: '', channel_name: t('bindings.new_group'), channel_type: 'GROUP',
            agent_id: agents[0]?.id ?? '', agent_name: agents[0]?.display_name ?? '',
            trigger_mode: 'MENTION', is_enabled: true,
            created_at: now, updated_at: now,
        }
        setSelectedBinding(draft)
        setBindingForm(draft)
        setBindingEditing(true)
        setIsNewBinding(true)
    }

    const handleSelectBinding = (binding: BindingRule) => {
        setSelectedBinding(binding)
        setBindingForm({ ...binding })
        setBindingEditing(true)
        setIsNewBinding(false)
    }

    const handleCancelBinding = () => {
        setSelectedBinding(null)
        setIsNewBinding(false)
        setBindingEditing(false)
    }

    const handleBindingFormChange = (field: keyof BindingRule, value: unknown) => {
        setBindingForm(prev => {
            const next = { ...prev, [field]: value }
            if (field === 'agent_id') {
                const agent = agents.find(a => a.id === value)
                if (agent) next.agent_name = agent.display_name
            }
            return next
        })
    }

    const handleSaveBinding = async () => {
        if (!selectedBinding) return
        if (!bindingForm.channel_id?.trim()) { toast(t('bindings.channel_id_required'), 'error'); return }
        setSavingBinding(true)
        try {
            const updated = { ...selectedBinding, ...bindingForm, updated_at: Math.floor(Date.now() / 1000) } as BindingRule
            if (isNewBinding) { await createBinding(updated); await reloadData(); setSelectedBinding(updated) }
            else { await updateBinding(selectedBinding.id, updated); setBindings(prev => prev.map(b => b.id === updated.id ? updated : b)); setSelectedBinding(updated) }
            setIsNewBinding(false); setBindingEditing(false)
            toast(t('bindings.binding_saved'), 'success')
        } catch (e) { toast(String(e), 'error') }
        finally { setSavingBinding(false) }
    }

    const handleDeleteBinding = async () => {
        if (!selectedBinding) return
        try {
            await deleteBinding(selectedBinding.id)
            setBindings(prev => prev.filter(b => b.id !== selectedBinding.id))
            setSelectedBinding(null); setIsNewBinding(false)
            toast(t('common.deleted'), 'success')
        } catch (e) { toast(String(e), 'error') }
    }

    const handleToggleBinding = async (binding: BindingRule) => {
        try {
            await toggleBinding(binding.id, !binding.is_enabled)
            const updated = { ...binding, is_enabled: !binding.is_enabled }
            setBindings(prev => prev.map(b => b.id === binding.id ? updated : b))
            if (selectedBinding?.id === binding.id) {
                setSelectedBinding(updated)
                setBindingForm(prev => ({ ...prev, is_enabled: updated.is_enabled }))
            }
        } catch (e) { toast(String(e), 'error') }
    }

    const maskedAppId = appId ? appId.slice(0, 8) + '···' : '—'

    if (!currentOpc) {
        return (
            <div className="flex-center justify-center flex-1 text-sm text-dimmer">
                {t('bindings.select_opc_hint')}
            </div>
        )
    }

    const enabledCount = bindings.filter(b => b.is_enabled).length

    return (
        <div className="page-scroll">

            {/* Page header */}
            <div>
                <h1 className="page-title">渠道端管理</h1>
                <p className="page-sub">配置飞书应用凭证，将群组消息路由到指定 Agent</p>
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

            {/* ── Section 2: Bindings ── */}
            <div className="section-card">
                <div className="section-card-head">
                    <div>
                        <h3 className="section-card-title">绑定规则</h3>
                        <div className="section-card-sub">{bindings.length} 条规则，{enabledCount} 条启用</div>
                    </div>
                    <button className="btn btn-sm btn-primary" onClick={handleAddBinding}>
                        <Icon name="plus" size={12} /> 添加绑定
                    </button>
                </div>

                {bindings.length === 0 && !isNewBinding ? (
                    <div className="empty-state text-center">
                        <Icon name="link" size={28} className="empty-state-icon" />
                        <div className="empty-state-title">暂无绑定规则</div>
                        <div className="empty-state-desc">点击「添加绑定」将飞书群组与 Agent 关联</div>
                    </div>
                ) : (
                    <div style={{ padding: '8px 12px' }}>
                        {bindings.map(b => {
                            const agent = agents.find(a => a.id === b.agent_id)
                            const agentName = agent?.display_name ?? b.agent_name ?? '—'
                            const agentColor = agent?.gradient_start ?? 'var(--accent)'
                            const agentInitials = agent ? agentAvatarText(agent) : agentName.slice(0, 1)
                            const isSelected = selectedBinding?.id === b.id
                            return (
                                <div
                                    key={b.id}
                                    className={'bind-card' + (isSelected ? ' is-selected' : '')}
                                    onClick={() => handleSelectBinding(b)}
                                    style={{ marginBottom: 6 }}
                                >
                                    <div className="bind-card-icon" style={{ background: 'var(--bg-elevated)' }}>
                                        <Icon name="message" size={14} />
                                    </div>
                                    <div className="bind-card-info">
                                        <div className="bind-card-name">{b.channel_name || '（未命名群组）'}</div>
                                        <div className="bind-card-meta">
                                            <span className="mono">{b.channel_id ? b.channel_id.slice(0, 16) + '…' : '—'}</span>
                                            <span>·</span>
                                            <span>{b.trigger_mode === 'MENTION' ? '@触发' : '全部消息'}</span>
                                        </div>
                                    </div>
                                    <div className="flex-center gap-8 flex-shrink-0">
                                        <Icon name="arrow-right" size={10} className="muted" />
                                        <div style={{ width: 24, height: 24, borderRadius: 6, background: agentColor, display: 'grid', placeItems: 'center', fontSize: 10, fontWeight: 700, color: '#fff', flexShrink: 0 }}>
                                            {agentInitials}
                                        </div>
                                        <span className="text-xs text-medium">{agentName}</span>
                                    </div>
                                    <div
                                        className={'toggle' + (b.is_enabled ? ' on' : '')}
                                        onClick={e => { e.stopPropagation(); handleToggleBinding(b) }}
                                    />
                                </div>
                            )
                        })}
                        {isNewBinding && selectedBinding && (
                            <div className="bind-card is-selected" style={{ marginBottom: 6 }}>
                                <div className="bind-card-icon" style={{ background: 'var(--accent-soft)' }}>
                                    <Icon name="plus" size={14} />
                                </div>
                                <div className="bind-card-info">
                                    <div className="bind-card-name">{bindingForm.channel_name || t('bindings.new_group')}</div>
                                    <div className="bind-card-meta">
                                        <span className="unsaved-tag">新建 · 未保存</span>
                                    </div>
                                </div>
                            </div>
                        )}
                    </div>
                )}
            </div>

            {/* ── Section 3: Selected binding detail ── */}
            {selectedBinding && (
                <div className="section-card">
                    <div className="section-card-head">
                        <div>
                            <h3 className="section-card-title">
                                {isNewBinding ? '新建绑定' : '编辑绑定'}
                            </h3>
                            <div className="section-card-sub">{bindingForm.channel_name || '未命名'}</div>
                        </div>
                        <div className="flex gap-6">
                            {!isNewBinding && (
                                <button className="btn btn-sm btn-danger" onClick={handleDeleteBinding}>
                                    <Icon name="trash" size={12} /> 解绑
                                </button>
                            )}
                            <button className="btn btn-sm" onClick={handleCancelBinding}>取消</button>
                            <button className="btn btn-sm btn-primary" onClick={handleSaveBinding} disabled={savingBinding}>
                                <Icon name="check" size={12} /> {savingBinding ? t('common.saving') : '保存'}
                            </button>
                        </div>
                    </div>
                    <div className="section-card-body">
                        <div className="field-row">
                            <div className="field-label-cell">
                                <div className="field-name">群组名称</div>
                                <div className="field-hint">飞书群组的显示名称</div>
                            </div>
                            <div className="field-value-cell">
                                <input type="text" className="field-input" value={bindingForm.channel_name ?? ''} onChange={e => handleBindingFormChange('channel_name', e.target.value)} disabled={!bindingEditing} />
                            </div>
                        </div>
                        <div className="field-row">
                            <div className="field-label-cell">
                                <div className="field-name">群组 ID</div>
                                <div className="field-hint">oc_ 开头的群组标识</div>
                            </div>
                            <div className="field-value-cell">
                                <input type="text" className="field-input mono" value={bindingForm.channel_id ?? ''} onChange={e => handleBindingFormChange('channel_id', e.target.value)} placeholder="oc_xxx..." disabled={!bindingEditing} />
                            </div>
                        </div>
                        <div className="field-row">
                            <div className="field-label-cell">
                                <div className="field-name">关联 Agent</div>
                                <div className="field-hint">处理该群组消息的智能体</div>
                            </div>
                            <div className="field-value-cell">
                                <select className="field-input" value={bindingForm.agent_id ?? ''} onChange={e => handleBindingFormChange('agent_id', e.target.value)} disabled={!bindingEditing}>
                                    <option value="">— 未选择 —</option>
                                    {agents.map(a => (
                                        <option key={a.id} value={a.id}>{a.display_name}</option>
                                    ))}
                                </select>
                            </div>
                        </div>
                        <div className="field-row">
                            <div className="field-label-cell">
                                <div className="field-name">触发模式</div>
                                <div className="field-hint">何时将消息路由给 Agent</div>
                            </div>
                            <div className="field-value-cell">
                                <div className="seg">
                                    <span className={'seg-item' + (bindingForm.trigger_mode === 'MENTION' ? ' active' : '')} onClick={() => bindingEditing && handleBindingFormChange('trigger_mode', 'MENTION')} style={{ cursor: bindingEditing ? 'pointer' : 'default' }}>
                                        @ 触发
                                    </span>
                                    <span className={'seg-item' + (bindingForm.trigger_mode === 'ALL' ? ' active' : '')} onClick={() => bindingEditing && handleBindingFormChange('trigger_mode', 'ALL')} style={{ cursor: bindingEditing ? 'pointer' : 'default' }}>
                                        全部消息
                                    </span>
                                </div>
                            </div>
                        </div>
                        <div className="field-row">
                            <div className="field-label-cell">
                                <div className="field-name">{t('bindings.enable_status')}</div>
                                <div className="field-hint">关闭后消息不再路由</div>
                            </div>
                            <div className="flex-center gap-10" style={{ paddingTop: 8 }}>
                                <div className={'toggle' + (bindingForm.is_enabled ? ' on' : '')} onClick={() => bindingEditing && handleBindingFormChange('is_enabled', !bindingForm.is_enabled)} style={{ cursor: bindingEditing ? 'pointer' : 'default', opacity: bindingEditing ? 1 : 0.7 }} />
                                <span className="text-sm text-dim">
                                    {bindingForm.is_enabled ? t('common.enabled') : t('common.disabled')}
                                </span>
                            </div>
                        </div>
                    </div>
                </div>
            )}
        </div>
    )
}
