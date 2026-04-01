import { useEffect, useState, useCallback } from 'react'
import { useTranslation } from 'react-i18next'
import { useOpc } from '../contexts/OpcContext'
import { getOpcStats } from '../lib/api'
import type { OpcStats } from '../lib/types'

function formatUptime(sec: number | null, lang: string): string {
  if (sec === null) return '—'
  if (sec < 60) return `${sec}s`
  if (sec < 3600) {
    const m = Math.floor(sec / 60)
    if (lang === 'zh-CN') return `${m}分钟`
    if (lang === 'ja') return `${m}分`
    if (lang === 'ko') return `${m}분`
    return `${m}m ${sec % 60}s`
  }
  const h = Math.floor(sec / 3600)
  const m = Math.floor((sec % 3600) / 60)
  if (lang === 'zh-CN') return `${h}小时${m}分`
  if (lang === 'ja') return `${h}時間${m}分`
  if (lang === 'ko') return `${h}시간 ${m}분`
  return `${h}h ${m}m`
}

function sumStats(stats: Map<string, OpcStats>): { agents: number; channels: number; messages: number; growth: number } {
  let agents = 0, channels = 0, messages = 0, growth = 0, n = 0
  for (const s of stats.values()) {
    agents += s.agent_count
    channels += s.channel_count
    messages += s.message_count_today
    growth += s.message_growth
    n++
  }
  return { agents, channels, messages, growth: n > 0 ? growth / n : 0 }
}

export default function OverviewPage() {
  const { t, i18n } = useTranslation()
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
    <div className="overview-content">

      {/* 统计卡片 */}
      <section>
        <div className="section-label" style={{ padding: '0 0 7px' }}>{t('overview.coreMetrics')}</div>
        <div className="stat-grid">
          <div className="stat-card">
            <div className="stat-value">{opcs.length}</div>
            <div className="stat-label">{t('overview.companies')}</div>
            <div className="stat-change neutral">
              <svg width="12" height="12" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" d="M5 12h14"/></svg>
              {t('overview.noChange')}
            </div>
          </div>
          <div className="stat-card">
            <div className="stat-value">{totals.agents}</div>
            <div className="stat-label">{t('overview.agents')}</div>
            <div className="stat-change up">
              <svg width="12" height="12" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" d="M5 10l7-7m0 0l7 7m-7-7v18"/></svg>
              {t('overview.realtime')}
            </div>
          </div>
          <div className="stat-card">
            <div className="stat-value">{totals.channels}</div>
            <div className="stat-label">{t('overview.channels')}</div>
            <div className="stat-change up">
              <svg width="12" height="12" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" d="M5 10l7-7m0 0l7 7m-7-7v18"/></svg>
              {t('overview.realtime')}
            </div>
          </div>
          <div className="stat-card">
            <div className="stat-value">{totals.messages.toLocaleString()}</div>
            <div className="stat-label">{t('overview.todayMessages')}</div>
            <div className={`stat-change ${totals.growth >= 0 ? 'up' : 'down'}`}>
              <svg width="12" height="12" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" d={totals.growth >= 0 ? "M5 10l7-7m0 0l7 7m-7-7v18" : "M5 14l7 7m0 0l7-7m-7 7V3"}/></svg>
              {growthSign}{totals.growth.toFixed(1)}% {t('overview.vsYesterday')}
            </div>
          </div>
        </div>
      </section>

      {/* 消息趋势 */}
      <section>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '7px' }}>
          <span className="section-label" style={{ padding: 0 }}>{t('overview.messageTrend')}</span>
          <button style={{ fontSize: '11px', color: '#a78bfa', background: 'none', border: 'none', cursor: 'pointer', padding: 0 }}>{t('overview.viewDetails')}</button>
        </div>
        <div className="stat-card">
          <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
            <div style={{ flex: 1 }}>
              <div style={{ fontSize: '24px', fontWeight: 600, color: '#FFFFFF' }}>{totals.messages.toLocaleString()}</div>
              <div className="stat-label">{t('overview.todayMessages')}</div>
            </div>
            <div style={{ textAlign: 'right' }}>
              <div style={{ fontSize: '13px', color: totals.growth >= 0 ? '#34c759' : '#f43f5e', fontWeight: 500 }}>
                {growthSign}{totals.growth.toFixed(1)}%
              </div>
              <div className="stat-label">{t('overview.vsYesterday')}</div>
            </div>
          </div>
          <div className="trend-bar">
            <div className="trend-fill" style={{ width: '68%' }}></div>
          </div>
        </div>
      </section>

      {/* 各公司消息量 */}
      <section>
        <div className="section-label" style={{ padding: '0 0 7px' }}>{t('overview.companyMessages')}</div>
        <div className="stat-card">
          <div style={{ display: 'flex', flexDirection: 'column' }}>
            {opcs.length === 0 ? (
              <div style={{ fontSize: '12px', color: '#8E8E93' }}>{t('overview.noData')}</div>
            ) : (() => {
              const maxMsg = Math.max(...opcs.map(o => statsMap.get(o.id)?.message_count_today ?? o.message_count_today), 1)
              const colors = ['#8b5cf6', '#06b6d4', '#f59e0b', '#10b981', '#f43f5e', '#3b82f6']
              return opcs.map((opc, i) => {
                const msgs = statsMap.get(opc.id)?.message_count_today ?? opc.message_count_today
                const pct = Math.round((msgs / maxMsg) * 100)
                return (
                  <div key={opc.id} className="overview-row">
                    <div style={{ width: '80px', fontSize: '12px', color: 'rgba(255,255,255,0.8)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{opc.display_name}</div>
                    <div style={{ flex: 1 }}>
                      <div className="trend-bar"><div className="trend-fill" style={{ width: `${pct}%`, background: colors[i % colors.length] }}></div></div>
                    </div>
                    <div style={{ width: '60px', textAlign: 'right', fontSize: '12px', color: '#FFFFFF', fontWeight: 500 }}>{msgs.toLocaleString()}</div>
                  </div>
                )
              })
            })()}
          </div>
        </div>
      </section>

      {/* 运行中公司 */}
      <section>
        <div className="section-label" style={{ padding: '0 0 7px' }}>{t('overview.runningCompanies')}</div>
        <div className="stat-card">
          {opcs.filter(o => o.is_running).length === 0 ? (
            <div style={{ fontSize: '12px', color: '#8E8E93' }}>{t('overview.noRunning')}</div>
          ) : (
            opcs.filter(o => o.is_running).map(opc => (
              <div key={opc.id} className="overview-row">
                <div style={{
                  width: '32px', height: '32px', borderRadius: '8px',
                  background: `linear-gradient(135deg,${opc.avatar_color ?? '#8b5cf6'},${opc.avatar_color ?? '#06b6d4'})`,
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  fontSize: '10px', fontWeight: 700, color: 'white', flexShrink: 0,
                }}>
                  {opc.avatar_initials ?? opc.display_name.slice(0, 2)}
                </div>
                <div style={{ flex: 1 }}>
                  <div style={{ fontSize: '12px', fontWeight: 500, color: '#FFFFFF' }}>{opc.display_name}</div>
                  <div className="trend-bar">
                    <div className="trend-fill" style={{ width: `${Math.min(100, (statsMap.get(opc.id)?.message_count_today ?? 0) / 5)}%`, background: '#8b5cf6' }}></div>
                  </div>
                </div>
                <div style={{ fontSize: '12px', color: '#FFFFFF', fontWeight: 500 }}>
                  {(statsMap.get(opc.id)?.message_count_today ?? opc.message_count_today).toLocaleString()}
                </div>
              </div>
            ))
          )}
        </div>
      </section>
    </div>
  )
}
