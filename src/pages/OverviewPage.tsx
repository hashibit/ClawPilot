import { useEffect, useState, useCallback } from 'react'
import { useOpc } from '../contexts/OpcContext'
import { getOpcStats, getProcessStatus, startOpenclaw, stopOpenclaw, reloadOpenclaw } from '../lib/api'
import type { OpcStats } from '../lib/types'
import type { ProcessStatus } from '../lib/api'

function formatUptime(sec: number | null): string {
  if (sec === null) return '—'
  if (sec < 60) return `${sec}s`
  if (sec < 3600) return `${Math.floor(sec / 60)}m ${sec % 60}s`
  const h = Math.floor(sec / 3600)
  const m = Math.floor((sec % 3600) / 60)
  return `${h}h ${m}m`
}

// Totals accumulated across all OPCs
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
  const { opcs } = useOpc()
  const [statsMap, setStatsMap] = useState<Map<string, OpcStats>>(new Map())
  const [procStatus, setProcStatus] = useState<ProcessStatus>({ is_running: false, pid: null, uptime_seconds: null })
  const [procLoading, setProcLoading] = useState(false)

  useEffect(() => {
    if (!opcs.length) return
    Promise.all(opcs.map(o => getOpcStats(o.id).then(s => [o.id, s] as [string, OpcStats])))
      .then(pairs => setStatsMap(new Map(pairs)))
      .catch(console.error)
  }, [opcs])

  const fetchProcStatus = useCallback(() => {
    getProcessStatus()
      .then(s => setProcStatus(s))
      .catch(() => setProcStatus({ is_running: false, pid: null, uptime_seconds: null }))
  }, [])

  useEffect(() => {
    fetchProcStatus()
    const id = setInterval(fetchProcStatus, 5000)
    return () => clearInterval(id)
  }, [fetchProcStatus])

  async function handleProcAction(action: 'start' | 'stop' | 'reload') {
    setProcLoading(true)
    try {
      if (action === 'start') await startOpenclaw()
      else if (action === 'stop') await stopOpenclaw()
      else await reloadOpenclaw()
      setTimeout(fetchProcStatus, 1000)
    } catch (e: any) {
      alert(e?.message ?? '操作失败')
    } finally {
      setProcLoading(false)
    }
  }

  const totals = sumStats(statsMap)
  const growthSign = totals.growth >= 0 ? '+' : ''

  return (
    <div className="overview-content">

      {/* OpenClaw 运行状态 */}
      <section>
        <div className="section-label" style={{ padding: '0 0 7px' }}>OpenClaw 进程</div>
        <div className="stat-card" style={{ display: 'flex', alignItems: 'center', gap: '14px', flexWrap: 'wrap' }}>
          {/* 状态徽章 */}
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flex: 1, minWidth: '160px' }}>
            <div style={{
              width: '10px', height: '10px', borderRadius: '50%', flexShrink: 0,
              background: procStatus.is_running ? '#34c759' : '#636366',
              boxShadow: procStatus.is_running ? '0 0 6px #34c75980' : 'none',
            }} />
            <div>
              <div style={{ fontSize: '13px', fontWeight: 600, color: '#FFFFFF' }}>
                {procStatus.is_running ? '运行中' : '已停止'}
              </div>
              <div style={{ fontSize: '11px', color: '#8E8E93', marginTop: '1px' }}>
                {procStatus.is_running
                  ? `PID ${procStatus.pid}  ·  已运行 ${formatUptime(procStatus.uptime_seconds)}`
                  : 'OpenClaw 未在运行'}
              </div>
            </div>
          </div>

          {/* 操作按钮 */}
          <div style={{ display: 'flex', gap: '8px', flexShrink: 0 }}>
            {!procStatus.is_running ? (
              <button
                disabled={procLoading}
                onClick={() => handleProcAction('start')}
                style={{ padding: '5px 14px', borderRadius: '7px', fontSize: '12px', fontWeight: 500, cursor: 'pointer', border: 'none', background: '#34c759', color: '#fff', opacity: procLoading ? 0.6 : 1 }}
              >启动</button>
            ) : (
              <>
                <button
                  disabled={procLoading}
                  onClick={() => handleProcAction('reload')}
                  style={{ padding: '5px 14px', borderRadius: '7px', fontSize: '12px', fontWeight: 500, cursor: 'pointer', border: '1px solid rgba(255,255,255,0.12)', background: 'rgba(255,255,255,0.06)', color: '#FFFFFF', opacity: procLoading ? 0.6 : 1 }}
                >重载配置</button>
                <button
                  disabled={procLoading}
                  onClick={() => handleProcAction('stop')}
                  style={{ padding: '5px 14px', borderRadius: '7px', fontSize: '12px', fontWeight: 500, cursor: 'pointer', border: 'none', background: '#f43f5e', color: '#fff', opacity: procLoading ? 0.6 : 1 }}
                >停止</button>
              </>
            )}
          </div>
        </div>
      </section>

      {/* 统计卡片 */}
      <section>
        <div className="section-label" style={{ padding: '0 0 7px' }}>核心指标</div>
        <div className="stat-grid">
          <div className="stat-card">
            <div className="stat-value">{opcs.length}</div>
            <div className="stat-label">公司总数</div>
            <div className="stat-change neutral">
              <svg width="12" height="12" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" d="M5 12h14"/></svg>
              无变化
            </div>
          </div>
          <div className="stat-card">
            <div className="stat-value">{totals.agents}</div>
            <div className="stat-label">智能体总数</div>
            <div className="stat-change up">
              <svg width="12" height="12" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" d="M5 10l7-7m0 0l7 7m-7-7v18"/></svg>
              实时统计
            </div>
          </div>
          <div className="stat-card">
            <div className="stat-value">{totals.channels}</div>
            <div className="stat-label">飞书频道</div>
            <div className="stat-change up">
              <svg width="12" height="12" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" d="M5 10l7-7m0 0l7 7m-7-7v18"/></svg>
              实时统计
            </div>
          </div>
          <div className="stat-card">
            <div className="stat-value">{totals.messages.toLocaleString()}</div>
            <div className="stat-label">今日消息</div>
            <div className={`stat-change ${totals.growth >= 0 ? 'up' : 'down'}`}>
              <svg width="12" height="12" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" d={totals.growth >= 0 ? "M5 10l7-7m0 0l7 7m-7-7v18" : "M5 14l7 7m0 0l7-7m-7 7V3"}/></svg>
              {growthSign}{totals.growth.toFixed(1)}% vs 昨日
            </div>
          </div>
        </div>
      </section>

      {/* 消息趋势 */}
      <section>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '7px' }}>
          <span className="section-label" style={{ padding: 0 }}>消息趋势</span>
          <button style={{ fontSize: '11px', color: '#a78bfa', background: 'none', border: 'none', cursor: 'pointer', padding: 0 }}>查看详情</button>
        </div>
        <div className="stat-card">
          <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
            <div style={{ flex: 1 }}>
              <div style={{ fontSize: '24px', fontWeight: 600, color: '#FFFFFF' }}>{totals.messages.toLocaleString()}</div>
              <div className="stat-label">今日消息</div>
            </div>
            <div style={{ textAlign: 'right' }}>
              <div style={{ fontSize: '13px', color: totals.growth >= 0 ? '#34c759' : '#f43f5e', fontWeight: 500 }}>
                {growthSign}{totals.growth.toFixed(1)}%
              </div>
              <div className="stat-label">较昨日</div>
            </div>
          </div>
          <div className="trend-bar">
            <div className="trend-fill" style={{ width: '68%' }}></div>
          </div>
        </div>
      </section>

      {/* 各公司消息量 */}
      <section>
        <div className="section-label" style={{ padding: '0 0 7px' }}>各公司消息量（今日）</div>
        <div className="stat-card">
          <div style={{ display: 'flex', flexDirection: 'column' }}>
            {opcs.length === 0 ? (
              <div style={{ fontSize: '12px', color: '#8E8E93' }}>暂无公司数据</div>
            ) : (() => {
              const maxMsg = Math.max(...opcs.map(o => statsMap.get(o.id)?.message_count_today ?? o.message_count_today), 1)
              const colors = ['#8b5cf6', '#06b6d4', '#f59e0b', '#10b981', '#f43f5e', '#3b82f6']
              return opcs.map((opc, i) => {
                const msgs = statsMap.get(opc.id)?.message_count_today ?? opc.message_count_today
                const pct = Math.round((msgs / maxMsg) * 100)
                return (
                  <div key={opc.id} style={{ display: 'flex', alignItems: 'center', gap: '10px', minHeight: '44px' }}>
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
        <div className="section-label" style={{ padding: '0 0 7px' }}>运行中公司</div>
        <div className="stat-card">
          {opcs.filter(o => o.is_running).length === 0 ? (
            <div style={{ fontSize: '12px', color: '#8E8E93' }}>暂无运行中公司</div>
          ) : (
            opcs.filter(o => o.is_running).map(opc => (
              <div key={opc.id} style={{ display: 'flex', alignItems: 'center', gap: '10px', minHeight: '44px' }}>
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
