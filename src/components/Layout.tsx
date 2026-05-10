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

const PAGE_LABELS: Record<string, string> = {
  '/overview': '数据概览',
  '/companies': '公司列表',
  '/providers': '模型管理',
  '/office': '办公室管理',
  '/logs': '运行日志',
  '/activities': '实时活动',
  '/settings': '设置',
  '/agents': '智能体管理',
  '/bindings': '渠道端管理',
  '/deploy': '一键部署',
}

function useIsMobile(breakpoint = 768) {
  const [isMobile, setIsMobile] = useState(() => window.innerWidth <= breakpoint)
  useEffect(() => {
    const mq = window.matchMedia(`(max-width: ${breakpoint}px)`)
    const handler = (e: MediaQueryListEvent) => setIsMobile(e.matches)
    mq.addEventListener('change', handler)
    return () => mq.removeEventListener('change', handler)
  }, [breakpoint])
  return isMobile
}

export default function Layout() {
  const { t, i18n } = useTranslation()
  const location = useLocation()
  const navigate = useNavigate()
  const { opcs, currentOpc, selectOpc } = useOpc()
  const [collapsed, setCollapsed] = useState(false)
  const [process, setProcess] = useState<ProcessStatus | null>(null)
  const [processLoading, setProcessLoading] = useState(true)
  const [acting, setActing] = useState(false)
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false)
  const isMobile = useIsMobile()

  const inCompany = COMPANY_PATHS.some(p => location.pathname.startsWith(p))
  const statusColor = processLoading && !process ? 'var(--warning)' : process?.is_running ? 'var(--success)' : 'var(--text-dimmer)'
  const sidebarWidth = collapsed ? '48px' : '232px'

  const currentPageLabel = PAGE_LABELS[location.pathname] || ''

  useEffect(() => {
    if (isMobile) setMobileMenuOpen(false)
  }, [location.pathname, isMobile])

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

  const showLabels = isMobile || !collapsed

  const NavItem = ({ to, icon, label, count }: { to: string; icon: React.ReactNode; label: string; count?: number }) => (
    <NavLink to={to} className={({ isActive }) => `nav-item${isActive ? ' active' : ''}`} title={!showLabels ? label : undefined} style={!showLabels ? { justifyContent: 'center', padding: '8px' } : undefined}>
      <span className="nav-icon ic-18" style={{ flexShrink: 0 }}>{icon}</span>
      {showLabels && <span className="text-sm">{label}</span>}
      {showLabels && count != null && <span style={{ marginLeft: 'auto', fontSize: '11px', color: 'var(--text-tertiary)', fontVariantNumeric: 'tabular-nums' }}>{count}</span>}
    </NavLink>
  )

  return (
    <div className="app" style={{ display: 'grid', gridTemplateColumns: isMobile ? '1fr' : `${sidebarWidth} 1fr`, height: '100vh', width: '100vw', overflow: 'hidden', background: 'var(--bg-base)', transition: 'grid-template-columns 0.2s ease' }}>
      {/* Mobile sidebar overlay */}
      <div
        className={`sidebar-overlay${mobileMenuOpen ? ' visible' : ''}`}
        onClick={() => setMobileMenuOpen(false)}
      />

      {/* ── Sidebar ── */}
      <aside
        className={`sidebar${mobileMenuOpen ? ' mobile-open' : ''}`}
        style={isMobile ? undefined : { width: sidebarWidth, transition: 'width 0.2s ease', overflow: 'hidden', ...(collapsed ? { padding: '14px 4px 12px', alignItems: 'center' } : {}) }}
      >
        {/* Brand */}
        <div data-tauri-drag-region style={{ display: 'flex', alignItems: 'center', gap: '10px', padding: '4px 10px 12px', borderBottom: '1px solid var(--border-subtle)', marginBottom: '4px' }}>
          {showLabels ? (
            <>
              <div className="logo-box" style={{ fontWeight: 700, fontSize: '14px', color: 'var(--text-on-accent)', letterSpacing: '-0.04em' }}>
                CP
              </div>
              <div>
                <div style={{ fontWeight: 600, fontSize: '14.5px', letterSpacing: '-0.015em' }}>ClawPilot</div>
                <div style={{ fontSize: '11px', color: 'var(--text-tertiary)', marginTop: '1px' }}>v0.4.2</div>
              </div>
            </>
          ) : (
            <div className="logo-box" style={{ margin: '0 auto', fontWeight: 700, fontSize: '12px', color: 'var(--text-on-accent)', letterSpacing: '-0.04em' }}>
              CP
            </div>
          )}
        </div>

        {/* Company context */}
        {inCompany && showLabels && (
          <>
            <div
              className="back-home"
              onClick={() => navigate('/companies')}
              style={{ display: 'flex', alignItems: 'center', gap: '8px', padding: '8px 10px', marginBottom: '4px', borderRadius: 'var(--radius-md)', fontSize: '12.5px', color: 'var(--text-secondary)', border: '1px dashed var(--border-default)', cursor: 'pointer' }}
            >
              <Icon name="home" size={14} />
              <span>{t('nav.back_home', '返回全局')}</span>
            </div>
            {currentOpc && (
              <div className="opc-switcher" style={{ cursor: 'default' }}>
                <div className="avatar avatar-md" style={{ background: currentOpc.avatar_color ?? 'var(--accent)', borderRadius: '7px' }}>
                  {currentOpc.avatar_initials ?? currentOpc.display_name.slice(0, 1)}
                </div>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: '10.5px', color: 'var(--text-tertiary)', letterSpacing: '0.06em', textTransform: 'uppercase' as const }}>公司空间</div>
                  <div style={{ fontSize: '13px', fontWeight: 600, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                    {currentOpc.display_name}
                  </div>
                </div>
              </div>
            )}
          </>
        )}

        {/* Collapsed: back button */}
        {inCompany && !showLabels && (
          <button className="sidebar-toggle" onClick={() => navigate('/companies')} title={t('nav.back_home', '返回全局')} style={{ margin: '0 auto', padding: '8px' }}>
            <Icon name="arrow-left" size={14} />
          </button>
        )}

        {/* Nav section label */}
        {showLabels && <div className="section-label">{inCompany ? '工作区' : '全局'}</div>}

        {/* Navigation */}
        <div style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
          {inCompany ? (
            <nav className="sidebar-nav">
              <NavItem to="/agents" label={t('nav.agents')} icon={<Icon name="users" size={16} />} count={currentOpc?.agent_count || undefined} />
              <NavItem to="/bindings" label={t('nav.bindings')} icon={<Icon name="message" size={16} />} count={currentOpc?.channel_count || undefined} />
              <NavItem to="/deploy" label={t('nav.deploy')} icon={<Icon name="download" size={16} />} />
            </nav>
          ) : (
            <nav className="sidebar-nav" style={{ flex: 'none' }}>
              <NavItem to="/overview" label={t('nav.overview')} icon={<Icon name="chart" size={16} />} />
              <NavItem to="/companies" label={t('nav.company_list', '公司列表')} icon={<Icon name="grid" size={16} />} count={opcs.length || undefined} />
              <NavItem to="/providers" label={t('nav.providers')} icon={<Icon name="cloud" size={16} />} />
              <NavItem to="/office" label={t('nav.office')} icon={<Icon name="building" size={16} />} />
              <NavItem to="/logs" label={t('nav.logs')} icon={<Icon name="file" size={16} />} />
              <NavItem to="/activities" label={t('nav.activities', '实时活动')} icon={<Icon name="activity" size={16} />} />
              <NavItem to="/settings" label={t('nav.settings')} icon={<Icon name="settings" size={16} />} />
            </nav>
          )}
        </div>

        {/* Collapse / Expand toggle */}
        {!isMobile && (
          <button
            className="nav-item"
            onClick={() => setCollapsed(!collapsed)}
            style={{ width: '100%', border: 'none', background: 'none', cursor: 'pointer', fontFamily: 'inherit', justifyContent: collapsed ? 'center' : undefined, padding: collapsed ? '8px' : undefined }}
            title={collapsed ? t('common.expand', '展开侧栏') : t('common.collapse', '收起侧栏')}
          >
            <span className="nav-icon ic-18" style={{ flexShrink: 0 }}>
              <Icon name={collapsed ? 'panel-left-open' : 'panel-left-close'} size={16} />
            </span>
            {!collapsed && <span className="text-sm">{t('common.collapse', '收起侧栏')}</span>}
          </button>
        )}

        {/* Status footer */}
        <div className={!showLabels ? 'sidebar-footer-collapsed' : 'sidebar-footer'}>
          {!showLabels ? (
            <div title={process?.is_running ? `PID ${process.pid}` : t('process.stopped')} style={{ display: 'flex', justifyContent: 'center' }}>
              <span style={{ width: '8px', height: '8px', borderRadius: '50%', display: 'inline-block', background: statusColor }} />
            </div>
          ) : (
            <div style={{ padding: '8px', borderRadius: 'var(--radius-md)', background: 'var(--bg-surface)', border: '1px solid var(--border-subtle)' }}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '6px' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                  <span style={{ width: '6px', height: '6px', borderRadius: '50%', flexShrink: 0, background: statusColor, boxShadow: process?.is_running ? `0 0 6px ${statusColor}` : 'none' }} />
                  <span style={{ fontSize: '11.5px', fontWeight: 500, color: 'var(--text-secondary)' }}>
                    {processLoading && !process ? t('process.checking')
                      : process?.is_running ? 'OpenClaw'
                      : process?.daemon_available === false ? t('process.localMachine')
                      : 'OpenClaw'}
                  </span>
                </div>
                <span style={{ fontSize: '10px', padding: '1px 6px', borderRadius: '4px', background: process?.is_running ? 'rgba(135,184,154,0.15)' : 'rgba(255,255,255,0.05)', color: process?.is_running ? 'var(--success)' : 'var(--text-muted)' }}>
                  {processLoading && !process ? '...'
                    : process?.is_running ? t('process.running')
                    : process?.daemon_available === false ? t('process.stopped')
                    : t('process.unknown')}
                </span>
              </div>
              <div style={{ fontSize: '10.5px', color: 'var(--text-muted)', marginBottom: '8px' }}>
                {processLoading && !process ? t('process.checkingDesc')
                  : process?.is_running && process.pid != null
                    ? `PID ${process.pid}${process.uptime_seconds != null ? ` · ${formatUptime(process.uptime_seconds, i18n.language)}` : ''}`
                    : process?.daemon_available === false ? 'daemon 未运行' : t('process.notRunning')}
              </div>
              <button
                className="btn btn-sm"
                style={{ width: '100%', justifyContent: 'center', fontSize: '11.5px', opacity: (acting || (processLoading && !process)) ? 0.5 : 1 }}
                onClick={handleRestart}
                disabled={acting || (processLoading && !process)}
              >
                <Icon name="refresh" size={11} />
                {acting ? t('process.acting') : (processLoading && !process) ? t('process.checking') : t('process.restart')}
              </button>
            </div>
          )}
        </div>
      </aside>

      {/* ── Main content area ── */}
      <div className="main" style={{ display: 'flex', flexDirection: 'column', minWidth: 0, overflow: 'hidden' }}>
        {/* Topbar */}
        <div className="topbar" style={{ height: '48px', borderBottom: '1px solid var(--border-subtle)', display: 'flex', alignItems: 'center', padding: '0 24px', gap: '16px', background: 'var(--bg-base)', flexShrink: 0 }}>
          {/* Mobile hamburger */}
          <button
            className="mobile-menu-btn"
            onClick={() => setMobileMenuOpen(true)}
            aria-label="Menu"
          >
            <Icon name="menu" size={20} />
          </button>

          {/* Breadcrumb */}
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '12.5px', color: 'var(--text-tertiary)' }}>
            {inCompany ? (
              <>
                <span style={{ cursor: 'pointer' }} onClick={() => navigate('/companies')}>全局</span>
                <Icon name="chevron-right" size={11} />
                <span>{currentOpc?.display_name || '公司'}</span>
                <Icon name="chevron-right" size={11} />
                <span style={{ color: 'var(--text-primary)', fontWeight: 500 }}>{currentPageLabel}</span>
              </>
            ) : (
              <>
                <span>ClawPilot</span>
                <Icon name="chevron-right" size={11} />
                <span style={{ color: 'var(--text-primary)', fontWeight: 500 }}>{currentPageLabel}</span>
              </>
            )}
          </div>

          <div style={{ flex: 1 }} />

          {/* Notification bell */}
          <div
            style={{ width: '32px', height: '32px', display: 'grid', placeItems: 'center', borderRadius: '8px', color: 'var(--text-secondary)', cursor: 'pointer', position: 'relative' }}
            title="实时活动"
            onClick={() => navigate('/activities')}
          >
            <Icon name="bell" size={15} />
            <span style={{ position: 'absolute', top: '6px', right: '6px', width: '6px', height: '6px', borderRadius: '50%', background: 'var(--accent)' }} />
          </div>

        </div>

        {/* Page content */}
        <div style={{ flex: 1, overflow: 'hidden', display: 'flex' }}>
          <Outlet />
        </div>
      </div>
    </div>
  )
}
