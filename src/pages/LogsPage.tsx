import { useEffect, useMemo, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { getLogs } from '../lib/api'
import { toast } from '../components/Toast'
import type { LogEntry } from '../lib/types'

const LOG_LEVELS = ['INFO', 'WARN', 'ERROR', 'DEBUG', 'SYSTEM'] as const

function formatTs(ts: number): string {
  return new Date(ts).toLocaleString('zh-CN', {
    month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit', second: '2-digit',
    hour12: false,
  }).replace(/\//g, '-')
}

export default function LogsPage() {
  const { t } = useTranslation()
  const [logs, setLogs] = useState<LogEntry[]>([])
  const [enabledLevels, setEnabledLevels] = useState<Set<string>>(new Set(LOG_LEVELS))
  const [cleared, setCleared] = useState(false)
  const [search, setSearch] = useState('')
  const [filterLevel, setFilterLevel] = useState<string>('')
  const [filterComponent, setFilterComponent] = useState<string>('')
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null)

  const fetchLogs = async () => {
    try {
      const entries = await getLogs(filterLevel || undefined, filterComponent || undefined, 200)
      if (!cleared) setLogs(entries)
    } catch (e) {
      toast(String(e), 'error')
    }
  }

  useEffect(() => {
    fetchLogs()
    intervalRef.current = setInterval(fetchLogs, 3000)
    return () => { if (intervalRef.current) clearInterval(intervalRef.current) }
  }, [filterLevel, filterComponent])

  const displayLogs = useMemo(() => {
    if (cleared) return []
    return logs.filter(log => {
      if (!enabledLevels.has(log.level.toUpperCase())) return false
      if (search) {
        const q = search.toLowerCase()
        return (
          log.message.toLowerCase().includes(q) ||
          (log.component || '').toLowerCase().includes(q) ||
          (log.channel || '').toLowerCase().includes(q)
        )
      }
      return true
    })
  }, [logs, enabledLevels, cleared, search])

  const toggleLevel = (level: string) => {
    setEnabledLevels(prev => {
      const next = new Set(prev)
      if (next.has(level)) next.delete(level)
      else next.add(level)
      return next
    })
  }

  // Level counts for stats
  const levelCounts = useMemo(() => {
    const counts: Record<string, number> = {}
    for (const level of LOG_LEVELS) counts[level] = 0
    for (const log of logs) {
      const l = log.level.toUpperCase()
      if (l in counts) counts[l]++
    }
    return counts
  }, [logs])

  return (
    <div className="log-page fade-in">

      {/* Header + Toolbar (single row) */}
      <div className="flex-between" style={{ flexWrap: 'wrap', gap: 10 }}>
        <div>
          <h1 className="page-title">{t('logs.title')}</h1>
          <p className="page-sub">操作审计 · 按时间倒序</p>
        </div>
        <div className="flex-center gap-6" style={{ flexWrap: 'wrap' }}>
          <input
            className="log-search"
            placeholder="搜索日志…"
            value={search}
            onChange={e => setSearch(e.target.value)}
          />
          {LOG_LEVELS.map(level => (
            <button
              key={level}
              data-level={level}
              className={`log-chip${enabledLevels.has(level) ? '' : ' off'}`}
              onClick={() => toggleLevel(level)}
            >
              {level}
              {levelCounts[level] > 0 && (
                <span style={{ opacity: 0.6 }}>{levelCounts[level]}</span>
              )}
            </button>
          ))}
          {cleared ? (
            <button className="btn btn-sm" onClick={() => setCleared(false)}>{t('logs.resume')}</button>
          ) : (
            <button className="btn btn-sm btn-ghost" onClick={() => { setCleared(true) }}>{t('logs.clear')}</button>
          )}
        </div>
      </div>

      {/* Log stream */}
      <div className="section-card log-stream">
        <div className="section-card-head" style={{ padding: '10px 16px' }}>
          <h3 className="section-card-title" style={{ fontSize: 13 }}>日志流</h3>
          <span className="log-count">{displayLogs.length}</span>
        </div>

        {/* Column headers */}
        <div className="log-thead">
          <div>时间</div>
          <div>级别</div>
          <div>组件</div>
          <div>消息</div>
          <div style={{ textAlign: 'right' }}>频道</div>
        </div>

        {/* Scrollable log body */}
        <div className="log-stream-body">
          {displayLogs.length === 0 ? (
            <div className="log-empty">
              <div className="log-empty-title">
                {cleared ? t('logs.cleared') : t('logs.noLogs')}
              </div>
              <div className="log-empty-desc">
                {cleared ? '点击「恢复」重新开始接收日志' : '暂无匹配的日志条目'}
              </div>
            </div>
          ) : (
            displayLogs.map(log => (
              <div key={log.id} className="log-entry">
                <div className="log-ts">{formatTs(log.timestamp)}</div>
                <div>
                  <span className="log-level-badge" data-level={log.level.toUpperCase()}>
                    {log.level.toUpperCase()}
                  </span>
                </div>
                <div className="log-component">{log.component || '—'}</div>
                <div className="log-msg">{log.message}</div>
                <div className="log-channel">{log.channel || ''}</div>
              </div>
            ))
          )}
        </div>
      </div>
    </div>
  )
}
