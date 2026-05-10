import { useEffect, useState, useRef, useCallback } from 'react'
import { useTranslation } from 'react-i18next'
import { subscribeToActivities, type ActivityEvent, getActivityStreamStatus } from '../lib/activityStream'
import { useOpc } from '../contexts/OpcContext'
import { getAgents } from '../lib/api'
import { Icon } from '../components/Icon'

interface AgentActivity {
  agent_id: string
  opc_id: string
  status: 'idle' | 'busy' | 'error'
  events: ActivityEvent[]
  last_update: number
}

const MAX_EVENTS_PER_AGENT = 50

function getInitials(id: string): string { return id.slice(0, 2).toUpperCase() }

function hashColor(s: string): string {
  const palette = ['#6366f1', '#8b5cf6', '#ec4899', '#f97316', '#10b981', '#3b82f6', '#f59e0b', '#14b8a6']
  let h = 0
  for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) & 0xffff
  return palette[h % palette.length]
}

function timeAgo(ts: number): string {
  const diff = Math.floor(Date.now() / 1000 - ts)
  if (diff < 5) return '刚刚'
  if (diff < 60) return `${diff}秒前`
  if (diff < 3600) return `${Math.floor(diff / 60)}分钟前`
  return `${Math.floor(diff / 3600)}小时前`
}

const STREAM_LABELS: Record<string, { label: string; color: string }> = {
  lifecycle: { label: '生命周期', color: 'var(--accent)' },
  assistant: { label: '助手回复', color: '#8b5cf6' },
  tool: { label: '工具调用', color: '#f59e0b' },
  error: { label: '错误', color: 'var(--error)' },
}

export default function ActivitiesPage() {
  const { t } = useTranslation()
  const { opcs } = useOpc()
  const [activities, setActivities] = useState<Map<string, AgentActivity>>(new Map())
  const [connectionStatus, setConnectionStatus] = useState<'connected' | 'connecting' | 'disconnected'>('disconnected')
  const [agentToOpc, setAgentToOpc] = useState<Map<string, string>>(new Map())
  const scrollRef = useRef<HTMLDivElement>(null)

  const runningOpcs = opcs.filter(opc => opc.is_running)

  useEffect(() => {
    const buildMapping = async () => {
      const mapping = new Map<string, string>()
      for (const opc of runningOpcs) {
        try {
          const agents = await getAgents(opc.id)
          for (const agent of agents) mapping.set(agent.id, opc.id)
        } catch {}
      }
      setAgentToOpc(mapping)
    }
    buildMapping()
  }, [runningOpcs])

  const handleEvent = useCallback((event: ActivityEvent) => {
    setActivities(prev => {
      const next = new Map(prev)
      const existing = next.get(event.agent_id) || {
        agent_id: event.agent_id, opc_id: agentToOpc.get(event.agent_id) || '',
        status: 'idle' as const, events: [], last_update: 0,
      }
      let newStatus = existing.status
      if (event.stream === 'lifecycle') {
        const s = (event.data as any)?.status
        if (s === 'start') newStatus = 'busy'
        else if (s === 'end') newStatus = 'idle'
        else if (s === 'error') newStatus = 'error'
      } else if (event.stream === 'error') newStatus = 'error'
      next.set(event.agent_id, { ...existing, status: newStatus, events: [event, ...existing.events].slice(0, MAX_EVENTS_PER_AGENT), last_update: event.ts })
      return next
    })
  }, [agentToOpc])

  useEffect(() => {
    const unsubscribe = subscribeToActivities(handleEvent)
    const id = setInterval(() => setConnectionStatus(getActivityStreamStatus()), 1000)
    return () => { unsubscribe(); clearInterval(id) }
  }, [handleEvent])

  const allEvents = Array.from(activities.values())
    .flatMap(a => a.events.map(e => ({ ...e, _agent: a })))
    .sort((a, b) => b.ts - a.ts)
    .slice(0, 200)

  const busyAgents = Array.from(activities.values()).filter(a => a.status === 'busy')
  const totalAgents = activities.size
  const totalEvents = Array.from(activities.values()).reduce((s, a) => s + a.events.length, 0)

  const formatEventData = (event: ActivityEvent): string => {
    const data = event.data as any
    switch (event.stream) {
      case 'lifecycle': return `[${data.status}]`
      case 'assistant': return data.delta || data.text || ''
      case 'tool': return `[${data.name || 'tool'}] ${data.status || ''}`
      case 'error': return data.message || data.error || 'Error'
      default: return JSON.stringify(data).slice(0, 100)
    }
  }

  const connDot = connectionStatus === 'connected' ? 'var(--success)' : connectionStatus === 'connecting' ? 'var(--warning)' : 'var(--text-muted)'
  const connText = connectionStatus === 'connected' ? '已连接' : connectionStatus === 'connecting' ? '连接中…' : '未连接'

  return (
    <div style={{ padding: '24px 32px 48px', display: 'flex', flexDirection: 'column', gap: 20, flex: 1, minWidth: 0, minHeight: 0, overflowY: 'auto' }} ref={scrollRef}>

      {/* Header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
        <div>
          <h1 className="page-title">实时活动</h1>
          <p className="page-sub">所有 Agent 的消息、工具调用与生命周期事件</p>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          <span style={{ width: 7, height: 7, borderRadius: '50%', background: connDot, boxShadow: connectionStatus === 'connected' ? `0 0 6px ${connDot}` : 'none' }} />
          <span style={{ fontSize: 12, color: 'var(--text-tertiary)' }}>{connText}</span>
        </div>
      </div>

      {/* Stats row */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))', gap: 12 }}>
        {[
          { label: '活跃 Agent', value: busyAgents.length, icon: 'users' as const, accent: busyAgents.length > 0 },
          { label: '已观测 Agent', value: totalAgents, icon: 'activity' as const },
          { label: '事件总数', value: totalEvents, icon: 'bolt' as const },
          { label: '运行中公司', value: runningOpcs.length, icon: 'building' as const },
        ].map((s, i) => (
          <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '14px 16px', background: 'var(--bg-surface)', border: '1px solid var(--border-subtle)', borderRadius: 'var(--radius-md)' }}>
            <div style={{ width: 32, height: 32, borderRadius: 8, background: 'var(--bg-elevated)', display: 'grid', placeItems: 'center', flexShrink: 0 }}>
              <Icon name={s.icon} size={15} />
            </div>
            <div>
              <div style={{ fontSize: 18, fontWeight: 700, color: s.accent ? 'var(--accent)' : 'var(--text-primary)', lineHeight: 1.2 }}>{s.value}</div>
              <div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 2 }}>{s.label}</div>
            </div>
          </div>
        ))}
      </div>

      {/* Running OPCs + Active Agents inline */}
      {(runningOpcs.length > 0 || totalAgents > 0) && (
        <div style={{ display: 'grid', gridTemplateColumns: runningOpcs.length > 0 && totalAgents > 0 ? '1fr 1fr' : '1fr', gap: 16 }}>
          {/* Running OPCs */}
          {runningOpcs.length > 0 && (
            <div className="section-card">
              <div className="section-card-head" style={{ padding: '10px 16px' }}>
                <h3 className="section-card-title" style={{ fontSize: 13 }}>运行中公司</h3>
                <span style={{ fontSize: 11, color: 'var(--text-muted)' }}>{runningOpcs.length}</span>
              </div>
              <div style={{ padding: '6px 10px 10px' }}>
                {runningOpcs.map(opc => (
                  <div key={opc.id} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '7px 6px', borderRadius: 'var(--radius-md)' }}>
                    <div style={{ width: 26, height: 26, borderRadius: 7, background: opc.avatar_color || '#6366f1', display: 'grid', placeItems: 'center', fontSize: 9, fontWeight: 700, color: 'white', flexShrink: 0 }}>
                      {opc.avatar_initials || opc.name.slice(0, 2).toUpperCase()}
                    </div>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ fontSize: 12.5, fontWeight: 500, color: 'var(--text-primary)' }}>{opc.display_name || opc.name}</div>
                      <div style={{ fontSize: 10.5, color: 'var(--text-muted)' }}>{opc.agent_count} Agent</div>
                    </div>
                    <span style={{ width: 6, height: 6, borderRadius: '50%', background: 'var(--success)', flexShrink: 0 }} />
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Active agents */}
          {totalAgents > 0 && (
            <div className="section-card">
              <div className="section-card-head" style={{ padding: '10px 16px' }}>
                <h3 className="section-card-title" style={{ fontSize: 13 }}>活跃 Agent</h3>
                {busyAgents.length > 0 && <span className="tag success" style={{ fontSize: 10 }}>{busyAgents.length} 在线</span>}
              </div>
              <div style={{ padding: '6px 10px 10px' }}>
                {Array.from(activities.values()).sort((a, b) => b.last_update - a.last_update).map(agent => (
                  <div key={agent.agent_id} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '7px 6px', borderRadius: 'var(--radius-md)' }}>
                    <div style={{ width: 26, height: 26, borderRadius: 7, background: hashColor(agent.agent_id), display: 'grid', placeItems: 'center', fontSize: 9, fontWeight: 700, color: 'white', flexShrink: 0 }}>
                      {getInitials(agent.agent_id)}
                    </div>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ fontSize: 12, fontWeight: 500, color: 'var(--text-primary)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{agent.agent_id}</div>
                      <div style={{ fontSize: 10.5, color: 'var(--text-muted)' }}>{agent.events.length} 事件 · {timeAgo(agent.last_update)}</div>
                    </div>
                    <span style={{ width: 7, height: 7, borderRadius: '50%', flexShrink: 0, background: agent.status === 'busy' ? 'var(--success)' : agent.status === 'error' ? 'var(--error)' : 'var(--border-default)', boxShadow: agent.status === 'busy' ? '0 0 6px var(--success)' : 'none' }} />
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      )}

      {/* Event stream */}
      <div className="section-card" style={{ overflow: 'hidden' }}>
        <div className="section-card-head" style={{ padding: '12px 16px' }}>
          <h3 className="section-card-title" style={{ fontSize: 13 }}>事件流</h3>
          <span style={{ fontSize: 11, color: 'var(--text-muted)' }}>
            {allEvents.length > 0 ? `${allEvents.length} 条` : ''}
          </span>
        </div>

        {runningOpcs.length === 0 ? (
          <div style={{ padding: '48px 24px', textAlign: 'center' }}>
            <Icon name="building" size={32} style={{ color: 'var(--text-muted)', marginBottom: 10 }} />
            <div style={{ fontSize: 13, fontWeight: 500, color: 'var(--text-secondary)', marginBottom: 4 }}>尚无运行中的公司</div>
            <div style={{ fontSize: 12, color: 'var(--text-muted)' }}>先部署一个公司到办公室，再来查看实时活动</div>
          </div>
        ) : allEvents.length === 0 ? (
          <div style={{ padding: '48px 24px', textAlign: 'center' }}>
            <Icon name="activity" size={32} style={{ color: 'var(--text-muted)', marginBottom: 10 }} />
            <div style={{ fontSize: 13, fontWeight: 500, color: 'var(--text-secondary)', marginBottom: 4 }}>等待事件流入</div>
            <div style={{ fontSize: 12, color: 'var(--text-muted)' }}>Agent 开始工作后，消息和工具调用将实时显示在此处</div>
            <div style={{ marginTop: 14, display: 'flex', justifyContent: 'center', gap: 5 }}>
              <span style={{ width: 4, height: 4, borderRadius: '50%', background: 'var(--accent)', animation: 'pulse-dot 1.5s infinite' }} />
              <span style={{ width: 4, height: 4, borderRadius: '50%', background: 'var(--accent)', animation: 'pulse-dot 1.5s infinite 0.3s' }} />
              <span style={{ width: 4, height: 4, borderRadius: '50%', background: 'var(--accent)', animation: 'pulse-dot 1.5s infinite 0.6s' }} />
            </div>
          </div>
        ) : (
          <div>
            {allEvents.map((event, idx) => {
              const color = hashColor(event.agent_id)
              const initials = getInitials(event.agent_id)
              const text = formatEventData(event)
              const streamInfo = STREAM_LABELS[event.stream] || { label: event.stream, color: 'var(--text-dimmer)' }
              return (
                <div key={`${event.ts}-${idx}`} style={{ display: 'flex', gap: 12, padding: '10px 16px', borderBottom: '1px solid var(--border-subtle)' }}>
                  <div style={{ width: 28, height: 28, borderRadius: 7, background: color, display: 'grid', placeItems: 'center', fontSize: 10, fontWeight: 700, color: 'white', flexShrink: 0 }}>
                    {initials}
                  </div>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap', fontSize: 12, color: 'var(--text-tertiary)' }}>
                      <span style={{ color: 'var(--text-primary)', fontWeight: 500 }}>{event.agent_id}</span>
                      <span style={{ fontSize: 10, padding: '1px 6px', borderRadius: 4, background: `color-mix(in srgb, ${streamInfo.color} 15%, transparent)`, color: streamInfo.color }}>{streamInfo.label}</span>
                      <span style={{ marginLeft: 'auto', fontSize: 11, color: 'var(--text-muted)' }}>{timeAgo(event.ts)}</span>
                    </div>
                    {text && <div style={{ fontSize: 12, color: 'var(--text-tertiary)', marginTop: 3 }}>{text}</div>}
                  </div>
                </div>
              )
            })}
          </div>
        )}
      </div>
    </div>
  )
}
