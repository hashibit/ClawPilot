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

function timeAgo(ts: number, t: (key: string, fallback: string, opts?: object) => string): string {
  const diff = Math.floor(Date.now() / 1000 - ts)
  if (diff < 5) return t('activities.time_just_now', '刚刚')
  if (diff < 60) return t('activities.time_seconds_ago', `${diff}秒前`, { count: diff })
  if (diff < 3600) return t('activities.time_minutes_ago', `${Math.floor(diff / 60)}分钟前`, { count: Math.floor(diff / 60) })
  return t('activities.time_hours_ago', `${Math.floor(diff / 3600)}小时前`, { count: Math.floor(diff / 3600) })
}

export default function ActivitiesPage() {
  const { t } = useTranslation()

  const streamLabels: Record<string, { label: string; color: string }> = {
    lifecycle: { label: t('activities.lifecycle', '生命周期'), color: 'var(--accent)' },
    assistant: { label: t('activities.assistant_reply', '助手回复'), color: '#8b5cf6' },
    tool: { label: t('activities.tool_call', '工具调用'), color: '#f59e0b' },
    error: { label: t('activities.error', '错误'), color: 'var(--error)' },
  }
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
  const connDotClass = connectionStatus === 'connected' ? 'success' : connectionStatus === 'connecting' ? 'warn' : 'dim'
  const connText = connectionStatus === 'connected'
    ? t('activities.connected', '已连接')
    : connectionStatus === 'connecting'
      ? t('activities.connecting', '连接中…')
      : t('activities.disconnected', '未连接')

  return (
    <div className="page-scroll" ref={scrollRef}>

      {/* Header */}
      <div className="flex-between">
        <div>
          <h1 className="page-title">{t('activities.title', '实时活动')}</h1>
          <p className="page-sub">{t('activities.subtitle', 'Agent 消息、工具调用与生命周期事件')}</p>
        </div>
        <div className="flex-center gap-6">
          <span
            className={`dot-md ${connDotClass}`}
            style={connectionStatus === 'connected' ? { boxShadow: `0 0 6px ${connDot}` } : undefined}
          />
          <span className="text-xs muted">{connText}</span>
        </div>
      </div>

      {/* Stats row */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))', gap: 12 }}>
        {[
          { label: t('activities.busy_agents', '活跃 Agent'), value: busyAgents.length, icon: 'users' as const, accent: busyAgents.length > 0 },
          { label: t('activities.observed_agents', '已观测 Agent'), value: totalAgents, icon: 'activity' as const },
          { label: t('activities.total_events', '事件总数'), value: totalEvents, icon: 'bolt' as const },
          { label: t('activities.running_companies', '运行中公司'), value: runningOpcs.length, icon: 'building' as const },
        ].map((s, i) => (
          <div key={i} className="flex-center gap-12" style={{ padding: '14px 16px', background: 'var(--bg-surface)', border: '1px solid var(--border-subtle)', borderRadius: 'var(--radius-md)' }}>
            <div className="avatar avatar-lg" style={{ background: 'var(--bg-elevated)' }}>
              <Icon name={s.icon} size={15} />
            </div>
            <div>
              <div style={{ fontSize: 18, fontWeight: 700, color: s.accent ? 'var(--accent)' : 'var(--text-primary)', lineHeight: 1.2 }}>{s.value}</div>
              <div className="mono-xs muted" style={{ marginTop: 2 }}>{s.label}</div>
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
                <h3 className="section-card-title" style={{ fontSize: 13 }}>{t('activities.running_companies', '运行中公司')}</h3>
                <span className="text-xxs muted">{runningOpcs.length}</span>
              </div>
              <div style={{ padding: '6px 10px 10px' }}>
                {runningOpcs.map(opc => (
                  <div key={opc.id} className="flex-center gap-10" style={{ padding: '7px 6px', borderRadius: 'var(--radius-md)' }}>
                    <div className="avatar avatar-sm" style={{ background: opc.avatar_color || '#6366f1', borderRadius: 7 }}>
                      {opc.avatar_initials || opc.name.slice(0, 2).toUpperCase()}
                    </div>
                    <div className="flex-grow">
                      <div className="text-xs" style={{ fontWeight: 500 }}>{opc.display_name || opc.name}</div>
                      <div className="text-xxs muted">{t('agents.agent_count', '{{count}} 个智能体', { count: opc.agent_count })}</div>
                    </div>
                    <span className="dot-md success" />
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Active agents */}
          {totalAgents > 0 && (
            <div className="section-card">
              <div className="section-card-head" style={{ padding: '10px 16px' }}>
                <h3 className="section-card-title" style={{ fontSize: 13 }}>{t('activities.busy_agents', '活跃 Agent')}</h3>
                {busyAgents.length > 0 && <span className="tag success" style={{ fontSize: 10 }}>{t('activities.online_agents', '{{count}} 在线', { count: busyAgents.length })}</span>}
              </div>
              <div style={{ padding: '6px 10px 10px' }}>
                {Array.from(activities.values()).sort((a, b) => b.last_update - a.last_update).map(agent => (
                  <div key={agent.agent_id} className="flex-center gap-10" style={{ padding: '7px 6px', borderRadius: 'var(--radius-md)' }}>
                    <div className="avatar avatar-sm" style={{ background: hashColor(agent.agent_id), borderRadius: 7 }}>
                      {getInitials(agent.agent_id)}
                    </div>
                    <div className="flex-grow">
                      <div className="text-xs" style={{ fontWeight: 500, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{agent.agent_id}</div>
                      <div className="text-xxs muted">{t('activities.agent_events', '{{count}} 事件 · {{timeAgo}}', { count: agent.events.length, timeAgo: timeAgo(agent.last_update, t) })}</div>
                    </div>
                    <span
                      className={`dot-md ${agent.status === 'busy' ? 'success' : agent.status === 'error' ? 'danger' : 'dim'}`}
                      style={agent.status === 'busy' ? { boxShadow: '0 0 6px var(--success)' } : undefined}
                    />
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
          <h3 className="section-card-title" style={{ fontSize: 13 }}>{t('activities.event_stream', '事件流')}</h3>
          <span className="text-xxs muted">
            {allEvents.length > 0 ? t('activities.total_events_text', '{{count}} 条', { count: allEvents.length }) : ''}
          </span>
        </div>

        {runningOpcs.length === 0 ? (
          <div className="empty-state">
            <Icon name="building" size={32} className="empty-state-icon" />
            <div className="empty-state-title">{t('activities.no_running_companies', '尚无运行中的公司')}</div>
            <div className="empty-state-desc">{t('activities.deploy_first_hint', '先部署一个公司到办公室，再来查看实时活动')}</div>
          </div>
        ) : allEvents.length === 0 ? (
          <div className="empty-state">
            <Icon name="activity" size={32} className="empty-state-icon" />
            <div className="empty-state-title">{t('activities.waiting_for_events', '等待事件流入')}</div>
            <div className="empty-state-desc">{t('activities.waiting_desc', 'Agent 开始工作后，消息和工具调用将实时显示在此处')}</div>
            <div className="flex-center gap-5" style={{ marginTop: 14 }}>
              <span className="pulse-dot" style={{ width: 4, height: 4, borderRadius: '50%', background: 'var(--accent)', display: 'inline-block' }} />
              <span className="pulse-dot" style={{ width: 4, height: 4, borderRadius: '50%', background: 'var(--accent)', display: 'inline-block', animationDelay: '0.3s' }} />
              <span className="pulse-dot" style={{ width: 4, height: 4, borderRadius: '50%', background: 'var(--accent)', display: 'inline-block', animationDelay: '0.6s' }} />
            </div>
          </div>
        ) : (
          <div>
            {allEvents.map((event, idx) => {
              const color = hashColor(event.agent_id)
              const initials = getInitials(event.agent_id)
              const text = formatEventData(event)
              const streamInfo = streamLabels[event.stream] || { label: event.stream, color: 'var(--text-dimmer)' }
              return (
                <div key={`${event.ts}-${idx}`} className="flex gap-12" style={{ padding: '10px 16px', borderBottom: '1px solid var(--border-subtle)' }}>
                  <div className="avatar avatar-sm" style={{ background: color, width: 28, height: 28, borderRadius: 7 }}>
                    {initials}
                  </div>
                  <div className="flex-grow">
                    <div className="flex-center gap-8 flex-wrap text-xs muted">
                      <span style={{ color: 'var(--text-primary)', fontWeight: 500 }}>{event.agent_id}</span>
                      <span style={{ fontSize: 10, padding: '1px 6px', borderRadius: 4, background: `color-mix(in srgb, ${streamInfo.color} 15%, transparent)`, color: streamInfo.color }}>{streamInfo.label}</span>
                      <span className="text-xxs muted" style={{ marginLeft: 'auto' }}>{timeAgo(event.ts, t)}</span>
                    </div>
                    {text && <div className="text-xs muted" style={{ marginTop: 3 }}>{text}</div>}
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
