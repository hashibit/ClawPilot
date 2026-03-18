import { Outlet, NavLink, useLocation } from 'react-router-dom'

export default function Layout() {
  const location = useLocation()
  const isOverviewPage = location.pathname === '/overview' || location.pathname === '/'

  return (
    <div style={{ display: 'flex', height: '100vh', width: '100vw' }}>
      <aside className="sidebar">
        <div className="toolbar" style={{ gap: '8px', padding: '0 12px', borderBottom: '1px solid rgba(255,255,255,0.08)' }}>
          <div className="logo-box">
            <svg width="13" height="13" fill="none" stroke="white" strokeWidth="2.2" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" d="M13 10V3L4 14h7v7l9-11h-7z"/></svg>
          </div>
          <span className="text-sm text-bold">ClawPilot</span>
        </div>
        <nav style={{ flex: 1, padding: '6px 8px', overflowY: 'auto' }}>
          <div className="section-label">核心功能</div>
          <NavLink to="/overview" className={({ isActive }) => `nav-item${isActive ? ' active' : ''}`}>
            <svg className="nav-icon ic-16" fill="none" stroke="currentColor" strokeWidth="1.75" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z"/></svg>
            <span className="text-sm">数据概览</span>
          </NavLink>
          <NavLink to="/opc" className={({ isActive }) => `nav-item${isActive ? ' active' : ''}`}>
            <svg className="nav-icon ic-16" fill="none" stroke="currentColor" strokeWidth="1.75" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" d="M3 12l2-2m0 0l7-7 7 7M5 10v10a1 1 0 001 1h3m10-11l2 2m-2-2v10a1 1 0 01-1 1h-3m-6 0a1 1 0 001-1v-4a1 1 0 011-1h2a1 1 0 011 1v4a1 1 0 001 1m-6 0h6"/></svg>
            <span className="text-sm">子公司管理</span>
          </NavLink>
          <NavLink to="/agents" className={({ isActive }) => `nav-item${isActive ? ' active' : ''}`}>
            <svg className="nav-icon ic-16" fill="none" stroke="currentColor" strokeWidth="1.75" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0zm6 3a2 2 0 11-4 0 2 2 0 014 0zM7 10a2 2 0 11-4 0 2 2 0 014 0z"/></svg>
            <span className="text-sm">智能体管理</span>
          </NavLink>
          <NavLink to="/bindings" className={({ isActive }) => `nav-item${isActive ? ' active' : ''}`}>
            <svg className="nav-icon ic-16" fill="none" stroke="currentColor" strokeWidth="1.75" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z"/></svg>
            <span className="text-sm">飞书频道绑定</span>
          </NavLink>

          <div className="section-label" style={{ marginTop: '6px' }}>基础设施</div>
          <NavLink to="/providers" className={({ isActive }) => `nav-item${isActive ? ' active' : ''}`}>
            <svg className="nav-icon ic-16" fill="none" stroke="currentColor" strokeWidth="1.75" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" d="M9 3H5a2 2 0 00-2 2v4m6-6h10a2 2 0 012 2v4M9 3v18m0 0h10a2 2 0 002-2V9M9 21H5a2 2 0 01-2-2V9m0 0h18"/></svg>
            <span className="text-sm">模型管理</span>
          </NavLink>
          <NavLink to="/office" className={({ isActive }) => `nav-item${isActive ? ' active' : ''}`}>
            <svg className="nav-icon ic-16" fill="none" stroke="currentColor" strokeWidth="1.75" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" d="M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16m14 0h2m-2 0h-5m-9 0H3m2 0h5M9 7h1m-1 4h1m4-4h1m-1 4h1m-5 10v-5a1 1 0 011-1h2a1 1 0 011 1v5m-4 0h4"/></svg>
            <span className="text-sm">办公室管理</span>
          </NavLink>

          <div className="section-label" style={{ marginTop: '6px' }}>部署与监控</div>
          <NavLink to="/deploy" className={({ isActive }) => `nav-item${isActive ? ' active' : ''}`}>
            <svg className="nav-icon ic-16" fill="none" stroke="currentColor" strokeWidth="1.75" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12"/></svg>
            <span className="text-sm">一键部署</span>
          </NavLink>
          <NavLink to="/logs" className={({ isActive }) => `nav-item${isActive ? ' active' : ''}`}>
            <svg className="nav-icon ic-16" fill="none" stroke="currentColor" strokeWidth="1.75" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" d="M9 17v-2m3 2v-4m3 4v-6m2 10H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"/></svg>
            <span className="text-sm">运行日志</span>
          </NavLink>

          <div className="section-label" style={{ marginTop: '6px' }}>高级功能</div>
          <a href="#" className="nav-item">
            <svg className="nav-icon ic-16" fill="none" stroke="currentColor" strokeWidth="1.75" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" d="M19 11H5m14 0a2 2 0 012 2v6a2 2 0 01-2 2H5a2 2 0 01-2-2v-6a2 2 0 012-2m14 0V9a2 2 0 00-2-2M5 11V9a2 2 0 012-2m0 0V5a2 2 0 012-2h6a2 2 0 012 2v2M7 7h10"/></svg>
            <span className="text-sm">模板市场</span>
            <span className="pro-badge">PRO</span>
          </a>
          <a href="#" className="nav-item">
            <svg className="nav-icon ic-16" fill="none" stroke="currentColor" strokeWidth="1.75" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15"/></svg>
            <span className="text-sm">云同步</span>
            <span className="pro-badge">PRO</span>
          </a>
        </nav>
        {/* Status footer */}
        <div style={{ padding: '10px 10px', borderTop: '1px solid rgba(255,255,255,0.08)' }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '4px' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
              <span className="pulse-dot" style={{ width: '7px', height: '7px', borderRadius: '50%', background: '#34c759', display: 'inline-block' }}></span>
              <span style={{ fontSize: '12px', color: '#34c759', fontWeight: 500 }}>OpenClaw 运行中</span>
            </div>
          </div>
          <div style={{ fontSize: '11px', color: 'rgba(255,255,255,0.65)', marginBottom: '7px' }}>PID 28471 · 3小时42分</div>
          <button className="tbtn tbtn-ghost" style={{ width: '100%', textAlign: 'center' }}>重启服务</button>
        </div>
      </aside>
      {isOverviewPage ? (
        // Two-column layout for Overview
        <main style={{ flex: 1, overflow: 'hidden', display: 'flex', flexDirection: 'column' }}>
          <div className="toolbar" style={{ justifyContent: 'space-between' }}>
            <span style={{ fontSize: '15px', fontWeight: 600 }}>数据概览</span>
            <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
              <button className="tbtn tbtn-ghost" style={{ fontSize: '12px' }}>今天</button>
              <button className="tbtn tbtn-ghost" style={{ fontSize: '12px' }}>本周</button>
              <button className="tbtn tbtn-accent" style={{ fontSize: '12px' }}>本月</button>
            </div>
          </div>
          <Outlet />
        </main>
      ) : (
        // Three-column layout for other pages
        <div style={{ flex: 1, display: 'flex', overflow: 'hidden' }}>
          <Outlet />
        </div>
      )}
    </div>
  )
}