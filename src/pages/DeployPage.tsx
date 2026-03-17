export default function DeployPage() {
  return (
    <main style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
      <div className="toolbar" style={{ justifyContent: 'space-between' }}>
        <span style={{ fontSize: '15px', fontWeight: 600 }}>一键部署</span>
        <div style={{ display: 'flex', gap: '6px' }}>
          <span style={{ fontSize: '11px', color: '#636366', alignSelf: 'center' }}>上次部署: 2天前</span>
          <button className="tbtn tbtn-success">立即部署</button>
        </div>
      </div>
      <div style={{ flex: 1, overflowY: 'auto', padding: '14px 16px', display: 'flex', flexDirection: 'column', gap: '14px' }}>
        {/* 部署进度 */}
        <section>
          <div className="section-label" style={{ padding: '0 0 7px' }}>部署进度</div>
          <div style={{ height: '3px', background: 'rgba(255,255,255,0.08)', borderRadius: '2px', marginBottom: '10px', overflow: 'hidden' }}>
            <div style={{ height: '100%', width: '100%', background: 'linear-gradient(90deg,#8b5cf6,#06b6d4)', borderRadius: '2px' }}></div>
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4,1fr)', gap: '8px' }}>
            {[
              { label: '备份配置', sub: '已完成', info: '快照: 2024-03-12' },
              { label: '验证配置', sub: '已完成', info: '5 Agent, 3 频道' },
              { label: '写入文件', sub: '已完成', info: '~/.openclaw/ 已更新' },
              { label: '重启服务', sub: '已完成', info: '服务正常启动' },
            ].map(step => (
              <div key={step.label} className="step-card done">
                <div style={{ display: 'flex', alignItems: 'center', gap: '7px', marginBottom: '5px' }}>
                  <div style={{ width: '24px', height: '24px', borderRadius: '6px', background: 'rgba(52,199,89,0.15)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                    <svg fill="none" stroke="#34c759" strokeWidth="2.5" viewBox="0 0 24 24" width="12" height="12"><path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7"/></svg>
                  </div>
                  <div>
                    <div style={{ fontSize: '11px', fontWeight: 500, color: '#34c759' }}>{step.label}</div>
                    <div style={{ fontSize: '10px', color: '#636366' }}>{step.sub}</div>
                  </div>
                </div>
                <div style={{ fontSize: '11px', color: '#636366' }}>{step.info}</div>
              </div>
            ))}
          </div>
        </section>
        {/* 操作 */}
        <section>
          <div className="section-label" style={{ padding: '0 0 7px' }}>操作</div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3,1fr)', gap: '8px' }}>
            <div className="action-card" style={{ borderColor: 'rgba(139,92,246,0.25)' }}>
              <div style={{ width: '36px', height: '36px', borderRadius: '9px', background: 'rgba(139,92,246,0.15)', display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 8px' }}>
                <svg fill="none" stroke="#a78bfa" strokeWidth="1.75" viewBox="0 0 24 24" width="18" height="18"><path strokeLinecap="round" strokeLinejoin="round" d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12"/></svg>
              </div>
              <div style={{ fontSize: '12px', fontWeight: 500, color: '#EBEBF5', marginBottom: '2px' }}>立即部署</div>
              <div style={{ fontSize: '11px', color: '#636366' }}>保存更改并重启</div>
            </div>
            <div className="action-card">
              <div style={{ width: '36px', height: '36px', borderRadius: '9px', background: 'rgba(255,255,255,0.06)', display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 8px' }}>
                <svg fill="none" stroke="rgba(235,235,245,0.6)" strokeWidth="1.75" viewBox="0 0 24 24" width="18" height="18"><path strokeLinecap="round" strokeLinejoin="round" d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15"/></svg>
              </div>
              <div style={{ fontSize: '12px', fontWeight: 500, color: '#EBEBF5', marginBottom: '2px' }}>回滚配置</div>
              <div style={{ fontSize: '11px', color: '#636366' }}>恢复上一快照</div>
            </div>
            <div className="action-card">
              <div style={{ width: '36px', height: '36px', borderRadius: '9px', background: 'rgba(255,255,255,0.06)', display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 8px' }}>
                <svg fill="none" stroke="rgba(235,235,245,0.6)" strokeWidth="1.75" viewBox="0 0 24 24" width="18" height="18"><path strokeLinecap="round" strokeLinejoin="round" d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4"/></svg>
              </div>
              <div style={{ fontSize: '12px', fontWeight: 500, color: '#EBEBF5', marginBottom: '2px' }}>导出配置</div>
              <div style={{ fontSize: '11px', color: '#636366' }}>打包为 ZIP 文件</div>
            </div>
          </div>
        </section>
        {/* 快照历史 */}
        <section>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '7px' }}>
            <span className="section-label" style={{ padding: 0 }}>快照历史</span>
            <button style={{ fontSize: '11px', color: '#a78bfa', background: 'none', border: 'none', cursor: 'pointer', padding: 0 }}>全部</button>
          </div>
          <div className="group">
            {[
              { date: '自动快照 · 2024-03-12 14:30', info: '5 Agent · 3 频道', time: '2天前', green: true },
              { date: '自动快照 · 2024-03-10 09:15', info: '4 Agent · 2 频道', time: '4天前', green: true },
              { date: '手动快照 · 上线前稳定版', info: '3 Agent · 2 频道', time: '1周前', green: false },
            ].map((snap, i) => (
              <div key={i} className="group-row" style={{ gap: '8px' }}>
                <div style={{ width: '24px', height: '24px', borderRadius: '6px', background: snap.green ? 'rgba(52,199,89,0.15)' : 'rgba(255,255,255,0.08)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                  <svg fill="none" stroke={snap.green ? '#34c759' : '#8E8E93'} strokeWidth="2.5" viewBox="0 0 24 24" width="12" height="12"><path strokeLinecap="round" strokeLinejoin="round" d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z"/></svg>
                </div>
                <div style={{ flex: 1 }}>
                  <div style={{ fontSize: '12px', fontWeight: 500, color: '#EBEBF5' }}>{snap.date}</div>
                  <div style={{ fontSize: '11px', color: '#636366' }}>{snap.info}</div>
                </div>
                <span style={{ fontSize: '11px', color: '#636366' }}>{snap.time}</span>
                <button className="tbtn tbtn-ghost" style={{ padding: '2px 8px', fontSize: '11px' }}>回滚</button>
              </div>
            ))}
          </div>
        </section>
      </div>
    </main>
  )
}
