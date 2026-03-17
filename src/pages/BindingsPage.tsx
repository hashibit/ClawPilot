import { useEffect, useState } from 'react'
import { useOpc } from '../contexts/OpcContext'
import {
  getChannels, upsertChannel, testFeishuConnection,
  getBindings, createBinding, deleteBinding, toggleBinding,
} from '../lib/api'
import { toast } from '../components/Toast'
import type { ChannelConfig, BindingRule } from '../lib/types'

export default function BindingsPage() {
  const { opcs, currentOpc, selectOpc } = useOpc()

  const [channel, setChannel] = useState<ChannelConfig | null>(null)
  const [appId, setAppId] = useState('')
  const [appSecret, setAppSecret] = useState('')
  const [channelEditing, setChannelEditing] = useState(false)
  const [testing, setTesting] = useState(false)
  const [savingChannel, setSavingChannel] = useState(false)

  const [bindings, setBindings] = useState<BindingRule[]>([])

  // Load channel + bindings when current OPC changes
  useEffect(() => {
    if (!currentOpc) return
    loadData()
  }, [currentOpc?.id])

  const loadData = async () => {
    if (!currentOpc) return
    try {
      const [channels, bindingList] = await Promise.all([
        getChannels(currentOpc.id),
        getBindings(currentOpc.id),
      ])
      const feishu = channels.find(c => c.channel_type === 'FEISHU') ?? null
      setChannel(feishu)
      setAppId(feishu?.feishu_config?.app_id ?? '')
      setAppSecret(feishu?.feishu_config?.app_secret ?? '')
      setChannelEditing(false)
      setBindings(bindingList)
    } catch (e) {
      toast(String(e), 'error')
    }
  }

  const handleSaveChannel = async () => {
    if (!currentOpc) return
    setSavingChannel(true)
    const now = Math.floor(Date.now() / 1000)
    const config: ChannelConfig = channel
      ? {
          ...channel,
          feishu_config: { app_id: appId, app_secret: appSecret },
          updated_at: now,
        }
      : {
          id: crypto.randomUUID(),
          opc_id: currentOpc.id,
          channel_type: 'FEISHU',
          is_enabled: true,
          feishu_config: { app_id: appId, app_secret: appSecret },
          is_connected: false,
          created_at: now,
          updated_at: now,
        }
    try {
      await upsertChannel(config)
      await loadData()
      toast('飞书配置已保存', 'success')
    } catch (e) {
      toast(String(e), 'error')
    } finally {
      setSavingChannel(false)
    }
  }

  const handleTestConnection = async () => {
    if (!appId || !appSecret) {
      toast('请先填写 App ID 和 App Secret', 'error')
      return
    }
    setTesting(true)
    try {
      const ok = await testFeishuConnection(appId, appSecret)
      toast(ok ? '飞书连接成功' : '飞书连接失败', ok ? 'success' : 'error')
    } catch (e) {
      toast(String(e), 'error')
    } finally {
      setTesting(false)
    }
  }

  const handleAddBinding = async () => {
    if (!currentOpc) return
    const now = Math.floor(Date.now() / 1000)
    const newBinding: BindingRule = {
      id: crypto.randomUUID(),
      opc_id: currentOpc.id,
      channel_id: '',
      channel_name: '新群组',
      channel_type: 'GROUP',
      agent_id: '',
      agent_name: '',
      trigger_mode: 'MENTION',
      is_enabled: true,
      created_at: now,
      updated_at: now,
    }
    try {
      await createBinding(newBinding)
      await loadData()
      toast('绑定已添加', 'success')
    } catch (e) {
      toast(String(e), 'error')
    }
  }

  const handleDeleteBinding = async (id: string) => {
    try {
      await deleteBinding(id)
      setBindings(prev => prev.filter(b => b.id !== id))
      toast('已删除', 'success')
    } catch (e) {
      toast(String(e), 'error')
    }
  }

  const handleToggleBinding = async (binding: BindingRule) => {
    try {
      await toggleBinding(binding.id, !binding.is_enabled)
      setBindings(prev => prev.map(b => b.id === binding.id ? { ...b, is_enabled: !b.is_enabled } : b))
    } catch (e) {
      toast(String(e), 'error')
    }
  }

  return (
    <>
      {/* COL2 - list-pane */}
      <div className="list-pane">
        <div className="toolbar" style={{ justifyContent: 'space-between' }}>
          <span style={{ fontSize: '15px', fontWeight: 600, color: '#FFFFFF' }}>我的公司</span>
        </div>
        <div style={{ flex: 1, overflowY: 'auto' }}>
          {(() => {
            const running = opcs.filter(o => o.is_running)
            const stopped = opcs.filter(o => !o.is_running)
            return (
              <>
                {running.length > 0 && (
                  <>
                    <div className="section-label" style={{ padding: '8px 12px 3px' }}>运行中</div>
                    {running.map(opc => (
                      <div
                        key={opc.id}
                        className={`list-row${currentOpc?.id === opc.id ? ' selected' : ''}`}
                        onClick={() => selectOpc(opc)}
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
                          <div className="text-xs text-dim">{opc.agent_count} 智能体 · {opc.channel_count} 群聊</div>
                        </div>
                        <svg fill="none" stroke="currentColor" strokeWidth="1.75" viewBox="0 0 24 24" width="14" height="14" style={{ color: currentOpc?.id === opc.id ? '#8b5cf6' : 'rgba(255,255,255,0.3)' }}><path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7"/></svg>
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
                        className={`list-row${currentOpc?.id === opc.id ? ' selected' : ''}`}
                        onClick={() => selectOpc(opc)}
                        style={{ cursor: 'pointer' }}
                      >
                        <div className="avatar avatar-lg" style={{ background: `linear-gradient(135deg,${opc.avatar_color ?? '#636366'},#48484A)` }}>
                          {opc.avatar_initials ?? opc.display_name.slice(0, 1)}
                        </div>
                        <div style={{ flex: 1, minWidth: 0 }}>
                          <div className="flex-center gap-5">
                            <span className="text-sm text-medium text-dim">{opc.display_name}</span>
                            <span style={{ width: '6px', height: '6px', borderRadius: '50%', background: '#48484A' }}></span>
                          </div>
                          <div className="text-xs text-dim">{opc.agent_count} 智能体 · {opc.channel_count} 群聊</div>
                        </div>
                        <svg fill="none" stroke="currentColor" strokeWidth="1.75" viewBox="0 0 24 24" width="14" height="14" style={{ color: 'rgba(255,255,255,0.3)' }}><path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7"/></svg>
                      </div>
                    ))}
                  </>
                )}
              </>
            )
          })()}
        </div>
      </div>

      {/* COL3 - detail-pane */}
      <main className="detail-pane">
        <div className="toolbar" style={{ justifyContent: 'space-between' }}>
          <span style={{ fontSize: '15px', fontWeight: 600, color: '#FFFFFF' }}>{currentOpc?.display_name ?? '—'}</span>
        </div>
        {!currentOpc ? (
          <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#636366', fontSize: '13px' }}>
            请选择一个公司
          </div>
        ) : (
          <div style={{ flex: 1, overflowY: 'auto', padding: '14px 16px', display: 'flex', flexDirection: 'column', gap: '14px' }}>
            {/* 飞书机器人配置 */}
            <section>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '8px' }}>
                <span className="section-label" style={{ padding: 0, display: 'block' }}>飞书机器人</span>
                <button
                  className="tbtn tbtn-ghost"
                  style={{ fontSize: '12px' }}
                  onClick={() => setChannelEditing(e => !e)}
                >
                  {channelEditing ? '取消' : '配置'}
                </button>
              </div>
              <div className="group">
                <div className="group-row">
                  <span className="group-label">连接状态</span>
                  <span className="group-value" style={{ color: channel?.is_connected ? '#34c759' : '#636366', display: 'flex', alignItems: 'center', gap: '4px' }}>
                    {channel?.is_connected && (
                      <span className="pulse-dot" style={{ width: '6px', height: '6px', borderRadius: '50%', background: '#34c759' }}></span>
                    )}
                    {channel?.is_connected ? '已连接' : '未连接'}
                  </span>
                </div>
                {channelEditing ? (
                  <>
                    <div className="group-row" style={{ gap: '10px' }}>
                      <span className="group-label">App ID</span>
                      <input
                        type="text"
                        value={appId}
                        onChange={e => setAppId(e.target.value)}
                        placeholder="cli_..."
                        className="field-input"
                        style={{ flex: 1 }}
                      />
                    </div>
                    <div className="group-row" style={{ gap: '10px' }}>
                      <span className="group-label">App Secret</span>
                      <input
                        type="password"
                        value={appSecret}
                        onChange={e => setAppSecret(e.target.value)}
                        placeholder="••••••••"
                        className="field-input"
                        style={{ flex: 1 }}
                      />
                    </div>
                    <div style={{ display: 'flex', gap: '6px', padding: '6px 12px 8px' }}>
                      <button
                        className="tbtn tbtn-accent"
                        onClick={handleSaveChannel}
                        disabled={savingChannel}
                      >
                        保存配置
                      </button>
                      <button
                        className="tbtn tbtn-ghost"
                        onClick={handleTestConnection}
                        disabled={testing}
                      >
                        {testing ? '测试中...' : '测试连接'}
                      </button>
                    </div>
                  </>
                ) : (
                  <>
                    <div className="group-row">
                      <span className="group-label">App ID</span>
                      <span className="group-value">
                        {appId ? appId.slice(0, 8) + '***' : '未设置'}
                      </span>
                    </div>
                    <div className="group-row">
                      <span className="group-label">App Secret</span>
                      <span className="group-value text-dimmer">{appSecret ? '••••••••••••••••' : '未设置'}</span>
                    </div>
                  </>
                )}
              </div>
            </section>

            {/* 群组绑定 */}
            <section>
              <div className="flex-between" style={{ marginBottom: '6px' }}>
                <span className="section-label" style={{ padding: 0 }}>群组绑定</span>
                <button className="tbtn tbtn-accent" style={{ fontSize: '11px' }} onClick={handleAddBinding}>
                  + 添加绑定
                </button>
              </div>
              <div className="group">
                {bindings.length === 0 ? (
                  <div style={{ padding: '12px', textAlign: 'center', fontSize: '12px', color: '#636366' }}>暂无绑定规则</div>
                ) : (
                  bindings.map(binding => (
                    <div key={binding.id} className="list-row">
                      <div style={{ width: '28px', height: '28px', borderRadius: '7px', background: 'rgba(139,92,246,0.2)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                        <svg fill="none" stroke="currentColor" strokeWidth="1.75" viewBox="0 0 24 24" width="14" height="14" style={{ color: '#a78bfa' }}><path strokeLinecap="round" strokeLinejoin="round" d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0z"/></svg>
                      </div>
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div className="text-xs text-medium">{binding.channel_name || '（未命名群组）'}</div>
                        <div className="text-xs text-dimmer">
                          {binding.is_enabled ? '已启用' : '已禁用'} · {binding.agent_name || '未绑定智能体'} · {binding.trigger_mode === 'MENTION' ? '@提及' : '全部消息'}
                        </div>
                      </div>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                        {/* Toggle */}
                        <button
                          onClick={() => handleToggleBinding(binding)}
                          style={{
                            width: '32px', height: '18px', borderRadius: '9px', border: 'none', cursor: 'pointer',
                            background: binding.is_enabled ? '#8b5cf6' : '#3A3A3C',
                            position: 'relative', transition: 'background 0.15s',
                          }}
                        >
                          <span style={{
                            position: 'absolute', top: '2px',
                            left: binding.is_enabled ? '16px' : '2px',
                            width: '14px', height: '14px', borderRadius: '50%',
                            background: '#fff', transition: 'left 0.15s',
                          }}></span>
                        </button>
                        <button
                          className="tbtn tbtn-ghost"
                          style={{ padding: '2px 6px', fontSize: '11px', color: '#f43f5e' }}
                          onClick={() => handleDeleteBinding(binding.id)}
                        >
                          删除
                        </button>
                      </div>
                    </div>
                  ))
                )}
              </div>
            </section>
          </div>
        )}
      </main>
    </>
  )
}
