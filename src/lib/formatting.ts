/**
 * Format a duration in seconds as human-readable uptime string
 */
export function formatUptime(seconds: number | null, lang: string): string {
  if (seconds === null) return '—'
  if (seconds < 60) return `${seconds}s`
  const h = Math.floor(seconds / 3600)
  const m = Math.floor((seconds % 3600) / 60)
  if (lang === 'zh-CN' || lang === 'zh-TW') {
    if (h > 0) return `${h}小时${m}分`
    return `${m}分钟`
  }
  if (lang === 'ja') {
    if (h > 0) return `${h}時間${m}分`
    return `${m}分`
  }
  if (lang === 'ko') {
    if (h > 0) return `${h}시간 ${m}분`
    return `${m}분`
  }
  if (h > 0) return `${h}h ${m}m`
  return `${m}m ${seconds % 60}s`
}

/**
 * Format a unix timestamp as relative time ("3 minutes ago", "2 hours ago")
 * @param ts Unix timestamp in seconds
 * @param t i18n translation function
 */
export function formatRelativeTime(ts: number, t: (key: string, opts?: Record<string, unknown>) => string): string {
  const diff = Math.floor(Date.now() / 1000) - ts
  const minutes = Math.floor(diff / 60)
  const hours = Math.floor(diff / 3600)
  const days = Math.floor(diff / 86400)
  if (days > 0) return t('common.time_days_ago', { count: days })
  if (hours > 0) return t('common.time_hours_ago', { count: hours })
  if (minutes > 0) return t('common.time_minutes_ago', { count: minutes })
  return t('common.time_just_now')
}
