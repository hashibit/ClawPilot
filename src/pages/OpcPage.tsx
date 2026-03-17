export default function OpcPage() {
  return (
    <>
      {/* COL2: list-pane */}
      <div className="list-pane">
        <div className="toolbar" style={{ justifyContent: 'space-between' }}>
          <span style={{ fontSize: '15px', fontWeight: 600, color: '#FFFFFF' }}>我的公司</span>
        </div>
        <div style={{ flex: 1, overflowY: 'auto' }}>
          <div className="section-label" style={{ padding: '8px 12px 3px' }}>运行中</div>
          <div className="list-row selected" id="row-1">
            <div className="avatar avatar-lg" style={{ background: 'linear-gradient(135deg,#8b5cf6,#06b6d4)' }}>I</div>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div className="flex-center gap-5">
                <span className="text-sm text-medium">互联网公司</span>
                <span className="pulse-dot" style={{ width: '6px', height: '6px', borderRadius: '50%', background: '#34c759' }}></span>
              </div>
              <div className="text-xs text-dim">5 智能体 · 3 频道</div>
            </div>
            <span className="text-xs text-dim">2天前</span>
          </div>
          <div className="section-label" style={{ padding: '10px 12px 3px' }}>已停止</div>
          <div className="list-row" id="row-2">
            <div className="avatar avatar-lg" style={{ background: 'linear-gradient(135deg,#10b981,#06b6d4)' }}>M</div>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div className="flex-center gap-5">
                <span className="text-sm text-medium text-dim">手机助手公司</span>
                <span style={{ width: '6px', height: '6px', borderRadius: '50%', background: '#48484A' }}></span>
              </div>
              <div className="text-xs text-dim">4 智能体 · 2 频道</div>
            </div>
            <span className="text-xs text-dim">1周前</span>
          </div>
          <div className="list-row" id="row-3">
            <div className="avatar avatar-lg" style={{ background: 'linear-gradient(135deg,#f59e0b,#f97316)' }}>Z</div>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div className="flex-center gap-5">
                <span className="text-sm text-medium text-dim">自媒体公司</span>
                <span style={{ width: '6px', height: '6px', borderRadius: '50%', background: '#48484A' }}></span>
              </div>
              <div className="text-xs text-dim">3 智能体 · 2 频道</div>
            </div>
            <span className="text-xs text-dim">3天前</span>
          </div>
          <div style={{ padding: '10px 12px 4px', borderTop: '1px solid rgba(255,255,255,0.06)', marginTop: '6px' }}>
            <button style={{ width: '100%', display: 'flex', alignItems: 'center', gap: '6px', padding: '6px 8px', borderRadius: '6px', background: 'none', border: 'none', cursor: 'pointer', color: '#636366', fontSize: '12px' }}>
              <svg fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24" width="13" height="13"><path strokeLinecap="round" strokeLinejoin="round" d="M12 6v6m0 0v6m0-6h6m-6 0H6"/></svg>
              创建新OPC公司
            </button>
          </div>
        </div>
      </div>

      {/* COL3: detail-pane */}
      <main className="detail-pane">
        <div className="toolbar" style={{ justifyContent: 'space-between' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <span style={{ fontSize: '15px', fontWeight: 600, color: '#FFFFFF' }}>互联网公司</span>
            <span style={{ fontSize: '11px', padding: '1px 7px', borderRadius: '4px', background: 'rgba(52,199,89,0.15)', color: '#34c759' }}>运行中</span>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
            <button className="tbtn tbtn-ghost">
              <svg fill="none" stroke="currentColor" strokeWidth="1.75" viewBox="0 0 24 24" width="12" height="12" style={{ display: 'inline', marginRight: '4px' }}><path strokeLinecap="round" strokeLinejoin="round" d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4"/></svg>
              导出
            </button>
          </div>
        </div>
        <div style={{ flex: 1, overflowY: 'auto', padding: '14px 16px', display: 'flex', flexDirection: 'column', gap: '14px' }}>
          {/* 数据概览 */}
          <section>
            <div className="flex-center gap-10" style={{ marginBottom: '8px' }}>
              <div><div className="text-bold" style={{ fontSize: '15px', color: '#EBEBF5', lineHeight: '1.2' }}>数据概览</div></div>
            </div>
            <div className="group">
              <div className="group-row"><span className="group-label">智能体</span><span className="group-value">5 个</span></div>
              <div className="group-row"><span className="group-label">飞书频道</span><span className="group-value">3 个 <span className="text-dimmer">（2 群聊, 1 私聊）</span></span></div>
              <div className="group-row"><span className="group-label">运行状态</span><span className="group-value flex-center gap-5"><span className="pulse-dot" style={{ width: '6px', height: '6px', borderRadius: '50%', background: '#34c759' }}></span><span style={{ color: '#34c759' }}>运行中</span></span></div>
              <div className="group-row"><span className="group-label">今日消息</span><span className="group-value" style={{ color: '#34c759' }}>647 条 <span className="text-dimmer">↑ 12%</span></span></div>
            </div>
          </section>

          {/* 智能体成员 */}
          <section>
            <div className="flex-between" style={{ marginBottom: '6px' }}>
              <span className="section-label" style={{ padding: 0 }}>智能体成员</span>
              <a href="#" style={{ fontSize: '11px', color: '#a78bfa', textDecoration: 'none' }}>管理 →</a>
            </div>
            <div className="group">
              <div className="group-row">
                <div className="avatar avatar-sm" style={{ background: 'linear-gradient(135deg,#8b5cf6,#ec4899)', marginRight: '8px' }}>PM</div>
                <div style={{ flex: 1 }}><div className="text-xs text-medium" style={{ color: '#EBEBF5' }}>产品经理</div><div className="text-xs text-dimmer">百炼[qwen-max] · 3 工具</div></div>
                <span className="status-badge status-violet">默认响应</span>
              </div>
              <div className="group-row">
                <div className="avatar avatar-sm" style={{ background: 'linear-gradient(135deg,#06b6d4,#3b82f6)', marginRight: '8px' }}>UX</div>
                <div style={{ flex: 1 }}><div className="text-xs text-medium" style={{ color: '#EBEBF5' }}>UX设计师</div><div className="text-xs text-dimmer">火山方舟[deepseek-v3] · 2 工具</div></div>
              </div>
              <div className="group-row">
                <div className="avatar avatar-sm" style={{ background: 'linear-gradient(135deg,#f59e0b,#f97316)', marginRight: '8px' }}>DA</div>
                <div style={{ flex: 1 }}><div className="text-xs text-medium" style={{ color: '#EBEBF5' }}>数据分析师</div><div className="text-xs text-dimmer">百炼[qwen-max] · 4 工具</div></div>
              </div>
              <div className="group-row">
                <div className="avatar avatar-sm" style={{ background: 'linear-gradient(135deg,#10b981,#14b8a6)', marginRight: '8px' }}>DO</div>
                <div style={{ flex: 1 }}><div className="text-xs text-medium" style={{ color: '#EBEBF5' }}>技术文档工程师</div><div className="text-xs text-dimmer">百炼[qwen-plus] · 2 工具</div></div>
              </div>
              <div className="group-row">
                <div className="avatar avatar-sm" style={{ background: 'linear-gradient(135deg,#f43f5e,#ec4899)', marginRight: '8px' }}>QA</div>
                <div style={{ flex: 1 }}><div className="text-xs text-medium" style={{ color: '#EBEBF5' }}>质量保证工程师</div><div className="text-xs text-dimmer">火山方舟[deepseek-coder] · 3 工具</div></div>
              </div>
            </div>
          </section>

          {/* 最近活动 */}
          <section>
            <div className="flex-between" style={{ marginBottom: '6px' }}>
              <span className="section-label" style={{ padding: 0 }}>最近活动</span>
              <button style={{ fontSize: '11px', color: '#a78bfa', background: 'none', border: 'none', cursor: 'pointer', padding: 0 }}>全部</button>
            </div>
            <div className="group">
              <div className="group-row" style={{ alignItems: 'flex-start', gap: '8px' }}>
                <div style={{ width: '24px', height: '24px', borderRadius: '6px', background: 'rgba(52,199,89,0.15)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0, marginTop: '1px' }}>
                  <svg fill="none" stroke="#34c759" strokeWidth="2.5" viewBox="0 0 24 24" width="12" height="12"><path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7"/></svg>
                </div>
                <div style={{ flex: 1 }}><div className="text-xs" style={{ color: '#EBEBF5' }}>成功部署 <span style={{ color: '#a78bfa' }}>产品经理公司</span></div><div className="text-xs text-dimmer">配置已更新并重启服务</div></div>
                <span className="text-xs text-dimmer">10分钟前</span>
              </div>
              <div className="group-row" style={{ alignItems: 'flex-start', gap: '8px' }}>
                <div style={{ width: '24px', height: '24px', borderRadius: '6px', background: 'rgba(139,92,246,0.15)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0, marginTop: '1px' }}>
                  <svg fill="none" stroke="#a78bfa" strokeWidth="2.5" viewBox="0 0 24 24" width="12" height="12"><path strokeLinecap="round" strokeLinejoin="round" d="M12 6v6m0 0v6m0-6h6m-6 0H6"/></svg>
                </div>
                <div style={{ flex: 1 }}><div className="text-xs" style={{ color: '#EBEBF5' }}>新增智能体 <span style={{ color: '#a78bfa' }}>数据分析师</span></div><div className="text-xs text-dimmer">已添加到「产品经理公司」</div></div>
                <span className="text-xs text-dimmer">2小时前</span>
              </div>
              <div className="group-row" style={{ alignItems: 'flex-start', gap: '8px' }}>
                <div style={{ width: '24px', height: '24px', borderRadius: '6px', background: 'rgba(245,158,11,0.15)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0, marginTop: '1px' }}>
                  <svg fill="none" stroke="#f59e0b" strokeWidth="2" viewBox="0 0 24 24" width="12" height="12"><path strokeLinecap="round" strokeLinejoin="round" d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z"/></svg>
                </div>
                <div style={{ flex: 1 }}><div className="text-xs" style={{ color: '#EBEBF5' }}>修改 Provider 配置</div><div className="text-xs text-dimmer">更新了阿里云百炼 API Key</div></div>
                <span className="text-xs text-dimmer">昨天</span>
              </div>
            </div>
          </section>
        </div>
      </main>
    </>
  )
}
