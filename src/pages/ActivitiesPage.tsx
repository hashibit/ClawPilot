import { useEffect, useState, useRef, useCallback } from 'react'
import { useTranslation } from 'react-i18next'
import { subscribeToActivities, type ActivityEvent, getActivityStreamStatus } from '../lib/activityStream'
import { useOpc } from '../contexts/OpcContext'
import { getAgents } from '../lib/api'
import type { OpcConfig } from '../lib/types'
import { Icon } from '../components/Icon'

interface AgentActivity {
  agent_id: string
  opc_id: string
  status: 'idle' | 'busy' | 'error'
  current_task?: string
  events: ActivityEvent[]
  last_update: number
}

interface OpcActivities {
  opc: OpcConfig
  agents: AgentActivity[]
}

// Max events to keep per agent
const MAX_EVENTS_PER_AGENT = 50

// Derive initials from agent id
function getInitials(id: string): string {
  return id.slice(0, 2).toUpperCase()
}

// Deterministic color from string
function hashColor(s: string): string {
  const palette = ['#6366f1', '#8b5cf6', '#ec4899', '#f97316', '#10b981', '#3b82f6', '#f59e0b', '#14b8a6']
  let h = 0
  for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) & 0xffff
  return palette[h % palette.length]
}

function timeAgo(ts: number): string {
  const diff = Math.floor(Date.now() / 1000 - ts)
  if (diff < 60) return `${diff}s ago`
  if (diff < 3600) return `${Math.floor(diff / 60)}m ago`
  return `${Math.floor(diff / 3600)}h ago`
}

export default function ActivitiesPage() {
  const { t } = useTranslation()
  const { opcs } = useOpc()
  const [activities, setActivities] = useState<Map<string, AgentActivity>>(new Map())
  const [connectionStatus, setConnectionStatus] = useState<'connected' | 'connecting' | 'disconnected'>('disconnected')
  const [agentToOpc, setAgentToOpc] = useState<Map<string, string>>(new Map())
  const scrollRef = useRef<HTMLDivElement>(null)

  // Get running OPCs only
  const runningOpcs = opcs.filter(opc => opc.is_running)

  // Build agent_id -> opc_id mapping from running OPCs
  useEffect(() => {
    const buildMapping = async () => {
      const mapping = new Map<string, string>()
      for (const opc of runningOpcs) {
        try {
          const agents = await getAgents(opc.id)
          for (const agent of agents) {
            mapping.set(agent.id, opc.id)
          }
        } catch (e) {
          console.error(`Failed to load agents for ${opc.id}:`, e)
        }
      }
      setAgentToOpc(mapping)
    }
    buildMapping()
  }, [runningOpcs])

  // Handle incoming activity events
  const handleEvent = useCallback((event: ActivityEvent) => {
    setActivities(prev => {
      const next = new Map(prev)
      const existing = next.get(event.agent_id) || {
        agent_id: event.agent_id,
        opc_id: agentToOpc.get(event.agent_id) || '',
        status: 'idle' as const,
        events: [],
        last_update: 0
      }

      // Update status based on stream type
      let newStatus = existing.status
      if (event.stream === 'lifecycle') {
        const lifecycleStatus = (event.data as any)?.status
        if (lifecycleStatus === 'start') {
          newStatus = 'busy'
        } else if (lifecycleStatus === 'end') {
          newStatus = 'idle'
        } else if (lifecycleStatus === 'error') {
          newStatus = 'error'
        }
      } else if (event.stream === 'error') {
        newStatus = 'error'
      }

      // Add event to list (keep most recent first)
      const newEvents = [event, ...existing.events].slice(0, MAX_EVENTS_PER_AGENT)

      next.set(event.agent_id, {
        ...existing,
        status: newStatus,
        events: newEvents,
        last_update: event.ts
      })

      return next
    })
  }, [agentToOpc])

  // Subscribe to activity stream
  useEffect(() => {
    const unsubscribe = subscribeToActivities(handleEvent)

    // Update connection status periodically
    const statusInterval = setInterval(() => {
      setConnectionStatus(getActivityStreamStatus())
    }, 1000)

    return () => {
      unsubscribe()
      clearInterval(statusInterval)
    }
  }, [handleEvent])

  // Group activities by OPC
  const opcActivities: OpcActivities[] = runningOpcs.map(opc => {
    const agents = Array.from(activities.values())
      .filter(a => a.opc_id === opc.id)
      .sort((a, b) => b.last_update - a.last_update)
    return { opc, agents }
  }).filter(oa => oa.agents.length > 0)

  // Flat event stream: all events from all agents, sorted newest first
  const allEvents = Array.from(activities.values())
    .flatMap(a => a.events.map(e => ({ ...e, _agent: a })))
    .sort((a, b) => b.ts - a.ts)
    .slice(0, 200)

  // Count busy agents
  const busyAgents = Array.from(activities.values()).filter(a => a.status === 'busy')
  const busyCount = busyAgents.length

  // Format event data for display
  const formatEventData = (event: ActivityEvent): string => {
    const data = event.data as any
    switch (event.stream) {
      case 'lifecycle':
        return `[${data.status}]`
      case 'assistant':
        return data.delta || data.text || ''
      case 'tool':
        return `[${data.name || 'tool'}] ${data.status || ''}`
      case 'error':
        return data.message || data.error || 'Error'
      default:
        return JSON.stringify(data).slice(0, 100)
    }
  }

  return (
    <div className="activity-page">
      {/* Main stream */}
      <div className="activity-stream" ref={scrollRef}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
          <div>
            <h1 className="page-title">{t('activities.title', '实时活动')}</h1>
            <p className="page-sub">所有 Agent 的消息与工具调用</p>
          </div>
          <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
            <span className="tag success">
              <span className="dot live" style={{ display: 'inline-block', width: 6, height: 6, borderRadius: '50%', marginRight: 5 }} />
              实时
            </span>
            <span style={{ fontSize: 12, color: 'var(--text-tertiary)' }}>
              {connectionStatus === 'connected' ? '已连接' : connectionStatus === 'connecting' ? '连接中…' : '断开'}
            </span>
          </div>
        </div>

        {runningOpcs.length === 0 ? (
          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', height: 200, color: 'var(--text-tertiary)', gap: 16 }}>
            <Icon name="building" size={48} />
            <p>{t('activities.noRunningOpc', '尚无运行中的公司')}</p>
            <p style={{ fontSize: 12 }}>{t('activities.deployHint', '先部署一个公司，再来查看活动')}</p>
          </div>
        ) : allEvents.length === 0 ? (
          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', height: 200, color: 'var(--text-tertiary)', gap: 16 }}>
            <Icon name="activity" size={48} />
            <p>{t('activities.noActivity', '暂无 Agent 活动')}</p>
            <p style={{ fontSize: 12 }}>{t('activities.waitingHint', '等待 Agent 开始工作…')}</p>
          </div>
        ) : (
          allEvents.map((event, idx) => {
            const agentId = event.agent_id
            const color = hashColor(agentId)
            const initials = getInitials(agentId)
            const text = formatEventData(event)
            return (
              <div key={`${event.ts}-${idx}`} className="activity-row">
                <div className="activity-avatar" style={{ background: color, color: 'white', fontSize: 12, fontWeight: 600 }}>
                  {initials}
                </div>
                <div className="activity-content">
                  <div className="activity-meta">
                    <span style={{ color: 'var(--text-primary)', fontWeight: 500 }}>{agentId}</span>
                    <span>{event.stream}</span>
                    <span style={{ marginLeft: 'auto', fontSize: 11, color: 'var(--text-muted)' }}>{timeAgo(event.ts)}</span>
                  </div>
                  {text && (
                    <div className="activity-text activity-text-muted">{text}</div>
                  )}
                </div>
              </div>
            )
          })
        )}
      </div>

      {/* Sidebar */}
      <div className="activity-side">
        <h3 className="section-title" style={{ marginBottom: 16 }}>活跃 Agent</h3>
        {busyCount === 0 ? (
          <div style={{ fontSize: 12, color: 'var(--text-muted)' }}>暂无活跃 Agent</div>
        ) : (
          Array.from(activities.values())
            .sort((a, b) => b.last_update - a.last_update)
            .map(agent => (
              <div key={agent.agent_id} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '8px 0', borderBottom: '1px solid var(--border-subtle)' }}>
                <div style={{
                  width: 28, height: 28, borderRadius: 8,
                  background: hashColor(agent.agent_id),
                  display: 'grid', placeItems: 'center',
                  fontSize: 11, fontWeight: 600, color: 'white', flexShrink: 0,
                }}>
                  {getInitials(agent.agent_id)}
                </div>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: 12, fontWeight: 500, color: 'var(--text-primary)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                    {agent.agent_id}
                  </div>
                  <div style={{ fontSize: 11, color: 'var(--text-tertiary)' }}>{agent.events.length} events</div>
                </div>
                {agent.status === 'busy' && (
                  <span className="dot live" style={{ width: 7, height: 7, borderRadius: '50%', flexShrink: 0 }} />
                )}
                {agent.status === 'error' && (
                  <span className="dot danger" style={{ width: 7, height: 7, borderRadius: '50%', flexShrink: 0 }} />
                )}
              </div>
            ))
        )}

        {runningOpcs.length > 0 && (
          <div style={{ marginTop: 24 }}>
            <h3 className="section-title" style={{ marginBottom: 12 }}>运行中公司</h3>
            {runningOpcs.map(opc => (
              <div key={opc.id} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '6px 0', fontSize: 12, color: 'var(--text-secondary)' }}>
                <div style={{
                  width: 20, height: 20, borderRadius: 5,
                  background: opc.avatar_color || '#6366f1',
                  display: 'grid', placeItems: 'center',
                  fontSize: 9, fontWeight: 600, color: 'white',
                }}>
                  {opc.avatar_initials || opc.name.slice(0, 2).toUpperCase()}
                </div>
                {opc.display_name || opc.name}
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
