import { useEffect, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { getLogs } from '../lib/api'
import { toast } from '../components/Toast'
import type { LogEntry } from '../lib/types'

const LOG_LEVELS = ['INFO', 'WARN', 'ERROR', 'DEBUG', 'SYSTEM']

function tagClass(level: string): string {
  const l = level.toUpperCase()
  if (l === 'ERROR') return 'tag danger'
  if (l === 'WARN') return 'tag warn'
  if (l === 'INFO') return 'tag accent'
  if (l === 'DEBUG') return 'tag'
  return 'tag'
}

function formatTs(ts: number): string {
  return new Date(ts).toLocaleString('zh-CN', {
    year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit', second: '2-digit',
    hour12: false,
  }).replace(/\//g, '-')
}

export default function LogsPage() {
  const { t } = useTranslation()
  const [logs, setLogs] = useState<LogEntry[]>([])
  const [displayLogs, setDisplayLogs] = useState<LogEntry[]>([])
  const [filterLevel, setFilterLevel] = useState<string>('')
  const [filterComponent, setFilterComponent] = useState<string>('')
  const [enabledLevels, setEnabledLevels] = useState<Set<string>>(new Set(LOG_LEVELS))
  const [cleared, setCleared] = useState(false)
  const [search, setSearch] = useState('')
  const streamRef = useRef<HTMLDivElement>(null)
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null)

  const fetchLogs = async () => {
    try {
      const entries = await getLogs(filterLevel || undefined, filterComponent || undefined, 200)
      if (!cleared) {
        setLogs(entries)
      }
    } catch (e) {
      toast(String(e), 'error')
    }
  }

  useEffect(() => {
    fetchLogs()
    intervalRef.current = setInterval(fetchLogs, 3000)
    return () => {
      if (intervalRef.current) clearInterval(intervalRef.current)
    }
  }, [filterLevel, filterComponent])

  useEffect(() => {
    if (cleared) {
      setDisplayLogs([])
      return
    }
    const filtered = logs.filter(log => {
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
    setDisplayLogs(filtered)
  }, [logs, enabledLevels, cleared, search])

  useEffect(() => {
    const el = streamRef.current
    if (el) el.scrollTop = el.scrollHeight
  }, [displayLogs])

  const toggleLevel = (level: string) => {
    setEnabledLevels(prev => {
      const next = new Set(prev)
      if (next.has(level)) next.delete(level)
      else next.add(level)
      return next
    })
  }

  const handleClear = () => {
    setCleared(true)
    setDisplayLogs([])
  }

  const handleResume = () => {
    setCleared(false)
  }

  return (
    <div className="log-page fade-in">
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end' }}>
        <div>
          <h1 className="page-title">{t('logs.title')}</h1>
          <p className="page-sub">操作审计 · 按时间倒序</p>
        </div>
        <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
          <input
            className="search-input"
            style={{ width: 240 }}
            placeholder="搜索日志…"
            value={search}
            onChange={e => setSearch(e.target.value)}
          />
          {LOG_LEVELS.map(level => (
            <button
              key={level}
              onClick={() => toggleLevel(level)}
              className={enabledLevels.has(level) ? tagClass(level) : 'tag'}
              style={{ cursor: 'pointer', opacity: enabledLevels.has(level) ? 1 : 0.4 }}
            >
              {level}
            </button>
          ))}
          {cleared ? (
            <button className="btn btn-sm" onClick={handleResume}>{t('logs.resume')}</button>
          ) : (
            <button className="btn btn-sm" onClick={handleClear}>{t('logs.clear')}</button>
          )}
        </div>
      </div>

      <div className="log-list" ref={streamRef} style={{ flex: 1, overflowY: 'auto' }}>
        {/* Header row */}
        <div
          className="log-row"
          style={{
            background: 'var(--bg-canvas)',
            fontWeight: 600,
            color: 'var(--text-tertiary)',
            fontSize: 11,
            letterSpacing: '0.05em',
            textTransform: 'uppercase',
          }}
        >
          <div>时间</div>
          <div>级别</div>
          <div>组件</div>
          <div>消息</div>
          <div style={{ textAlign: 'right' }}>频道</div>
        </div>

        {displayLogs.length === 0 ? (
          <div style={{ padding: '24px 14px', fontSize: 12, color: 'var(--text-muted)' }}>
            {cleared ? t('logs.cleared') : t('logs.noLogs')}
          </div>
        ) : (
          displayLogs.map(log => (
            <div key={log.id} className="log-row">
              <div className="log-time">{formatTs(log.timestamp)}</div>
              <div><span className={tagClass(log.level)}>{log.level}</span></div>
              <div>{log.component || '—'}</div>
              <div style={{ color: 'var(--text-secondary)' }}>{log.message}</div>
              <div style={{ textAlign: 'right', color: 'var(--text-muted)' }}>{log.channel || ''}</div>
            </div>
          ))
        )}
      </div>
    </div>
  )
}
