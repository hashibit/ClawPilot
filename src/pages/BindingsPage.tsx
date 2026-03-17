import { useState } from 'react'

export default function BindingsPage() {
  return (
    <>
      {/* COL2 - list-pane */}
      <div className="list-pane">
        <div className="toolbar" style={{ justifyContent: 'space-between' }}>
          <span style={{ fontSize: '15px', fontWeight: 600, color: '#FFFFFF' }}>我的公司</span>
        </div>
        <div style={{ flex: 1, overflowY: 'auto' }}>
          <div className="section-label" style={{ padding: '8px 12px 3px' }}>运行中</div>
          <div className="list-row selected">
            <div className="avatar avatar-lg" style={{ background: 'linear-gradient(135deg,#8b5cf6,#06b6d4)' }}>I</div>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div className="flex-center gap-5">
                <span className="text-sm text-medium">互联网公司</span>
                <span className="pulse-dot" style={{ width: '6px', height: '6px', borderRadius: '50%', background: '#34c759' }}></span>
              </div>
              <div className="text-xs text-dim">5 智能体 · 3 群聊</div>
            </div>
            <svg fill="none" stroke="currentColor" strokeWidth="1.75" viewBox="0 0 24 24" width="14" height="14" style={{ color: '#8b5cf6' }}><path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7"/></svg>
          </div>
          <div className="list-row">
            <div className="avatar avatar-lg" style={{ background: 'linear-gradient(135deg,#10b981,#06b6d4)' }}>M</div>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div className="flex-center gap-5">
                <span className="text-sm text-medium text-dim">手机助手公司</span>
                <span style={{ width: '6px', height: '6px', borderRadius: '50%', background: '#48484A' }}></span>
              </div>
              <div className="text-xs text-dim">4 智能体 · 1 群聊</div>
            </div>
            <svg fill="none" stroke="currentColor" strokeWidth="1.75" viewBox="0 0 24 24" width="14" height="14" style={{ color: 'rgba(255,255,255,0.3)' }}><path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7"/></svg>
          </div>
          <div className="section-label" style={{ padding: '10px 12px 3px' }}>已停止</div>
          <div className="list-row">
            <div className="avatar avatar-lg" style={{ background: 'linear-gradient(135deg,#f59e0b,#f97316)' }}>Z</div>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div className="flex-center gap-5">
                <span className="text-sm text-medium text-dim">自媒体公司</span>
                <span style={{ width: '6px', height: '6px', borderRadius: '50%', background: '#48484A' }}></span>
              </div>
              <div className="text-xs text-dim">3 智能体 · 0 群聊</div>
            </div>
            <svg fill="none" stroke="currentColor" strokeWidth="1.75" viewBox="0 0 24 24" width="14" height="14" style={{ color: 'rgba(255,255,255,0.3)' }}><path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7"/></svg>
          </div>
        </div>
      </div>

      {/* COL3 - detail-pane */}
      <main className="detail-pane">
        <div className="toolbar" style={{ justifyContent: 'space-between' }}>
          <span style={{ fontSize: '15px', fontWeight: 600, color: '#FFFFFF' }}>互联网公司</span>
        </div>
        <div style={{ flex: 1, overflowY: 'auto', padding: '14px 16px', display: 'flex', flexDirection: 'column', gap: '14px' }}>
          {/* 飞书机器人配置 */}
          <section>
            <span className="section-label" style={{ padding: '0 0 8px', display: 'block' }}>飞书机器人</span>
            <div className="group">
              <div className="group-row">
                <span className="group-label">连接状态</span>
                <span className="group-value" style={{ color: '#34c759', display: 'flex', alignItems: 'center', gap: '4px' }}>
                  <span className="pulse-dot" style={{ width: '6px', height: '6px', borderRadius: '50%', background: '#34c759' }}></span>
                  已连接
                </span>
              </div>
              <div className="group-row"><span className="group-label">App ID</span><span className="group-value">cli_abc123***</span></div>
              <div className="group-row"><span className="group-label">App Secret</span><span className="group-value text-dimmer">••••••••••••••••</span></div>
              <div className="group-row"><span className="group-label">机器人名称</span><span className="group-value">ClawPilot Bot</span></div>
            </div>
            <div style={{ marginTop: '8px' }}>
              <button className="tbtn tbtn-ghost" style={{ fontSize: '12px' }}>重新配置</button>
            </div>
          </section>
          {/* 飞书群组 */}
          <section>
            <div className="flex-between" style={{ marginBottom: '6px' }}>
              <span className="section-label" style={{ padding: 0 }}>飞书群组</span>
              <button className="tbtn tbtn-accent" style={{ fontSize: '11px' }}>+ 添加群组</button>
            </div>
            <div className="group">
              <div className="list-row">
                <div style={{ width: '28px', height: '28px', borderRadius: '7px', background: 'rgba(139,92,246,0.2)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                  <svg fill="none" stroke="currentColor" strokeWidth="1.75" viewBox="0 0 24 24" width="14" height="14" style={{ color: '#a78bfa' }}><path strokeLinecap="round" strokeLinejoin="round" d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0z"/></svg>
                </div>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div className="text-xs text-medium">产品讨论组</div>
                  <div className="text-xs text-dimmer">已绑定 · 产品经理</div>
                </div>
                <svg fill="none" stroke="currentColor" strokeWidth="1.75" viewBox="0 0 24 24" width="14" height="14" style={{ color: '#8b5cf6' }}><path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7"/></svg>
              </div>
              <div className="list-row">
                <div style={{ width: '28px', height: '28px', borderRadius: '7px', background: 'rgba(6,182,212,0.2)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                  <svg fill="none" stroke="currentColor" strokeWidth="1.75" viewBox="0 0 24 24" width="14" height="14" style={{ color: '#06b6d4' }}><path strokeLinecap="round" strokeLinejoin="round" d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0z"/></svg>
                </div>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div className="text-xs text-medium">UX 设计评审</div>
                  <div className="text-xs text-dimmer">已绑定 · UX 设计师</div>
                </div>
                <svg fill="none" stroke="currentColor" strokeWidth="1.75" viewBox="0 0 24 24" width="14" height="14" style={{ color: 'rgba(255,255,255,0.3)' }}><path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7"/></svg>
              </div>
              <div className="list-row">
                <div style={{ width: '28px', height: '28px', borderRadius: '7px', background: 'rgba(245,158,11,0.2)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                  <svg fill="none" stroke="currentColor" strokeWidth="1.75" viewBox="0 0 24 24" width="14" height="14" style={{ color: '#f59e0b' }}><path strokeLinecap="round" strokeLinejoin="round" d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0z"/></svg>
                </div>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div className="text-xs text-medium">数据分析</div>
                  <div className="text-xs text-dimmer">已绑定 · 数据分析师</div>
                </div>
                <svg fill="none" stroke="currentColor" strokeWidth="1.75" viewBox="0 0 24 24" width="14" height="14" style={{ color: 'rgba(255,255,255,0.3)' }}><path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7"/></svg>
              </div>
            </div>
          </section>
        </div>
      </main>
    </>
  )
}
