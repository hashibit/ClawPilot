import { useEffect, useState } from 'react'
import { useOpc } from '../contexts/OpcContext'
import { getOpcStats } from '../lib/api'
import type { OpcStats } from '../lib/types'
import { Icon } from '../components/Icon'

function sumStats(stats: Map<string, OpcStats>) {
  let agents = 0, channels = 0, messages = 0, growth = 0, n = 0
  for (const s of stats.values()) {
    agents += s.agent_count; channels += s.channel_count
    messages += s.message_count_today; growth += s.message_growth; n++
  }
  return { agents, channels, messages, growth: n > 0 ? growth / n : 0 }
}

const CHART_COLORS = ['#8b5cf6', '#06b6d4', '#f59e0b', '#10b981', '#f43f5e', '#3b82f6']

const OPC_EMOJIS: Record<string, string> = {}

function opcEmoji(id: string, index: number): string {
  const pool = ['🏢', '🚀', '💡', '🎯', '⚡', '🌐']
  if (!OPC_EMOJIS[id]) OPC_EMOJIS[id] = pool[index % pool.length]
  return OPC_EMOJIS[id]
}

export default function OverviewPage() {
  const { opcs } = useOpc()
  const [statsMap, setStatsMap] = useState<Map<string, OpcStats>>(new Map())

  useEffect(() => {
    if (!opcs.length) return
    Promise.all(opcs.map(o => getOpcStats(o.id).then(s => [o.id, s] as [string, OpcStats])))
      .then(pairs => setStatsMap(new Map(pairs)))
      .catch(console.error)
  }, [opcs])

  const totals = sumStats(statsMap)
  const growthSign = totals.growth >= 0 ? '+' : ''
  const date = new Date().toLocaleDateString('zh-CN', { year: 'numeric', month: 'long', day: 'numeric' })

  const maxMsg = Math.max(...opcs.map(o => statsMap.get(o.id)?.message_count_today ?? o.message_count_today), 1)
  const runningOpcs = opcs.filter(o => o.is_running)

  return (
    <div className="overview-content fade-in">
      {/* Page header */}
      <div>
        <h1 className="page-title">数据概览</h1>
        <p className="page-sub">{date} · 全局运营大盘</p>
      </div>

      {/* Metric cards */}
      <div className="metric-grid">
        <div className="metric-card">
          <div className="metric-card-head">
            <div className="metric-card-label">公司总数</div>
            <div className="metric-card-icon"><Icon name="grid" size={14} /></div>
          </div>
          <div className="metric-card-value">{opcs.length}</div>
          <div className="metric-card-delta delta-up">↑ 实时</div>
        </div>

        <div className="metric-card">
          <div className="metric-card-head">
            <div className="metric-card-label">智能体总数</div>
            <div className="metric-card-icon"><Icon name="users" size={14} /></div>
          </div>
          <div className="metric-card-value">{totals.agents}</div>
          <div className="metric-card-delta delta-up">↑ 实时</div>
        </div>

        <div className="metric-card">
          <div className="metric-card-head">
            <div className="metric-card-label">飞书频道</div>
            <div className="metric-card-icon"><Icon name="message" size={14} /></div>
          </div>
          <div className="metric-card-value">{totals.channels}</div>
          <div className="metric-card-delta delta-up">↑ 实时</div>
        </div>

        <div className="metric-card">
          <div className="metric-card-head">
            <div className="metric-card-label">今日消息</div>
            <div className="metric-card-icon"><Icon name="activity" size={14} /></div>
          </div>
          <div className="metric-card-value">{totals.messages.toLocaleString()}</div>
          <div className={`metric-card-delta ${totals.growth >= 0 ? 'delta-up' : ''}`}>
            {totals.growth >= 0 ? '↑' : '↓'} {growthSign}{totals.growth.toFixed(1)}% 较昨日
          </div>
        </div>
      </div>

      {/* Two-column row */}
      <div className="row-2">
        {/* Bar chart: company message volumes */}
        <div className="chart-card">
          <div className="chart-head">
            <h3 className="chart-title">各公司消息量</h3>
            <div className="chart-meta">今日</div>
          </div>
          {opcs.length === 0 ? (
            <div style={{ fontSize: '12px', color: 'var(--text-dimmer)', padding: '12px 0' }}>暂无数据</div>
          ) : opcs.map((opc, i) => {
            const msgs = statsMap.get(opc.id)?.message_count_today ?? opc.message_count_today
            const pct = Math.round((msgs / maxMsg) * 100)
            const color = opc.avatar_color ?? CHART_COLORS[i % CHART_COLORS.length]
            return (
              <div key={opc.id} className="bar-row">
                <div className="bar-label">
                  <span style={{ fontSize: 14 }}>{opcEmoji(opc.id, i)}</span>
                  <span>{opc.display_name}</span>
                </div>
                <div className="bar-track">
                  <div className="bar-fill" style={{ width: pct + '%', background: color }} />
                </div>
                <div className="bar-value">{msgs > 0 ? msgs.toLocaleString() : '—'}</div>
              </div>
            )
          })}
        </div>

        {/* Running companies list */}
        <div className="chart-card">
          <div className="chart-head">
            <h3 className="chart-title">运行中公司</h3>
            <div className="chart-meta">{runningOpcs.length}/{opcs.length}</div>
          </div>
          <div className="running-list">
            {runningOpcs.length === 0 ? (
              <div style={{ fontSize: '12px', color: 'var(--text-dimmer)', padding: '12px 0' }}>暂无运行中公司</div>
            ) : runningOpcs.map(opc => {
              const initials = opc.avatar_initials ?? opc.display_name.slice(0, 1)
              const color = opc.avatar_color ?? 'var(--accent)'
              const stats = statsMap.get(opc.id)
              const host = stats ? `${stats.agent_count} 个智能体` : '—'
              return (
                <div key={opc.id} className="running-row">
                  <div className="running-avatar" style={{ background: color }}>{initials}</div>
                  <div className="running-info">
                    <div className="running-name">{opc.display_name}</div>
                    <div className="running-host">{host}</div>
                  </div>
                  <span className="dot live" />
                </div>
              )
            })}
          </div>
        </div>
      </div>
    </div>
  )
}
