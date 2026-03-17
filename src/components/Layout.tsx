import { Outlet, NavLink } from 'react-router-dom'

export default function Layout() {
  return (
    <div style={{ display: 'flex', height: '100vh', width: '100vw' }}>
      <aside className="sidebar">
        <div style={{ padding: '12px 10px 6px' }}>
          <div className="flex-center gap-8" style={{ padding: '4px 8px 10px' }}>
            <div className="logo-box">
              <svg width="13" height="13" viewBox="0 0 13 13" fill="none">
                <path d="M2 6.5C2 4.01 4.01 2 6.5 2S11 4.01 11 6.5 8.99 11 6.5 11" stroke="#fff" strokeWidth="1.5" strokeLinecap="round"/>
              </svg>
            </div>
            <span className="text-sm text-bold">ClawPilot</span>
          </div>
          <nav style={{ display: 'flex', flexDirection: 'column', gap: '2px' }}>
            <NavLink to="/overview" className={({ isActive }) => `nav-item${isActive ? ' active' : ''}`}>
              <span className="nav-icon">
                <svg className="ic-16" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5">
                  <rect x="2" y="2" width="5" height="5" rx="1.5"/>
                  <rect x="9" y="2" width="5" height="5" rx="1.5"/>
                  <rect x="2" y="9" width="5" height="5" rx="1.5"/>
                  <rect x="9" y="9" width="5" height="5" rx="1.5"/>
                </svg>
              </span>
              <span className="text-sm">概览</span>
            </NavLink>
            <NavLink to="/opc" className={({ isActive }) => `nav-item${isActive ? ' active' : ''}`}>
              <span className="nav-icon">
                <svg className="ic-16" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5">
                  <circle cx="8" cy="8" r="5.5"/>
                  <path d="M8 5v3l2 2"/>
                </svg>
              </span>
              <span className="text-sm">OPC</span>
            </NavLink>
            <NavLink to="/agents" className={({ isActive }) => `nav-item${isActive ? ' active' : ''}`}>
              <span className="nav-icon">
                <svg className="ic-16" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5">
                  <circle cx="8" cy="5" r="2.5"/>
                  <path d="M3 13c0-2.76 2.24-5 5-5s5 2.24 5 5"/>
                </svg>
              </span>
              <span className="text-sm">Agents</span>
            </NavLink>
            <NavLink to="/providers" className={({ isActive }) => `nav-item${isActive ? ' active' : ''}`}>
              <span className="nav-icon">
                <svg className="ic-16" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5">
                  <path d="M8 2l5 3v6l-5 3-5-3V5l5-3z"/>
                </svg>
              </span>
              <span className="text-sm">Providers</span>
            </NavLink>
            <NavLink to="/bindings" className={({ isActive }) => `nav-item${isActive ? ' active' : ''}`}>
              <span className="nav-icon">
                <svg className="ic-16" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5">
                  <path d="M3 8h10M8 3l5 5-5 5"/>
                </svg>
              </span>
              <span className="text-sm">绑定</span>
            </NavLink>
            <NavLink to="/deploy" className={({ isActive }) => `nav-item${isActive ? ' active' : ''}`}>
              <span className="nav-icon">
                <svg className="ic-16" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5">
                  <path d="M8 2v9M5 8l3 3 3-3M3 13h10"/>
                </svg>
              </span>
              <span className="text-sm">部署</span>
            </NavLink>
            <NavLink to="/logs" className={({ isActive }) => `nav-item${isActive ? ' active' : ''}`}>
              <span className="nav-icon">
                <svg className="ic-16" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5">
                  <path d="M3 4h10M3 8h7M3 12h5"/>
                </svg>
              </span>
              <span className="text-sm">日志</span>
            </NavLink>
          </nav>
        </div>
      </aside>
      <main style={{ flex: 1, overflow: 'hidden', display: 'flex', flexDirection: 'column' }}>
        <Outlet />
      </main>
    </div>
  )
}
