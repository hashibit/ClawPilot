export default function OverviewPage() {
  return (
    <div className="overview-content">
      {/* 统计卡片 */}
      <section>
        <div className="section-label" style={{ padding: '0 0 7px' }}>核心指标</div>
        <div className="stat-grid">
          <div className="stat-card">
            <div className="stat-value">8</div>
            <div className="stat-label">公司总数</div>
            <div className="stat-change neutral">
              <svg width="12" height="12" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" d="M5 12h14"/></svg>
              无变化
            </div>
          </div>
          <div className="stat-card">
            <div className="stat-value">24</div>
            <div className="stat-label">智能体总数</div>
            <div className="stat-change up">
              <svg width="12" height="12" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" d="M5 10l7-7m0 0l7 7m-7-7v18"/></svg>
              +3 本月
            </div>
          </div>
          <div className="stat-card">
            <div className="stat-value">12</div>
            <div className="stat-label">飞书频道</div>
            <div className="stat-change up">
              <svg width="12" height="12" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" d="M5 10l7-7m0 0l7 7m-7-7v18"/></svg>
              +2 本月
            </div>
          </div>
          <div className="stat-card">
            <div className="stat-value">1,284</div>
            <div className="stat-label">今日消息</div>
            <div className="stat-change up">
              <svg width="12" height="12" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" d="M5 10l7-7m0 0l7 7m-7-7v18"/></svg>
              ↑ 12% vs 昨日
            </div>
          </div>
        </div>
      </section>

      {/* 消息趋势 */}
      <section>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '7px' }}>
          <span className="section-label" style={{ padding: 0 }}>消息趋势</span>
          <button style={{ fontSize: '11px', color: '#a78bfa', background: 'none', border: 'none', cursor: 'pointer', padding: 0 }}>查看详情</button>
        </div>
        <div className="stat-card">
          <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
            <div style={{ flex: 1 }}>
              <div style={{ fontSize: '24px', fontWeight: 600, color: '#FFFFFF' }}>1,284</div>
              <div className="stat-label">今日消息</div>
            </div>
            <div style={{ textAlign: 'right' }}>
              <div style={{ fontSize: '13px', color: '#34c759', fontWeight: 500 }}>+12%</div>
              <div className="stat-label">较昨日</div>
            </div>
          </div>
          <div className="trend-bar">
            <div className="trend-fill" style={{ width: '68%' }}></div>
          </div>
        </div>
      </section>

      {/* 消息量对比 */}
      <section>
        <div className="section-label" style={{ padding: '0 0 7px' }}>各公司消息量（7天）</div>
        <div className="stat-card">
          <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
              <div style={{ width: '80px', fontSize: '12px', color: 'rgba(255,255,255,0.8)' }}>互联网公司</div>
              <div style={{ flex: 1 }}>
                <div className="trend-bar"><div className="trend-fill" style={{ width: '85%', background: '#8b5cf6' }}></div></div>
              </div>
              <div style={{ width: '60px', textAlign: 'right', fontSize: '12px', color: '#FFFFFF', fontWeight: 500 }}>2,847</div>
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
              <div style={{ width: '80px', fontSize: '12px', color: 'rgba(255,255,255,0.8)' }}>手机助手</div>
              <div style={{ flex: 1 }}>
                <div className="trend-bar"><div className="trend-fill" style={{ width: '52%', background: '#06b6d4' }}></div></div>
              </div>
              <div style={{ width: '60px', textAlign: 'right', fontSize: '12px', color: '#FFFFFF', fontWeight: 500 }}>1,742</div>
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
              <div style={{ width: '80px', fontSize: '12px', color: 'rgba(255,255,255,0.8)' }}>自媒体公司</div>
              <div style={{ flex: 1 }}>
                <div className="trend-bar"><div className="trend-fill" style={{ width: '35%', background: '#f59e0b' }}></div></div>
              </div>
              <div style={{ width: '60px', textAlign: 'right', fontSize: '12px', color: '#FFFFFF', fontWeight: 500 }}>1,185</div>
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
              <div style={{ width: '80px', fontSize: '12px', color: 'rgba(255,255,255,0.8)' }}>其他公司</div>
              <div style={{ flex: 1 }}>
                <div className="trend-bar"><div className="trend-fill" style={{ width: '28%', background: '#10b981' }}></div></div>
              </div>
              <div style={{ width: '60px', textAlign: 'right', fontSize: '12px', color: '#FFFFFF', fontWeight: 500 }}>942</div>
            </div>
          </div>
        </div>
      </section>

      {/* 活跃度 */}
      <section>
        <div className="section-label" style={{ padding: '0 0 7px' }}>活跃智能体（今日）</div>
        <div className="stat-card">
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '10px' }}>
            <div style={{ width: '32px', height: '32px', borderRadius: '8px', background: 'linear-gradient(135deg,#8b5cf6,#ec4899)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '10px', fontWeight: 700, color: 'white', flexShrink: 0 }}>PM</div>
            <div style={{ flex: 1 }}>
              <div style={{ fontSize: '12px', fontWeight: 500, color: '#FFFFFF' }}>产品经理</div>
              <div className="trend-bar"><div className="trend-fill" style={{ width: '92%', background: '#8b5cf6' }}></div></div>
            </div>
            <div style={{ fontSize: '12px', color: '#FFFFFF', fontWeight: 500 }}>342</div>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '10px' }}>
            <div style={{ width: '32px', height: '32px', borderRadius: '8px', background: 'linear-gradient(135deg,#06b6d4,#3b82f6)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '10px', fontWeight: 700, color: 'white', flexShrink: 0 }}>UX</div>
            <div style={{ flex: 1 }}>
              <div style={{ fontSize: '12px', fontWeight: 500, color: '#FFFFFF' }}>UX设计师</div>
              <div className="trend-bar"><div className="trend-fill" style={{ width: '78%', background: '#06b6d4' }}></div></div>
            </div>
            <div style={{ fontSize: '12px', color: '#FFFFFF', fontWeight: 500 }}>289</div>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '10px' }}>
            <div style={{ width: '32px', height: '32px', borderRadius: '8px', background: 'linear-gradient(135deg,#f59e0b,#f97316)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '10px', fontWeight: 700, color: 'white', flexShrink: 0 }}>DA</div>
            <div style={{ flex: 1 }}>
              <div style={{ fontSize: '12px', fontWeight: 500, color: '#FFFFFF' }}>数据分析师</div>
              <div className="trend-bar"><div className="trend-fill" style={{ width: '65%', background: '#f59e0b' }}></div></div>
            </div>
            <div style={{ fontSize: '12px', color: '#FFFFFF', fontWeight: 500 }}>241</div>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
            <div style={{ width: '32px', height: '32px', borderRadius: '8px', background: 'linear-gradient(135deg,#f43f5e,#ec4899)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '10px', fontWeight: 700, color: 'white', flexShrink: 0 }}>QA</div>
            <div style={{ flex: 1 }}>
              <div style={{ fontSize: '12px', fontWeight: 500, color: '#FFFFFF' }}>质量保证</div>
              <div className="trend-bar"><div className="trend-fill" style={{ width: '41%', background: '#f43f5e' }}></div></div>
            </div>
            <div style={{ fontSize: '12px', color: '#FFFFFF', fontWeight: 500 }}>152</div>
          </div>
        </div>
      </section>
    </div>
  )
}