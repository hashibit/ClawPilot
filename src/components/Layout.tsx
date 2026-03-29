import { useState, useEffect } from 'react'
import { Outlet, NavLink, useLocation } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { getProcessStatus, startOpenclaw, stopOpenclaw } from '../lib/api'
import type { ProcessStatus } from '../lib/api'
import { toast } from './Toast'

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
  const [acting, setActing] = useState(false)

  useEffect(() => {
    loadStatus()
    const id = setInterval(loadStatus, 10000)
    return () => clearInterval(id)
  }, [])

  const loadStatus = async () => {
    try {
      const s = await getProcessStatus()
      setProcess(s)
    } catch { /* ignore */ }
  }

  const handleToggleOpenclaw = async () => {
    if (!process || acting) return
    setActing(true)
    try {
      if (process.is_running) {
        await stopOpenclaw()
        toast(t('process.stoppedMsg'), 'success')
      } else {
        await startOpenclaw()
        toast(t('process.startedMsg'), 'success')
      }
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
        {/* Header */}
        <div className="toolbar" style={{ gap: '8px', padding: '0 10px', borderBottom: '1px solid rgba(255,255,255,0.08)', justifyContent: 'space-between', flexShrink: 0 }}>
          {!collapsed && (
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              <div className="logo-box">
                <svg width="13" height="13" fill="none" stroke="white" strokeWidth="2.2" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" d="M13 10V3L4 14h7v7l9-11h-7z"/></svg>
              </div>
              <span className="text-sm text-bold">{t('app.name')}</span>
            </div>
          )}
          {collapsed && (
            <div className="logo-box" style={{ margin: '0 auto' }}>
              <svg width="13" height="13" fill="none" stroke="white" strokeWidth="2.2" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" d="M13 10V3L4 14h7v7l9-11h-7z"/></svg>
            </div>
          )}
          {!collapsed && (
            <button
              onClick={() => setCollapsed(true)}
              title={t('common.collapse')}
              style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'rgba(255,255,255,0.4)', padding: '2px 4px', display: 'flex', alignItems: 'center', flexShrink: 0 }}
            >
              <svg width="14" height="14" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" d="M11 19l-7-7 7-7m8 14l-7-7 7-7"/></svg>
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
            <svg width="14" height="14" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" d="M13 5l7 7-7 7M5 5l7 7-7 7"/></svg>
          </button>
        )}

        <nav style={{ flex: 1, padding: '6px 6px', overflowY: 'auto', overflowX: 'hidden' }}>
          {!collapsed && <div className="section-label">{t('nav_sections.core')}</div>}
          <NavItem to="/overview" label={t('nav.overview')} icon={
            <svg fill="none" stroke="currentColor" strokeWidth="1.75" viewBox="0 0 24 24" width="16" height="16"><path strokeLinecap="round" strokeLinejoin="round" d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z"/></svg>
          } />
          <NavItem to="/opc" label={t('nav.opc')} icon={
            <svg fill="none" stroke="currentColor" strokeWidth="1.75" viewBox="0 0 24 24" width="16" height="16"><path strokeLinecap="round" strokeLinejoin="round" d="M3 12l2-2m0 0l7-7 7 7M5 10v10a1 1 0 001 1h3m10-11l2 2m-2-2v10a1 1 0 01-1 1h-3m-6 0a1 1 0 001-1v-4a1 1 0 011-1h2a1 1 0 011 1v4a1 1 0 001 1m-6 0h6"/></svg>
          } />
          <NavItem to="/agents" label={t('nav.agents')} icon={
            <svg fill="none" stroke="currentColor" strokeWidth="1.75" viewBox="0 0 24 24" width="16" height="16"><path strokeLinecap="round" strokeLinejoin="round" d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0zm6 3a2 2 0 11-4 0 2 2 0 014 0zM7 10a2 2 0 11-4 0 2 2 0 014 0z"/></svg>
          } />
          <NavItem to="/bindings" label={t('nav.bindings')} icon={
            <svg fill="none" stroke="currentColor" strokeWidth="1.75" viewBox="0 0 24 24" width="16" height="16"><path strokeLinecap="round" strokeLinejoin="round" d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z"/></svg>
          } />

          {!collapsed && <div className="section-label" style={{ marginTop: '6px' }}>{t('nav_sections.infra')}</div>}
          {collapsed && <div style={{ height: '6px' }} />}
          <NavItem to="/providers" label={t('nav.providers')} icon={
            <svg fill="none" stroke="currentColor" strokeWidth="1.75" viewBox="0 0 24 24" width="16" height="16"><path strokeLinecap="round" strokeLinejoin="round" d="M9 3H5a2 2 0 00-2 2v4m6-6h10a2 2 0 012 2v4M9 3v18m0 0h10a2 2 0 002-2V9M9 21H5a2 2 0 01-2-2V9m0 0h18"/></svg>
          } />
          <NavItem to="/office" label={t('nav.office')} icon={
            <svg fill="none" stroke="currentColor" strokeWidth="1.75" viewBox="0 0 24 24" width="16" height="16"><path strokeLinecap="round" strokeLinejoin="round" d="M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16m14 0h2m-2 0h-5m-9 0H3m2 0h5M9 7h1m-1 4h1m4-4h1m-1 4h1m-5 10v-5a1 1 0 011-1h2a1 1 0 011 1v5m-4 0h4"/></svg>
          } />

          {!collapsed && <div className="section-label" style={{ marginTop: '6px' }}>{t('nav_sections.deploy')}</div>}
          {collapsed && <div style={{ height: '6px' }} />}
          <NavItem to="/deploy" label={t('nav.deploy')} icon={
            <svg fill="none" stroke="currentColor" strokeWidth="1.75" viewBox="0 0 24 24" width="16" height="16"><path strokeLinecap="round" strokeLinejoin="round" d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12"/></svg>
          } />
          <NavItem to="/logs" label={t('nav.logs')} icon={
            <svg fill="none" stroke="currentColor" strokeWidth="1.75" viewBox="0 0 24 24" width="16" height="16"><path strokeLinecap="round" strokeLinejoin="round" d="M9 17v-2m3 2v-4m3 4v-6m2 10H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"/></svg>
          } />

          {!collapsed && <div className="section-label" style={{ marginTop: '6px' }}>{t('nav_sections.advanced')}</div>}
          {collapsed && <div style={{ height: '6px' }} />}
          <a href="#" className="nav-item" title={collapsed ? t('nav.templates') : undefined}>
            <span className="nav-icon ic-16" style={{ flexShrink: 0 }}>
              <svg fill="none" stroke="currentColor" strokeWidth="1.75" viewBox="0 0 24 24" width="16" height="16"><path strokeLinecap="round" strokeLinejoin="round" d="M19 11H5m14 0a2 2 0 012 2v6a2 2 0 01-2 2H5a2 2 0 01-2-2v-6a2 2 0 012-2m14 0V9a2 2 0 00-2-2M5 11V9a2 2 0 012-2m0 0V5a2 2 0 012-2h6a2 2 0 012 2v2M7 7h10"/></svg>
            </span>
            {!collapsed && <><span className="text-sm">{t('nav.templates')}</span><span className="pro-badge">{t('common.pro')}</span></>}
          </a>
          <a href="#" className="nav-item" title={collapsed ? t('nav.cloudSync') : undefined}>
            <span className="nav-icon ic-16" style={{ flexShrink: 0 }}>
              <svg fill="none" stroke="currentColor" strokeWidth="1.75" viewBox="0 0 24 24" width="16" height="16"><path strokeLinecap="round" strokeLinejoin="round" d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15"/></svg>
            </span>
            {!collapsed && <><span className="text-sm">{t('nav.cloudSync')}</span><span className="pro-badge">{t('common.pro')}</span></>}
          </a>

          {/* Settings */}
          {!collapsed && <div style={{ height: '6px' }} />}
          {collapsed && <div style={{ height: '6px' }} />}
          <NavItem to="/settings" label={t('nav.settings')} icon={
            <svg fill="none" stroke="currentColor" strokeWidth="1.75" viewBox="0 0 24 24" width="16" height="16"><path strokeLinecap="round" strokeLinejoin="round" d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z"/><path strokeLinecap="round" strokeLinejoin="round" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z"/></svg>
          } />
        </nav>

        {/* Status footer */}
        <div style={{ padding: collapsed ? '8px 6px' : '10px 10px', borderTop: '1px solid rgba(255,255,255,0.08)', flexShrink: 0 }}>
          {collapsed ? (
            <div
              title={process?.is_running ? `${t('process.running')} · PID ${process.pid}` : t('process.stopped')}
              style={{ display: 'flex', justifyContent: 'center' }}
            >
              <span style={{
                width: '8px', height: '8px', borderRadius: '50%', display: 'inline-block',
                background: process?.is_running ? '#34c759' : '#8E8E93',
              }} />
            </div>
          ) : (
            <>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '2px' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                  <span style={{
                    width: '7px', height: '7px', borderRadius: '50%', display: 'inline-block', flexShrink: 0,
                    background: process?.is_running ? '#34c759' : '#8E8E93',
                  }} />
                  <span style={{ fontSize: '12px', color: process?.is_running ? '#34c759' : '#8E8E93', fontWeight: 500 }}>
                    {process?.is_running
                      ? t('process.running')
                      : <><span style={{ color: 'rgba(255,255,255,0.85)', fontWeight: 700 }}>{t('process.localMachine')}</span> {t('process.stopped')}</>
                    }
                  </span>
                </div>
              </div>
              <div style={{ fontSize: '11px', color: 'rgba(255,255,255,0.5)', marginBottom: '7px' }}>
                {process?.is_running && process.pid != null
                  ? `PID ${process.pid}${process.uptime_seconds != null ? ` · ${fmtUptime(process.uptime_seconds, i18n.language)}` : ''}`
                  : t('process.notRunning')}
              </div>
              <button
                className="tbtn tbtn-ghost"
                style={{ width: '100%', textAlign: 'center', opacity: acting ? 0.5 : 1 }}
                onClick={handleToggleOpenclaw}
                disabled={acting}
              >
                {acting ? t('process.acting') : process?.is_running ? t('process.stop') : t('process.start')}
              </button>
            </>
          )}
        </div>
      </aside>

      {isOverviewPage ? (
        <main style={{ flex: 1, overflow: 'hidden', display: 'flex', flexDirection: 'column' }}>
          <div className="toolbar" style={{ justifyContent: 'space-between' }}>
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
