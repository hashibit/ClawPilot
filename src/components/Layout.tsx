import { useState, useEffect } from 'react'
import { Outlet, NavLink, useLocation } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { getProcessStatus, restartOpenclaw } from '../lib/api'
import type { ProcessStatus } from '../lib/api'
import { toast } from './Toast'
import { Icon } from './Icon'

function fmtUptime(seconds: number, lang: string) {
  const h = Math.floor(seconds / 3600)
  const m = Math.floor((seconds % 3600) / 60)
  if (lang === 'zh-CN') {
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
  return `${m}m`
}

export default function Layout() {
  const { t, i18n } = useTranslation()
  const location = useLocation()
  const isOverviewPage = location.pathname === '/overview' || location.pathname === '/'
  const [collapsed, setCollapsed] = useState(false)
  const [process, setProcess] = useState<ProcessStatus | null>(null)
  const [processLoading, setProcessLoading] = useState(true)
  const [acting, setActing] = useState(false)

  useEffect(() => {
    loadStatus(true) // initial load with loading indicator
    const id = setInterval(() => loadStatus(false), 120000) // silent refresh
    return () => clearInterval(id)
  }, [])

  const loadStatus = async (isInitial = false) => {
    if (isInitial) setProcessLoading(true)
    try {
      const s = await getProcessStatus()
      setProcess(s)
    } catch {
      setProcess(null)
    } finally {
      if (isInitial) setProcessLoading(false)
    }
  }

  const handleToggleOpenclaw = async () => {
    if (acting) return
    setActing(true)
    try {
      await restartOpenclaw()
      toast(t('process.restartedMsg'), 'success')
      await loadStatus()
    } catch (e) {
      toast(String(e), 'error')
    } finally {
      setActing(false)
    }
  }

  const sidebarWidth = collapsed ? '48px' : '204px'

  const NavItem = ({ to, icon, label, badge }: { to: string; icon: React.ReactNode; label: string; badge?: string }) => (
    <NavLink to={to} className={({ isActive }) => `nav-item${isActive ? ' active' : ''}`} title={collapsed ? label : undefined}>
      <span className="nav-icon ic-16" style={{ flexShrink: 0 }}>{icon}</span>
      {!collapsed && <span className="text-sm">{label}</span>}
      {!collapsed && badge && <span className="pro-badge">{badge}</span>}
    </NavLink>
  )

  return (
    <div style={{ display: 'flex', height: '100vh', width: '100vw' }}>
      <aside className="sidebar" style={{ width: sidebarWidth, transition: 'width 0.2s ease', overflow: 'hidden' }}>
        {/* Header — also serves as window drag region (titleBarStyle: Overlay) */}
        <div data-tauri-drag-region className="toolbar" style={{ gap: '8px', padding: '28px 10px 0', height: 'auto', minHeight: '74px', borderBottom: '1px solid rgba(255,255,255,0.08)', justifyContent: 'space-between', flexShrink: 0, alignItems: 'center' }}>
          {!collapsed && (
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              <div className="logo-box">
                <Icon name="bolt" size={13} stroke="white" strokeWidth={2.2} />
              </div>
              <span className="text-sm text-bold">{t('app.name')}</span>
            </div>
          )}
          {collapsed && (
            <div className="logo-box" style={{ margin: '0 auto' }}>
              <Icon name="bolt" size={13} stroke="white" strokeWidth={2.2} />
            </div>
          )}
          {!collapsed && (
            <button
              onClick={() => setCollapsed(true)}
              title={t('common.collapse')}
              style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'rgba(255,255,255,0.4)', padding: '2px 4px', display: 'flex', alignItems: 'center', flexShrink: 0 }}
            >
              <Icon name="chevron-left" size={14} />
            </button>
          )}
        </div>

        {/* Expand button when collapsed */}
        {collapsed && (
          <button
            onClick={() => setCollapsed(false)}
            title={t('common.expand')}
            style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'rgba(255,255,255,0.4)', padding: '6px', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0, borderBottom: '1px solid rgba(255,255,255,0.06)' }}
          >
            <Icon name="chevron-right" size={14} />
          </button>
        )}

        <nav style={{ flex: 1, padding: '6px 6px', overflowY: 'auto', overflowX: 'hidden' }}>
          {!collapsed && <div className="section-label">{t('nav_sections.core')}</div>}
          <NavItem to="/overview" label={t('nav.overview')} icon={
            <Icon name="chart" size={16} />
          } />
          <NavItem to="/opc" label={t('nav.opc')} icon={
            <Icon name="grid" size={16} />
          } />
          <NavItem to="/agents" label={t('nav.agents')} icon={
            <Icon name="users" size={16} />
          } />
          <NavItem to="/bindings" label={t('nav.bindings')} icon={
            <Icon name="message" size={16} />
          } />

          {!collapsed && <div className="section-label" style={{ marginTop: '6px' }}>{t('nav_sections.infra')}</div>}
          {collapsed && <div style={{ height: '6px' }} />}
          <NavItem to="/providers" label={t('nav.providers')} icon={
            <Icon name="cloud" size={16} />
          } />
          <NavItem to="/office" label={t('nav.office')} icon={
            <Icon name="building" size={16} />
          } />

          {!collapsed && <div className="section-label" style={{ marginTop: '6px' }}>{t('nav_sections.deploy')}</div>}
          {collapsed && <div style={{ height: '6px' }} />}
          <NavItem to="/deploy" label={t('nav.deploy')} icon={
            <Icon name="download" size={16} />
          } />
          <NavItem to="/logs" label={t('nav.logs')} icon={
            <Icon name="file" size={16} />
          } />
          <NavItem to="/activities" label={t('nav.activities', 'Activities')} icon={
            <Icon name="activity" size={16} />
          } />

          {/* Settings */}
          {!collapsed && <div style={{ height: '6px' }} />}
          {collapsed && <div style={{ height: '6px' }} />}
          <NavItem to="/settings" label={t('nav.settings')} icon={
            <Icon name="settings" size={16} />
          } />
        </nav>

        {/* Status footer */}
        <div style={{ padding: collapsed ? '8px 6px' : '10px 10px', borderTop: '1px solid rgba(255,255,255,0.08)', flexShrink: 0 }}>
          {collapsed ? (
            <div
              title={processLoading && !process ? t('process.checking') : process?.is_running ? `${t('process.running')} · PID ${process.pid}` : t('process.stopped')}
              style={{ display: 'flex', justifyContent: 'center' }}
            >
              <span style={{
                width: '8px', height: '8px', borderRadius: '50%', display: 'inline-block',
                background: processLoading && !process ? '#f59e0b' : process?.is_running ? '#34c759' : '#8E8E93',
              }} />
            </div>
          ) : (
            <>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '2px' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                  <span style={{
                    width: '7px', height: '7px', borderRadius: '50%', display: 'inline-block', flexShrink: 0,
                    background: processLoading && !process ? '#f59e0b' : process?.is_running ? '#34c759' : '#8E8E93',
                  }} />
                  <div style={{ display: 'flex', flexDirection: 'column' }}>
                    <span style={{ fontSize: '12px', color: processLoading && !process ? '#f59e0b' : process?.is_running ? '#34c759' : '#8E8E93', fontWeight: 500 }}>
                      {processLoading && !process
                        ? t('process.checking')
                        : process?.is_running
                          ? t('process.running')
                          : process?.daemon_available === false
                            ? `${t('process.localMachine')} ${t('process.stopped')}`
                            : `${t('process.localMachine')} ${t('process.unknown')}`
                      }
                    </span>
                    {process?.daemon_available === false && (
                      <span style={{ fontSize: '10px', color: '#f59e0b', marginTop: '2px' }}>daemon 未运行</span>
                    )}
                  </div>
                </div>
              </div>
              <div style={{ fontSize: '11px', color: 'rgba(255,255,255,0.5)', marginBottom: '7px' }}>
                {processLoading && !process
                  ? t('process.checkingDesc')
                  : process?.is_running && process.pid != null
                    ? `PID ${process.pid}${process.uptime_seconds != null ? ` · ${fmtUptime(process.uptime_seconds, i18n.language)}` : ''}`
                    : process?.daemon_available === false
                      ? 'daemon 未运行，无法获取进程状态'
                      : t('process.notRunning')}
              </div>
              <button
                className="tbtn tbtn-ghost"
                style={{ width: '100%', textAlign: 'center', opacity: (acting || (processLoading && !process)) ? 0.5 : 1 }}
                onClick={handleToggleOpenclaw}
                disabled={acting || (processLoading && !process)}
              >
                {acting ? t('process.acting') : (processLoading && !process) ? t('process.checking') : t('process.restart')}
              </button>
            </>
          )}
        </div>
      </aside>

      {isOverviewPage ? (
        <main style={{ flex: 1, overflow: 'hidden', display: 'flex', flexDirection: 'column' }}>
          <div data-tauri-drag-region className="toolbar" style={{ justifyContent: 'space-between' }}>
            <span style={{ fontSize: '15px', fontWeight: 600 }}>{t('overview.title')}</span>
            <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
              <button className="tbtn tbtn-ghost" style={{ fontSize: '12px' }}>{t('overview.today')}</button>
              <button className="tbtn tbtn-ghost" style={{ fontSize: '12px' }}>{t('overview.thisWeek')}</button>
              <button className="tbtn tbtn-accent" style={{ fontSize: '12px' }}>{t('overview.thisMonth')}</button>
            </div>
          </div>
          <Outlet />
        </main>
      ) : (
        <div style={{ flex: 1, display: 'flex', overflow: 'hidden' }}>
          <Outlet />
        </div>
      )}
    </div>
  )
}
