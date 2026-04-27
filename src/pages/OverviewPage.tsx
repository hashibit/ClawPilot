import { useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
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

export default function OverviewPage() {
  const { t } = useTranslation()
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

  return (
    <div style={{ flex: 1, overflow: 'hidden', display: 'flex', flexDirection: 'column' }}>
      <div data-tauri-drag-region className="toolbar" style={{ justifyContent: 'space-between' }}>
        <span style={{ fontSize: '15px', fontWeight: 600 }}>{t('overview.title')}</span>
        {/* B2: time-range buttons (today/week/month) had no onClick — they were
            decorative. Removed pending real backend filtering. See issues-review.md B2. */}
      </div>
      <div className="overview-content">
        {/* 核心指标 */}
        <section>
          <div className="section-label" style={{ padding: '0 0 7px' }}>{t('overview.coreMetrics')}</div>
          <div className="stat-grid">
            <div className="stat-card" data-accent="purple">
              <div className="stat-value">{opcs.length}</div>
              <div className="stat-label">{t('overview.companies')}</div>
              <div className="stat-change neutral"><Icon name="minus" size={12} />{t('overview.noChange')}</div>
            </div>
            <div className="stat-card" data-accent="green">
              <div className="stat-value">{totals.agents}</div>
              <div className="stat-label">{t('overview.agents')}</div>
              <div className="stat-change up"><Icon name="arrow-up" size={12} />{t('overview.realtime')}</div>
            </div>
            <div className="stat-card" data-accent="cyan">
              <div className="stat-value">{totals.channels}</div>
              <div className="stat-label">{t('overview.channels')}</div>
              <div className="stat-change up"><Icon name="arrow-up" size={12} />{t('overview.realtime')}</div>
            </div>
            <div className="stat-card" data-accent="amber">
              <div className="stat-value">{totals.messages.toLocaleString()}</div>
              <div className="stat-label">{t('overview.todayMessages')}</div>
              <div className={`stat-change ${totals.growth >= 0 ? 'up' : 'down'}`}>
                <Icon name={totals.growth >= 0 ? 'arrow-up' : 'arrow-down'} size={12} />
                {growthSign}{totals.growth.toFixed(1)}% {t('overview.vsYesterday')}
              </div>
            </div>
          </div>
        </section>

        {/* 消息趋势 */}
        <section>
          <div className="section-label" style={{ padding: '0 0 7px' }}>{t('overview.messageTrend')}</div>
          <div className="stat-card">
            <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
              <div style={{ flex: 1 }}>
                <div style={{ fontSize: '24px', fontWeight: 600, color: 'var(--text-primary)' }}>{totals.messages.toLocaleString()}</div>
                <div className="stat-label">{t('overview.todayMessages')}</div>
              </div>
              <div style={{ textAlign: 'right' }}>
                <div style={{ fontSize: '13px', color: totals.growth >= 0 ? 'var(--success)' : 'var(--error)', fontWeight: 500 }}>
                  {growthSign}{totals.growth.toFixed(1)}%
                </div>
                <div className="stat-label">{t('overview.vsYesterday')}</div>
              </div>
            </div>
            <div className="trend-bar"><div className="trend-fill" style={{ width: '68%' }} /></div>
          </div>
        </section>

        {/* 各公司消息量 */}
        <section>
          <div className="section-label" style={{ padding: '0 0 7px' }}>{t('overview.companyMessages')}</div>
          <div className="stat-card">
            {opcs.length === 0 ? (
              <div style={{ fontSize: '12px', color: 'var(--text-dimmer)' }}>{t('overview.noData')}</div>
            ) : (() => {
              const maxMsg = Math.max(...opcs.map(o => statsMap.get(o.id)?.message_count_today ?? o.message_count_today), 1)
              const colors = ['#8b5cf6', '#06b6d4', '#f59e0b', '#10b981', '#f43f5e', '#3b82f6']
              return opcs.map((opc, i) => {
                const msgs = statsMap.get(opc.id)?.message_count_today ?? opc.message_count_today
                const pct = Math.round((msgs / maxMsg) * 100)
                return (
                  <div key={opc.id} className="overview-row">
                    <div style={{ width: '80px', fontSize: '12px', color: 'var(--text-secondary)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{opc.display_name}</div>
                    <div style={{ flex: 1 }}>
                      <div className="trend-bar"><div className="trend-fill" style={{ width: `${pct}%`, background: colors[i % colors.length] }} /></div>
                    </div>
                    <div style={{ width: '60px', textAlign: 'right', fontSize: '12px', color: 'var(--text-primary)', fontWeight: 500 }}>{msgs.toLocaleString()}</div>
                  </div>
                )
              })
            })()}
          </div>
        </section>

        {/* 运行中公司 */}
        <section>
          <div className="section-label" style={{ padding: '0 0 7px' }}>{t('overview.runningCompanies')}</div>
          <div className="stat-card">
            {opcs.filter(o => o.is_running).length === 0 ? (
              <div style={{ fontSize: '12px', color: 'var(--text-dimmer)' }}>{t('overview.noRunning')}</div>
            ) : opcs.filter(o => o.is_running).map(opc => (
              <div key={opc.id} className="overview-row">
                <div className="avatar avatar-lg" style={{ background: opc.avatar_color ?? 'var(--accent)' }}>
                  {opc.avatar_initials ?? opc.display_name.slice(0, 2)}
                </div>
                <div style={{ flex: 1 }}>
                  <div style={{ fontSize: '12px', fontWeight: 500, color: 'var(--text-primary)' }}>{opc.display_name}</div>
                  <div className="trend-bar">
                    <div className="trend-fill" style={{ width: `${Math.min(100, (statsMap.get(opc.id)?.message_count_today ?? 0) / 5)}%`, background: 'var(--accent)' }} />
                  </div>
                </div>
                <div style={{ fontSize: '12px', color: 'var(--text-primary)', fontWeight: 500 }}>
                  {(statsMap.get(opc.id)?.message_count_today ?? opc.message_count_today).toLocaleString()}
                </div>
              </div>
            ))}
          </div>
        </section>
      </div>
    </div>
  )
}
