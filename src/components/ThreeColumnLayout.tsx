import { Outlet } from 'react-router-dom'

export default function ThreeColumnLayout() {
  return (
    <>
      {/* List Pane */}
      <div className="list-pane">
        <div className="toolbar" style={{ justifyContent: 'space-between' }}>
          <span style={{ fontSize: '15px', fontWeight: 600, color: '#FFFFFF' }}>列表</span>
        </div>
        <div style={{ flex: 1, overflowY: 'auto' }}>
          {/* List content will be rendered here via nested Outlet */}
        </div>
      </div>

      {/* Detail Pane */}
      <main className="detail-pane">
        <div className="toolbar" style={{ justifyContent: 'space-between' }}>
          <span style={{ fontSize: '15px', fontWeight: 600, color: '#FFFFFF' }}>详情</span>
        </div>
        <div style={{ flex: 1, overflowY: 'auto', padding: '14px 16px' }}>
          {/* Detail content will be rendered here via nested Outlet */}
          <Outlet />
        </div>
      </main>
    </>
  )
}