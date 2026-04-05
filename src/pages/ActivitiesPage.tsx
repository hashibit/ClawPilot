import { useEffect, useState, useRef, useCallback } from 'react'
import { useTranslation } from 'react-i18next'
import { subscribeToActivities, type ActivityEvent, getActivityStreamStatus } from '../lib/activityStream'
import { useOpc } from '../contexts/OpcContext'
import { getAgents } from '../lib/api'
import type { OpcConfig, AgentConfig } from '../lib/types'
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

  // Format timestamp
  const formatTime = (ts: number) => {
    const date = new Date(ts * 1000)
    return date.toLocaleTimeString()
  }

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

  // Get status color
  const getStatusColor = (status: AgentActivity['status']) => {
    switch (status) {
      case 'busy': return '#10b981'
      case 'error': return '#ef4444'
      default: return '#6b7280'
    }
  }

  // Get stream badge color
  const getStreamColor = (stream: string) => {
    switch (stream) {
      case 'lifecycle': return '#8b5cf6'
      case 'assistant': return '#3b82f6'
      case 'tool': return '#f97316'
      case 'error': return '#ef4444'
      default: return '#6b7280'
    }
  }

  // Count busy agents
  const busyCount = Array.from(activities.values()).filter(a => a.status === 'busy').length

  return (
    <div style={{ padding: 24, height: '100%', overflow: 'auto' }} ref={scrollRef}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 24 }}>
        <h1 style={{ fontSize: 24, fontWeight: 600, margin: 0 }}>
          {t('activities.title', 'Agent Activities')}
        </h1>
        <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
          {busyCount > 0 && (
            <span style={{
              fontSize: 12,
              padding: '4px 12px',
              borderRadius: 12,
              background: 'rgba(16, 185, 129, 0.2)',
              color: '#10b981'
            }}>
              {busyCount} {t('activities.active', 'active')}
            </span>
          )}
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <span style={{
              width: 8,
              height: 8,
              borderRadius: '50%',
              background: connectionStatus === 'connected' ? '#10b981' : '#ef4444'
            }} />
            <span style={{ fontSize: 12, color: 'rgba(255,255,255,0.6)' }}>
              {connectionStatus === 'connected' ? t('activities.connected', 'Connected') : t('activities.disconnected', 'Disconnected')}
            </span>
          </div>
        </div>
      </div>

      {runningOpcs.length === 0 ? (
        <div style={{
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
          height: 200,
          color: 'rgba(255,255,255,0.4)',
          gap: 16
        }}>
          <Icon name="building" size={48} />
          <p>{t('activities.noRunningOpc', 'No deployed companies')}</p>
          <p style={{ fontSize: 12 }}>{t('activities.deployHint', 'Deploy a company first to see activities')}</p>
        </div>
      ) : opcActivities.length === 0 ? (
        <div style={{
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
          height: 200,
          color: 'rgba(255,255,255,0.4)',
          gap: 16
        }}>
          <Icon name="activity" size={48} />
          <p>{t('activities.noActivity', 'No agent activity yet')}</p>
          <p style={{ fontSize: 12 }}>{t('activities.waitingHint', 'Waiting for agents to start working...')}</p>
          <div style={{ marginTop: 16, fontSize: 12, color: 'rgba(255,255,255,0.3)' }}>
            {t('activities.runningCompanies', 'Running companies')}: {runningOpcs.map(o => o.display_name || o.name).join(', ')}
          </div>
        </div>
      ) : (
        <div style={{ display: 'grid', gap: 24 }}>
          {opcActivities.map(({ opc, agents }) => (
            <div key={opc.id}>
              {/* Company header */}
              <div style={{
                display: 'flex',
                alignItems: 'center',
                gap: 12,
                marginBottom: 12
              }}>
                <div style={{
                  width: 32,
                  height: 32,
                  borderRadius: 8,
                  background: opc.avatar_color || '#6366f1',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  fontSize: 12,
                  fontWeight: 600,
                  color: 'white'
                }}>
                  {opc.avatar_initials || opc.name.slice(0, 2).toUpperCase()}
                </div>
                <div>
                  <div style={{ fontWeight: 500 }}>{opc.display_name || opc.name}</div>
                  <div style={{ fontSize: 12, color: 'rgba(255,255,255,0.4)' }}>
                    {agents.length} {t('activities.agents', 'agents')}
                  </div>
                </div>
              </div>

              {/* Agents grid */}
              <div style={{ display: 'grid', gap: 12 }}>
                {agents.map(agent => (
                  <div
                    key={agent.agent_id}
                    style={{
                      background: 'rgba(255,255,255,0.05)',
                      border: '1px solid rgba(255,255,255,0.1)',
                      borderRadius: 12,
                      overflow: 'hidden'
                    }}
                  >
                    {/* Agent header */}
                    <div style={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: 12,
                      padding: '12px 16px',
                      borderBottom: '1px solid rgba(255,255,255,0.1)',
                      background: 'rgba(255,255,255,0.02)'
                    }}>
                      <span style={{
                        width: 10,
                        height: 10,
                        borderRadius: '50%',
                        background: getStatusColor(agent.status),
                        animation: agent.status === 'busy' ? 'pulse 2s infinite' : 'none'
                      }} />
                      <span style={{ fontWeight: 500 }}>{agent.agent_id}</span>
                      <span style={{
                        fontSize: 11,
                        padding: '2px 8px',
                        borderRadius: 4,
                        background: agent.status === 'busy' ? 'rgba(16, 185, 129, 0.2)' : 'rgba(255,255,255,0.1)',
                        color: agent.status === 'busy' ? '#10b981' : 'rgba(255,255,255,0.6)'
                      }}>
                        {agent.status}
                      </span>
                      <span style={{ marginLeft: 'auto', fontSize: 12, color: 'rgba(255,255,255,0.4)' }}>
                        {agent.events.length} events
                      </span>
                    </div>

                    {/* Events list */}
                    <div style={{ maxHeight: 250, overflow: 'auto' }}>
                      {agent.events.slice(0, 10).map((event, idx) => (
                        <div
                          key={`${event.ts}-${idx}`}
                          style={{
                            display: 'flex',
                            gap: 12,
                            padding: '8px 16px',
                            borderBottom: idx < Math.min(agent.events.length, 10) - 1 ? '1px solid rgba(255,255,255,0.05)' : 'none',
                            fontSize: 13
                          }}
                        >
                          <span style={{
                            fontSize: 10,
                            padding: '2px 6px',
                            borderRadius: 3,
                            background: getStreamColor(event.stream),
                            color: 'white',
                            minWidth: 70,
                            textAlign: 'center',
                            textTransform: 'uppercase'
                          }}>
                            {event.stream}
                          </span>
                          <span style={{ flex: 1, color: 'rgba(255,255,255,0.8)', wordBreak: 'break-all' }}>
                            {formatEventData(event)}
                          </span>
                          <span style={{ fontSize: 11, color: 'rgba(255,255,255,0.4)', whiteSpace: 'nowrap' }}>
                            {formatTime(event.ts)}
                          </span>
                        </div>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Pulse animation style */}
      <style>{`
        @keyframes pulse {
          0%, 100% { opacity: 1; }
          50% { opacity: 0.5; }
        }
      `}</style>
    </div>
  )
}