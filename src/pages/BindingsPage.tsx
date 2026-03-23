import { useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { useOpc } from '../contexts/OpcContext'
import {
    getChannels, upsertChannel, testFeishuConnection,
    getBindings, createBinding, updateBinding, deleteBinding, toggleBinding,
    getAgents,
} from '../lib/api'
import { toast } from '../components/Toast'
import type { ChannelConfig, BindingRule, AgentConfig } from '../lib/types'

export default function BindingsPage() {
    const { t } = useTranslation()
    const { opcs, currentOpc, selectOpc } = useOpc()

    const [channelType, setChannelType] = useState<'FEISHU' | 'DINGTALK' | 'SLACK'>('FEISHU')
    const [channel, setChannel] = useState<ChannelConfig | null>(null)
    // Feishu
    const [appId, setAppId] = useState('')
    const [appSecret, setAppSecret] = useState('')
    // DingTalk
    const [dtAppKey, setDtAppKey] = useState('')
    const [dtAppSecret, setDtAppSecret] = useState('')
    const [dtWebhook, setDtWebhook] = useState('')
    // Slack
    const [slackBotToken, setSlackBotToken] = useState('')
    const [slackSigningSecret, setSlackSigningSecret] = useState('')

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

    useEffect(() => {
        if (!currentOpc) return
        loadData()
    }, [currentOpc?.id])

    const loadData = async () => {
        if (!currentOpc) return
        try {
            const [channels, bindingList, agentList] = await Promise.all([
                getChannels(currentOpc.id),
                getBindings(currentOpc.id),
                getAgents(currentOpc.id),
            ])
            const feishu = channels.find(c => c.channel_type === 'FEISHU') ?? null
            const dingtalk = channels.find(c => c.channel_type === 'DINGTALK') ?? null
            const slack = channels.find(c => c.channel_type === 'SLACK') ?? null
            setChannel(feishu)
            setAppId(feishu?.feishu_config?.app_id ?? '')
            setAppSecret(feishu?.feishu_config?.app_secret ?? '')
            setDtAppKey((dingtalk as any)?.dingtalk_config?.app_key ?? '')
            setDtAppSecret((dingtalk as any)?.dingtalk_config?.app_secret ?? '')
            setDtWebhook((dingtalk as any)?.dingtalk_config?.webhook_url ?? '')
            setSlackBotToken((slack as any)?.slack_config?.bot_token ?? '')
            setSlackSigningSecret((slack as any)?.slack_config?.signing_secret ?? '')
            setChannelEditing(false)
            setBindings(bindingList)
            setAgents(agentList)
        } catch (e) {
            toast(String(e), 'error')
        }
    }

    const handleSaveChannel = async () => {
        if (!currentOpc) return
        setSavingChannel(true)
        const nowTs = Math.floor(Date.now() / 1000)

        let channelConfig: Record<string, unknown> = {}
        if (channelType === 'FEISHU') {
            channelConfig = { feishu_config: { app_id: appId, app_secret: appSecret } }
        } else if (channelType === 'DINGTALK') {
            channelConfig = { dingtalk_config: { app_key: dtAppKey, app_secret: dtAppSecret, webhook_url: dtWebhook } }
        } else {
            channelConfig = { slack_config: { bot_token: slackBotToken, signing_secret: slackSigningSecret } }
        }

        const config: ChannelConfig = channel && channel.channel_type === channelType
            ? { ...channel, ...channelConfig, updated_at: nowTs }
            : {
                id: crypto.randomUUID(), opc_id: currentOpc.id,
                channel_type: channelType, is_enabled: true,
                ...channelConfig,
                is_connected: false, created_at: nowTs, updated_at: nowTs,
            }
        try {
            await upsertChannel(config)
            await loadData()
            const labels: Record<string, string> = { FEISHU: t('bindings.feishu'), DINGTALK: t('bindings.dingtalk'), SLACK: 'Slack' }
            toast(t('bindings.channel_config_saved', { channel: labels[channelType] ?? channelType }), 'success')
        } catch (e) {
            toast(String(e), 'error')
        } finally {
            setSavingChannel(false)
        }
    }

    const handleTestConnection = async () => {
        if (!appId || !appSecret) { toast(t('bindings.feishu_missing_credentials'), 'error'); return }
        setTesting(true)
        try {
            const ok = await testFeishuConnection(appId, appSecret)
            toast(ok ? t('bindings.feishu_connect_success') : t('bindings.feishu_connect_failed'), ok ? 'success' : 'error')
        } catch (e) {
            toast(String(e), 'error')
        } finally { setTesting(false) }
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
        setBindingEditing(false)
        setIsNewBinding(false)
    }

    const handleCancelBinding = () => {
        if (isNewBinding) {
            setSelectedBinding(null)
            setIsNewBinding(false)
        } else {
            if (selectedBinding) setBindingForm({ ...selectedBinding })
        }
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
        if (!bindingForm.channel_id?.trim()) {
            toast(t('bindings.channel_id_required'), 'error')
            return
        }
        setSavingBinding(true)
        try {
            const updated: BindingRule = { ...selectedBinding, ...bindingForm, updated_at: Math.floor(Date.now() / 1000) } as BindingRule
            if (isNewBinding) {
                await createBinding(updated)
                await loadData()
                setSelectedBinding(updated)
            } else {
                await updateBinding(selectedBinding.id, updated)
                setBindings(prev => prev.map(b => b.id === updated.id ? updated : b))
                setSelectedBinding(updated)
            }
            setIsNewBinding(false)
            setBindingEditing(false)
            toast(t('bindings.binding_saved'), 'success')
        } catch (e) { toast(String(e), 'error') }
        finally { setSavingBinding(false) }
    }

    const handleDeleteBinding = async (id: string) => {
        try {
            await deleteBinding(id)
            setBindings(prev => prev.filter(b => b.id !== id))
            if (selectedBinding?.id === id) { setSelectedBinding(null); setIsNewBinding(false) }
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

    return (
        <>
            {/* COL2 - company list */}
            <div className="list-pane">
                <div className="toolbar" style={{ justifyContent: 'space-between' }}>
                    <span style={{ fontSize: '15px', fontWeight: 600, color: '#FFFFFF' }}>{t('bindings.section_title')}</span>
                </div>
                <div style={{ flex: 1, overflowY: 'auto' }}>
                    {(() => {
                        const running = opcs.filter(o => o.is_running)
                        const stopped = opcs.filter(o => !o.is_running)
                        return (
                            <>
                                {running.length > 0 && (
                                    <>
                                        <div className="section-label" style={{ padding: '8px 12px 3px' }}>{t('common.status_running')}</div>
                                        {running.map(opc => (
                                            <div
                                                key={opc.id}
                                                className={`list-row${currentOpc?.id === opc.id ? ' selected' : ''}`}
                                                onClick={() => { selectOpc(opc); setSelectedBinding(null) }}
                                                style={{ cursor: 'pointer' }}
                                            >
                                                <div className="avatar avatar-lg" style={{ background: `linear-gradient(135deg,${opc.avatar_color ?? '#8b5cf6'},#06b6d4)` }}>
                                                    {opc.avatar_initials ?? opc.display_name.slice(0, 1)}
                                                </div>
                                                <div style={{ flex: 1, minWidth: 0 }}>
                                                    <div className="flex-center gap-5">
                                                        <span className="text-sm text-medium">{opc.display_name}</span>
                                                        <span className="pulse-dot" style={{ width: '6px', height: '6px', borderRadius: '50%', background: '#34c759' }}></span>
                                                    </div>
                                                    <div className="text-xs text-dim">{opc.agent_count} {t('bindings.agents_count')} · {opc.channel_count} {t('bindings.groups_count')}</div>
                                                </div>
                                                <svg fill="none" stroke="currentColor" strokeWidth="1.75" viewBox="0 0 24 24" width="14" height="14" style={{ color: currentOpc?.id === opc.id ? '#8b5cf6' : 'rgba(255,255,255,0.3)' }}><path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" /></svg>
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
                                                className={`list-row${currentOpc?.id === opc.id ? ' selected' : ''}`}
                                                onClick={() => { selectOpc(opc); setSelectedBinding(null) }}
                                                style={{ cursor: 'pointer' }}
                                            >
                                                <div className="avatar avatar-lg" style={{ background: `linear-gradient(135deg,${opc.avatar_color ?? '#8E8E93'},#48484A)` }}>
                                                    {opc.avatar_initials ?? opc.display_name.slice(0, 1)}
                                                </div>
                                                <div style={{ flex: 1, minWidth: 0 }}>
                                                    <div className="flex-center gap-5">
                                                        <span className="text-sm text-medium text-dim">{opc.display_name}</span>
                                                        <span style={{ width: '6px', height: '6px', borderRadius: '50%', background: '#48484A' }}></span>
                                                    </div>
                                                    <div className="text-xs text-dim">{opc.agent_count} {t('bindings.agents_count')} · {opc.channel_count} {t('bindings.groups_count')}</div>
                                                </div>
                                                <svg fill="none" stroke="currentColor" strokeWidth="1.75" viewBox="0 0 24 24" width="14" height="14" style={{ color: 'rgba(255,255,255,0.3)' }}><path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" /></svg>
                                            </div>
                                        ))}
                                    </>
                                )}
                            </>
                        )
                    })()}
                </div>
            </div>

            {/* COL3 - OPC config: feishu bot + group list */}
            <main className="detail-pane">
                <div className="toolbar" style={{ justifyContent: 'space-between' }}>
                    <span style={{ fontSize: '15px', fontWeight: 600, color: '#FFFFFF' }}>{currentOpc?.display_name ?? '—'}</span>
                </div>
                {!currentOpc ? (
                    <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#8E8E93', fontSize: '13px' }}>
                        {t('bindings.select_opc_hint')}
                    </div>
                ) : (
                    <div style={{ flex: 1, overflowY: 'auto', padding: '14px 16px', display: 'flex', flexDirection: 'column', gap: '14px' }}>
                        {/* 渠道配置 */}
                        <section>
                            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '8px' }}>
                                <span className="section-label" style={{ padding: 0 }}>{t('bindings.channel_config')}</span>
                                <button className="tbtn tbtn-ghost" style={{ fontSize: '12px' }} onClick={() => setChannelEditing(e => !e)}>
                                    {channelEditing ? t('common.button_cancel') : t('bindings.reconfig')}
                                </button>
                            </div>

                            {/* 渠道类型选择 */}
                            <div style={{ display: 'flex', gap: '6px', marginBottom: '8px' }}>
                                {(['FEISHU', 'DINGTALK', 'SLACK'] as const).map(ct => {
                                    const labels: Record<string, string> = { FEISHU: t('bindings.feishu'), DINGTALK: t('bindings.dingtalk'), SLACK: 'Slack' }
                                    const active = channelType === ct
                                    return (
                                        <button key={ct} onClick={() => { setChannelType(ct); setChannelEditing(false) }}
                                            style={{ padding: '4px 12px', borderRadius: '6px', fontSize: '12px', cursor: 'pointer', border: `1px solid ${active ? 'rgba(139,92,246,0.5)' : 'rgba(255,255,255,0.12)'}`, background: active ? 'rgba(139,92,246,0.15)' : 'rgba(255,255,255,0.04)', color: active ? '#a78bfa' : 'rgba(255,255,255,0.6)', fontWeight: active ? 600 : 400, transition: 'all 0.15s' }}>
                                            {labels[ct]}
                                        </button>
                                    )
                                })}
                            </div>

                            <div className="group">
                                <div className="group-row">
                                    <span className="group-label">{t('bindings.connection_status')}</span>
                                    <span className="group-value" style={{ color: channel?.is_connected ? '#34c759' : '#8E8E93', display: 'flex', alignItems: 'center', gap: '4px' }}>
                                        {channel?.is_connected && <span style={{ width: '6px', height: '6px', borderRadius: '50%', background: '#34c759', display: 'inline-block' }}></span>}
                                        {channel?.is_connected ? t('common.status_connected') : t('common.status_not_connected')}
                                    </span>
                                </div>

                                {channelType === 'FEISHU' && (
                                    <>
                                        <div className="group-row" style={{ gap: '10px' }}>
                                            <span className="group-label">App ID</span>
                                            <input type="text" value={channelEditing ? appId : (appId ? appId.slice(0, 8) + '***' : '')} onChange={e => setAppId(e.target.value)} placeholder="cli_..." className="field-input" style={{ flex: 1 }} disabled={!channelEditing} />
                                        </div>
                                        <div className="group-row" style={{ gap: '10px' }}>
                                            <span className="group-label">App Secret</span>
                                            <input type={channelEditing ? 'password' : 'text'} value={channelEditing ? appSecret : (appSecret ? '已配置' : '')} onChange={e => setAppSecret(e.target.value)} placeholder="••••••••" className="field-input" style={{ flex: 1 }} disabled={!channelEditing} />
                                        </div>
                                    </>
                                )}
                                {channelType === 'DINGTALK' && (
                                    <>
                                        <div className="group-row" style={{ gap: '10px' }}>
                                            <span className="group-label">App Key</span>
                                            <input type="text" value={channelEditing ? dtAppKey : (dtAppKey ? dtAppKey.slice(0, 8) + '***' : '')} onChange={e => setDtAppKey(e.target.value)} placeholder="dingXXXX" className="field-input" style={{ flex: 1 }} disabled={!channelEditing} />
                                        </div>
                                        <div className="group-row" style={{ gap: '10px' }}>
                                            <span className="group-label">App Secret</span>
                                            <input type={channelEditing ? 'password' : 'text'} value={channelEditing ? dtAppSecret : (dtAppSecret ? '已配置' : '')} onChange={e => setDtAppSecret(e.target.value)} placeholder="••••••••" className="field-input" style={{ flex: 1 }} disabled={!channelEditing} />
                                        </div>
                                        <div className="group-row" style={{ gap: '10px' }}>
                                            <span className="group-label">Webhook URL</span>
                                            <input type="text" value={dtWebhook} onChange={e => setDtWebhook(e.target.value)} placeholder="https://oapi.dingtalk.com/..." className="field-input" style={{ flex: 1 }} disabled={!channelEditing} />
                                        </div>
                                    </>
                                )}
                                {channelType === 'SLACK' && (
                                    <>
                                        <div className="group-row" style={{ gap: '10px' }}>
                                            <span className="group-label">Bot Token</span>
                                            <input type={channelEditing ? 'password' : 'text'} value={channelEditing ? slackBotToken : (slackBotToken ? '已配置' : '')} onChange={e => setSlackBotToken(e.target.value)} placeholder="xoxb-..." className="field-input" style={{ flex: 1 }} disabled={!channelEditing} />
                                        </div>
                                        <div className="group-row" style={{ gap: '10px' }}>
                                            <span className="group-label">Signing Secret</span>
                                            <input type={channelEditing ? 'password' : 'text'} value={channelEditing ? slackSigningSecret : (slackSigningSecret ? '已配置' : '')} onChange={e => setSlackSigningSecret(e.target.value)} placeholder="••••••••" className="field-input" style={{ flex: 1 }} disabled={!channelEditing} />
                                        </div>
                                    </>
                                )}
                                {channelEditing && (
                                    <div style={{ display: 'flex', gap: '6px', padding: '6px 12px 8px' }}>
                                        <button className="tbtn tbtn-accent" onClick={handleSaveChannel} disabled={savingChannel}>保存配置</button>
                                        {channelType === 'FEISHU' && (
                                            <button className="tbtn tbtn-ghost" onClick={handleTestConnection} disabled={testing}>{testing ? '测试中...' : '测试连接'}</button>
                                        )}
                                    </div>
                                )}
                            </div>
                        </section>

                        {/* 飞书群组列表 */}
                        <section>
                            <div className="flex-between" style={{ marginBottom: '6px' }}>
                                <span className="section-label" style={{ padding: 0 }}>{t('bindings.groups_section')}</span>
                                <button className="tbtn tbtn-accent" style={{ fontSize: '11px' }} onClick={handleAddBinding}>+ {t('bindings.add_group')}</button>
                            </div>
                            <div className="group">
                                {bindings.length === 0 && !isNewBinding ? (
                                    <div style={{ padding: '12px', textAlign: 'center', fontSize: '12px', color: '#8E8E93' }}>{t('bindings.no_bindings')}</div>
                                ) : (
                                    <>
                                        {bindings.map(binding => (
                                            <div
                                                key={binding.id}
                                                className="list-row"
                                                onClick={() => handleSelectBinding(binding)}
                                                style={{
                                                    cursor: 'pointer',
                                                    background: selectedBinding?.id === binding.id ? 'rgba(139,92,246,0.15)' : undefined,
                                                }}
                                            >
                                                <div style={{ width: '28px', height: '28px', borderRadius: '7px', background: 'rgba(139,92,246,0.2)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                                                    <svg fill="none" stroke="currentColor" strokeWidth="1.75" viewBox="0 0 24 24" width="14" height="14" style={{ color: '#a78bfa' }}><path strokeLinecap="round" strokeLinejoin="round" d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0z" /></svg>
                                                </div>
                                                <div style={{ flex: 1, minWidth: 0 }}>
                                                    <div className="text-xs text-medium">{binding.channel_name || '（未命名群组）'}</div>
                                                    <div className="text-xs text-dimmer">
                                                        {binding.is_enabled ? t('bindings.status_bound') : t('bindings.status_disabled')} · {binding.agent_name || t('bindings.no_agent')}
                                                    </div>
                                                </div>
                                                <svg fill="none" stroke="currentColor" strokeWidth="1.75" viewBox="0 0 24 24" width="14" height="14" style={{ color: selectedBinding?.id === binding.id ? '#8b5cf6' : 'rgba(255,255,255,0.3)', flexShrink: 0 }}><path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" /></svg>
                                            </div>
                                        ))}
                                        {isNewBinding && selectedBinding && (
                                            <div
                                                className="list-row"
                                                style={{ background: 'rgba(139,92,246,0.15)', cursor: 'default' }}
                                            >
                                                <div style={{ width: '28px', height: '28px', borderRadius: '7px', background: 'rgba(139,92,246,0.2)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                                                    <svg fill="none" stroke="currentColor" strokeWidth="1.75" viewBox="0 0 24 24" width="14" height="14" style={{ color: '#a78bfa' }}><path strokeLinecap="round" strokeLinejoin="round" d="M12 6v6m0 0v6m0-6h6m-6 0H6" /></svg>
                                                </div>
                                                <div style={{ flex: 1, minWidth: 0 }}>
                                                    <div className="text-xs text-medium">{bindingForm.channel_name || t('bindings.new_group')}</div>
                                                    <div className="text-xs text-dimmer">{t('bindings.unsaved')}</div>
                                                </div>
                                            </div>
                                        )}
                                    </>
                                )}
                            </div>
                        </section>
                    </div>
                )}
            </main>

            {/* COL4 - Channel detail panel */}
            {selectedBinding && (
                <aside style={{ width: '480px', flexShrink: 0, display: 'flex', flexDirection: 'column', borderLeft: '1px solid rgba(255,255,255,0.08)', background: '#141416' }}>
                    <div className="toolbar" style={{ justifyContent: 'space-between' }}>
                        <span style={{ fontSize: '14px', fontWeight: 600, color: '#FFFFFF', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                            {bindingForm.channel_name || t('bindings.group_config')}
                            {isNewBinding && <span style={{ fontSize: '11px', color: '#a78bfa', marginLeft: '6px', fontWeight: 400 }}>{t('bindings.unsaved')}</span>}
                        </span>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '6px', flexShrink: 0 }}>
                            {bindingEditing ? (
                                <>
                                    <button className="tbtn tbtn-ghost" onClick={handleCancelBinding}>{t('common.button_cancel')}</button>
                                    <button className="tbtn tbtn-accent" onClick={handleSaveBinding} disabled={savingBinding}>{savingBinding ? t('common.saving') : t('common.button_save')}</button>
                                </>
                            ) : (
                                <>
                                    <button className="tbtn tbtn-ghost" onClick={() => setBindingEditing(true)}>{t('common.button_edit')}</button>
                                    <button className="tbtn tbtn-ghost" style={{ color: '#f43f5e' }} onClick={() => handleDeleteBinding(selectedBinding.id)}>{t('common.button_delete')}</button>
                                </>
                            )}
                            <button
                                onClick={() => { setSelectedBinding(null); setIsNewBinding(false) }}
                                style={{ background: 'none', border: 'none', color: '#8E8E93', cursor: 'pointer', fontSize: '18px', lineHeight: 1, marginLeft: '2px' }}
                            >×</button>
                        </div>
                    </div>
                    <div style={{ flex: 1, overflowY: 'auto', padding: '14px 16px', display: 'flex', flexDirection: 'column', gap: '14px' }}>

                        {/* 群组信息 */}
                        <section>
                            <span className="section-label" style={{ padding: '0 0 8px', display: 'block' }}>{t('bindings.group_info')}</span>
                            <div className="group">
                                <div className="group-row" style={{ gap: '10px' }}>
                                    <span className="group-label">群组名称</span>
                                    <input
                                        type="text"
                                        value={bindingForm.channel_name ?? ''}
                                        onChange={e => handleBindingFormChange('channel_name', e.target.value)}
                                        className="field-input"
                                        style={{ flex: 1 }}
                                        disabled={!bindingEditing}
                                    />
                                </div>
                                <div className="group-row" style={{ gap: '10px' }}>
                                    <span className="group-label">群组 ID</span>
                                    <input
                                        type="text"
                                        value={bindingForm.channel_id ?? ''}
                                        onChange={e => handleBindingFormChange('channel_id', e.target.value)}
                                        placeholder="oc_xxx..."
                                        className="field-input"
                                        style={{ flex: 1, fontFamily: "'SF Mono','Menlo',monospace", fontSize: '11px' }}
                                        disabled={!bindingEditing}
                                    />
                                </div>
                                <div className="group-row" style={{ gap: '10px' }}>
                                    <span className="group-label">类型</span>
                                    <select
                                        className="field-input"
                                        style={{ flex: 1 }}
                                        value={bindingForm.channel_type ?? 'GROUP'}
                                        onChange={e => handleBindingFormChange('channel_type', e.target.value)}
                                        disabled={!bindingEditing}
                                    >
                                        <option value="GROUP">群组</option>
                                        <option value="DM">私聊</option>
                                    </select>
                                </div>
                            </div>
                        </section>

                        {/* 绑定配置 */}
                        <section>
                            <span className="section-label" style={{ padding: '0 0 8px', display: 'block' }}>{t('bindings.binding_config')}</span>
                            <div className="group">
                                <div className="group-row" style={{ gap: '10px' }}>
                                    <span className="group-label">关联智能体</span>
                                    <select
                                        className="field-input"
                                        style={{ flex: 1 }}
                                        value={bindingForm.agent_id ?? ''}
                                        onChange={e => handleBindingFormChange('agent_id', e.target.value)}
                                        disabled={!bindingEditing}
                                    >
                                        <option value="">— 未选择 —</option>
                                        {agents.map(a => (
                                            <option key={a.id} value={a.id}>{a.display_name}</option>
                                        ))}
                                    </select>
                                </div>
                                <div className="group-row" style={{ gap: '10px' }}>
                                    <span className="group-label">触发模式</span>
                                    <select
                                        className="field-input"
                                        style={{ flex: 1 }}
                                        value={bindingForm.trigger_mode ?? 'MENTION'}
                                        onChange={e => handleBindingFormChange('trigger_mode', e.target.value)}
                                        disabled={!bindingEditing}
                                    >
                                        <option value="MENTION">@机器人触发</option>
                                        <option value="ALL">所有消息</option>
                                    </select>
                                </div>
                                <div className="group-row">
                                    <span className="group-label">{t('bindings.enable_status')}</span>
                                    <label style={{ display: 'flex', alignItems: 'center', gap: '8px', cursor: bindingEditing ? 'pointer' : 'default', flex: 1 }}>
                                        <button
                                            onClick={() => bindingEditing && handleBindingFormChange('is_enabled', !bindingForm.is_enabled)}
                                            disabled={!bindingEditing}
                                            style={{
                                                width: '32px', height: '18px', borderRadius: '9px', border: 'none', cursor: bindingEditing ? 'pointer' : 'default',
                                                background: bindingForm.is_enabled ? '#8b5cf6' : '#3A3A3C',
                                                position: 'relative', transition: 'background 0.15s',
                                                flexShrink: 0, opacity: bindingEditing ? 1 : 0.7,
                                            }}
                                        >
                                            <span style={{
                                                position: 'absolute', top: '2px',
                                                left: bindingForm.is_enabled ? '16px' : '2px',
                                                width: '14px', height: '14px', borderRadius: '50%',
                                                background: '#fff', transition: 'left 0.15s',
                                            }}></span>
                                        </button>
                                        <span style={{ fontSize: '12px', color: '#EBEBF5' }}>{bindingForm.is_enabled ? t('common.enabled') : t('common.disabled')}</span>
                                    </label>
                                </div>
                            </div>
                        </section>

                    </div>
                </aside>
            )}
        </>
    )
}
