import { useState, useEffect } from 'react'
import { Outlet, NavLink, useLocation, useNavigate } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { getProcessStatus, restartOpenclaw } from '../lib/api'
import type { ProcessStatus } from '../lib/api'
import { useOpc } from '../contexts/OpcContext'
import { toast } from './Toast'
import { Icon } from './Icon'
import { formatUptime } from '../lib/formatting'

// Pages inside a company space
const COMPANY_PATHS = ['/agents', '/bindings', '/deploy']

export default function Layout() {
  const { t, i18n } = useTranslation()
  const location = useLocation()
  const navigate = useNavigate()
  const { opcs, currentOpc, selectOpc } = useOpc()
  const [collapsed, setCollapsed] = useState(false)
  const [process, setProcess] = useState<ProcessStatus | null>(null)
  const [processLoading, setProcessLoading] = useState(true)
  const [acting, setActing] = useState(false)

  const inCompany = COMPANY_PATHS.some(p => location.pathname.startsWith(p))
  const statusColor = processLoading && !process ? 'var(--warning)' : process?.is_running ? 'var(--success)' : 'var(--text-dimmer)'
  const sidebarWidth = collapsed ? '48px' : '204px'

  useEffect(() => {
    loadStatus(true)
    const id = setInterval(() => loadStatus(false), 120000)
    return () => clearInterval(id)
  }, [])

  const loadStatus = async (isInitial = false) => {
    if (isInitial) setProcessLoading(true)
    try { setProcess(await getProcessStatus()) }
    catch { setProcess(null) }
    finally { if (isInitial) setProcessLoading(false) }
  }

  const handleRestart = async () => {
    if (acting) return
    setActing(true)
    try {
      await restartOpenclaw()
      toast(t('process.restartedMsg'), 'success')
      await loadStatus()
    } catch (e) { toast(String(e), 'error') }
    finally { setActing(false) }
  }

  const handleEnterOpc = (opc: typeof opcs[0]) => {
    selectOpc(opc)
    navigate('/agents')
  }

  const NavItem = ({ to, icon, label }: { to: string; icon: React.ReactNode; label: string }) => (
    <NavLink to={to} className={({ isActive }) => `nav-item${isActive ? ' active' : ''}`} title={collapsed ? label : undefined}>
      <span className="nav-icon ic-18" style={{ flexShrink: 0 }}>{icon}</span>
      {!collapsed && <span className="text-sm">{label}</span>}
    </NavLink>
  )

  return (
    <div style={{ display: 'flex', height: '100vh', width: '100vw' }}>
      <aside className="sidebar" style={{ width: sidebarWidth, transition: 'width 0.2s ease', overflow: 'hidden' }}>
        {/* Header */}
        <div data-tauri-drag-region className="toolbar sidebar-header">
          {inCompany ? (
            /* Company space: show back button */
            !collapsed ? (
              <button
                onClick={() => navigate('/companies')}
                style={{
                  background: 'none', border: 'none', cursor: 'pointer',
                  display: 'flex', alignItems: 'center', gap: '6px',
                  color: 'var(--text-secondary)', fontSize: '13px', padding: 0,
                  fontFamily: 'inherit',
                }}
              >
                <Icon name="arrow-left" size={14} />
                <span>{t('nav.back_home', '返回首页')}</span>
              </button>
            ) : (
              <button className="sidebar-toggle" onClick={() => navigate('/companies')} title={t('nav.back_home', '返回首页')} style={{ margin: '0 auto' }}>
                <Icon name="arrow-left" size={14} />
              </button>
            )
          ) : (
            /* Global: show logo */
            <>
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
              {/* collapse button moved to sidebar footer */}
            </>
          )}
        </div>

        {collapsed && (
          <button
            className="sidebar-toggle"
            onClick={() => setCollapsed(false)}
            title={t('common.expand')}
            style={{ padding: '6px', justifyContent: 'center', width: '100%', borderBottom: '1px solid var(--border-subtle)' }}
          >
            <Icon name="chevron-right" size={14} />
          </button>
        )}

        {/* ── Sidebar content ── */}
        <div style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
          {inCompany ? (
            /* ── Company space: back + name + nav ── */
            <>
              {currentOpc && !collapsed && (
                <div style={{ padding: '8px 10px', display: 'flex', alignItems: 'center', gap: '8px' }}>
                  <div className="avatar avatar-md" style={{ background: currentOpc.avatar_color ?? 'var(--accent)' }}>
                    {currentOpc.avatar_initials ?? currentOpc.display_name.slice(0, 1)}
                  </div>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div className="text-sm text-bold" style={{ whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                      {currentOpc.display_name}
                    </div>
                    <div className="text-xxs" style={{ color: currentOpc.is_running ? 'var(--success)' : 'var(--text-dimmer)' }}>
                      {currentOpc.is_running ? t('common.status_running') : t('common.status_stopped')}
                    </div>
                  </div>
                </div>
              )}

              <nav className="sidebar-nav">
                <NavItem to="/agents" label={t('nav.agents')} icon={<Icon name="users" size={18} />} />
                <NavItem to="/bindings" label={t('nav.bindings')} icon={<Icon name="message" size={18} />} />
                <NavItem to="/deploy" label={t('nav.deploy')} icon={<Icon name="download" size={18} />} />
              </nav>
            </>
          ) : (
            /* ── Home: global nav + company list label ── */
            <>
              <nav className="sidebar-nav" style={{ flex: 'none' }}>
                <NavItem to="/overview" label={t('nav.overview')} icon={<Icon name="chart" size={18} />} />
                <NavItem to="/companies" label={t('nav.company_list', '公司列表')} icon={<Icon name="grid" size={18} />} />
                <NavItem to="/providers" label={t('nav.providers')} icon={<Icon name="cloud" size={18} />} />
                <NavItem to="/office" label={t('nav.office')} icon={<Icon name="building" size={18} />} />
                <NavItem to="/logs" label={t('nav.logs')} icon={<Icon name="file" size={18} />} />
                <NavItem to="/activities" label={t('nav.activities', 'Activities')} icon={<Icon name="activity" size={18} />} />
                <NavItem to="/settings" label={t('nav.settings')} icon={<Icon name="settings" size={18} />} />
              </nav>
            </>
          )}
        </div>

        {/* Collapse toggle — only on global pages */}
        {!inCompany && !collapsed && (
          <div style={{ padding: '0 6px 4px' }}>
            <button
              className="nav-item"
              onClick={() => setCollapsed(true)}
              style={{ width: '100%', border: 'none', background: 'none', cursor: 'pointer', fontFamily: 'inherit' }}
            >
              <span className="nav-icon ic-18" style={{ flexShrink: 0 }}><Icon name="menu" size={18} /></span>
              <span className="text-sm">{t('common.collapse', '收起侧栏')}</span>
            </button>
          </div>
        )}

        {/* Status footer */}
        <div className={collapsed ? 'sidebar-footer-collapsed' : 'sidebar-footer'}>
          {collapsed ? (
            <div title={process?.is_running ? `PID ${process.pid}` : t('process.stopped')} style={{ display: 'flex', justifyContent: 'center' }}>
              <span style={{ width: '8px', height: '8px', borderRadius: '50%', display: 'inline-block', background: statusColor }} />
            </div>
          ) : (
            <>
              <div style={{ display: 'flex', alignItems: 'center', gap: '6px', marginBottom: '2px' }}>
                <span style={{ width: '7px', height: '7px', borderRadius: '50%', display: 'inline-block', flexShrink: 0, background: statusColor }} />
                <span style={{ fontSize: '12px', color: statusColor, fontWeight: 500 }}>
                  {processLoading && !process ? t('process.checking')
                    : process?.is_running ? t('process.running')
                    : process?.daemon_available === false ? `${t('process.localMachine')} ${t('process.stopped')}`
                    : `${t('process.localMachine')} ${t('process.unknown')}`}
                </span>
              </div>
              <div style={{ fontSize: '11px', color: 'var(--text-tertiary)', marginBottom: '7px' }}>
                {processLoading && !process ? t('process.checkingDesc')
                  : process?.is_running && process.pid != null
                    ? `PID ${process.pid}${process.uptime_seconds != null ? ` · ${formatUptime(process.uptime_seconds, i18n.language)}` : ''}`
                    : process?.daemon_available === false ? 'daemon 未运行' : t('process.notRunning')}
              </div>
              <button
                className="tbtn tbtn-ghost"
                style={{ width: '100%', textAlign: 'center', opacity: (acting || (processLoading && !process)) ? 0.5 : 1 }}
                onClick={handleRestart}
                disabled={acting || (processLoading && !process)}
              >
                {acting ? t('process.acting') : (processLoading && !process) ? t('process.checking') : t('process.restart')}
              </button>
            </>
          )}
        </div>
      </aside>

      {/* Content */}
      <div style={{ flex: 1, display: 'flex', overflow: 'hidden' }}>
        <Outlet />
      </div>
    </div>
  )
}
