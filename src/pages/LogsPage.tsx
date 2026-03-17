import { useEffect, useRef, useState } from 'react'
import { getLogs } from '../lib/api'
import { toast } from '../components/Toast'
import type { LogEntry } from '../lib/types'

const LOG_LEVELS = ['INFO', 'WARN', 'ERROR', 'DEBUG', 'SYSTEM']

function levelClass(level: string): string {
  const l = level.toUpperCase()
  if (l === 'ERROR') return 'log-line error'
  if (l === 'WARN') return 'log-line warn'
  if (l === 'INFO') return 'log-line info'
  if (l === 'DEBUG') return 'log-line debug'
  return 'log-line system'
}

function formatTs(ts: number): string {
  return new Date(ts).toLocaleString('zh-CN', {
    year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit', second: '2-digit',
    hour12: false,
  }).replace(/\//g, '-')
}

export default function LogsPage() {
  const [logs, setLogs] = useState<LogEntry[]>([])
  const [displayLogs, setDisplayLogs] = useState<LogEntry[]>([])
  const [filterLevel, setFilterLevel] = useState<string>('')
  const [filterComponent, setFilterComponent] = useState<string>('')
  const [enabledLevels, setEnabledLevels] = useState<Set<string>>(new Set(LOG_LEVELS))
  const [cleared, setCleared] = useState(false)
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

  // Apply level filter on top of fetched logs
  useEffect(() => {
    if (cleared) {
      setDisplayLogs([])
      return
    }
    setDisplayLogs(logs.filter(log => enabledLevels.has(log.level.toUpperCase())))
  }, [logs, enabledLevels, cleared])

  // Auto-scroll to bottom when new logs arrive
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
    <>
      {/* Log stream */}
      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden', minWidth: 0 }}>
        <div className="toolbar" style={{ justifyContent: 'space-between' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <span style={{ fontSize: '15px', fontWeight: 600 }}>运行日志</span>
            <span style={{ fontSize: '11px', color: '#636366' }}>实时流</span>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
            {!cleared && (
              <div style={{ display: 'flex', alignItems: 'center', gap: '5px', padding: '2px 8px', background: 'rgba(52,199,89,0.12)', borderRadius: '5px' }}>
                <span className="pulse-dot" style={{ width: '5px', height: '5px', borderRadius: '50%', background: '#34c759', display: 'inline-block' }}></span>
                <span style={{ fontSize: '11px', color: '#34c759' }}>实时</span>
              </div>
            )}
            {cleared ? (
              <button className="tbtn tbtn-ghost" style={{ padding: '2px 8px' }} onClick={handleResume}>
                恢复
              </button>
            ) : (
              <button className="tbtn tbtn-ghost" style={{ padding: '2px 8px' }} onClick={handleClear}>
                清空
              </button>
            )}
          </div>
        </div>
        <div
          ref={streamRef}
          className="log-stream"
          style={{ flex: 1, overflowY: 'auto', background: '#161618', padding: '10px 14px' }}
        >
          {displayLogs.length === 0 ? (
            <div style={{ fontSize: '12px', color: '#636366', padding: '8px 0' }}>
              {cleared ? '日志已清空（本地）' : '暂无日志'}
            </div>
          ) : (
            displayLogs.map(log => (
              <div key={log.id} className={levelClass(log.level)}>
                [{formatTs(log.timestamp)}] [{log.level.padEnd(7)}]
                {log.component ? ` [${log.component}]` : ''}
                {log.channel ? ` [${log.channel}]` : ''}
                {' '}{log.message}
              </div>
            ))
          )}
        </div>
      </div>

      {/* Filters panel */}
      <div style={{ width: '168px', borderLeft: '1px solid rgba(255,255,255,0.08)', display: 'flex', flexDirection: 'column', overflow: 'hidden', flexShrink: 0 }}>
        <div className="toolbar" style={{ justifyContent: 'flex-start' }}>
          <span style={{ fontSize: '12px', fontWeight: 500, color: '#EBEBF5' }}>过滤</span>
        </div>
        <div style={{ flex: 1, overflowY: 'auto', padding: '8px 12px' }}>
          <div className="section-label" style={{ padding: '0 0 5px' }}>日志级别</div>
          {LOG_LEVELS.map(level => {
            const colorMap: Record<string, string> = {
              INFO: 'rgba(235,235,245,0.85)',
              WARN: '#f59e0b',
              ERROR: '#f43f5e',
              DEBUG: '#636366',
              SYSTEM: '#a78bfa',
            }
            return (
              <label key={level} className="filter-check">
                <input
                  type="checkbox"
                  className="mac-check"
                  checked={enabledLevels.has(level)}
                  onChange={() => toggleLevel(level)}
                />
                <span style={{ color: colorMap[level] ?? 'rgba(235,235,245,0.85)' }}>{level}</span>
              </label>
            )
          })}

          <div className="section-label" style={{ padding: '10px 0 5px' }}>组件过滤</div>
          <input
            type="text"
            value={filterComponent}
            onChange={e => setFilterComponent(e.target.value)}
            placeholder="组件名称..."
            className="field-input"
            style={{ width: '100%', fontSize: '11px', padding: '4px 8px' }}
          />

          <div className="section-label" style={{ padding: '10px 0 5px' }}>级别过滤</div>
          <select
            value={filterLevel}
            onChange={e => setFilterLevel(e.target.value)}
            className="field-input"
            style={{ width: '100%', fontSize: '11px', padding: '4px 8px' }}
          >
            <option value="">全部</option>
            {LOG_LEVELS.map(l => (
              <option key={l} value={l}>{l}</option>
            ))}
          </select>

          <div style={{ marginTop: '12px', fontSize: '11px', color: '#636366' }}>
            共 {displayLogs.length} 条
          </div>
        </div>
      </div>
    </>
  )
}
