import { Outlet } from 'react-router-dom'

export default function ThreeColumnLayout() {
  return (
    <>
      {/* List Pane */}
      <div className="list-pane">
        <div className="toolbar flex-between">
          <span className="text-title">列表</span>
        </div>
        <div className="flex-1" style={{ overflowY: 'auto' }}>
          {/* List content will be rendered here via nested Outlet */}
        </div>
      </div>

      {/* Detail Pane */}
      <main className="detail-pane">
        <div className="toolbar flex-between">
          <span className="text-title">详情</span>
        </div>
        <div className="flex-1" style={{ overflowY: 'auto', padding: '14px 16px' }}>
          {/* Detail content will be rendered here via nested Outlet */}
          <Outlet />
        </div>
      </main>
    </>
  )
}
