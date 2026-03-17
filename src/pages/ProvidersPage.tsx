export default function ProvidersPage() {
  return (
    <main style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
      <div className="toolbar" style={{ justifyContent: 'space-between' }}>
        <span style={{ fontSize: '15px', fontWeight: 600 }}>模型管理</span>
        <button className="tbtn tbtn-accent">+ 添加 Provider</button>
      </div>
      <div style={{ flex: 1, overflowY: 'auto', padding: '14px 16px', display: 'flex', flexDirection: 'column', gap: '14px' }}>

        {/* Provider 配置 */}
        <section>
          <div className="section-label" style={{ padding: '0 0 7px' }}>Provider 配置</div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3,1fr)', gap: '10px' }}>

            {/* 阿里云 */}
            <div className="provider-card" style={{ padding: '12px' }}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '10px' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                  <div style={{ width: '34px', height: '34px', borderRadius: '9px', background: 'linear-gradient(135deg,#f97316,#ef4444)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '14px', fontWeight: 700, color: 'white', flexShrink: 0 }}>阿</div>
                  <div><div style={{ fontSize: '12px', fontWeight: 600, color: '#EBEBF5' }}>阿里云百炼</div><div style={{ fontSize: '11px', color: '#636366' }}>Aliyun Bailian</div></div>
                </div>
                <span style={{ fontSize: '10px', padding: '1px 6px', borderRadius: '4px', background: 'rgba(52,199,89,0.15)', color: '#34c759' }}>已连接</span>
              </div>
              <div className="group" style={{ marginBottom: '8px' }}>
                <div className="group-row"><span className="group-label">可用模型</span><span className="group-value">5 个</span></div>
                <div className="group-row"><span className="group-label">API Key</span><span className="group-value" style={{ fontFamily: 'monospace', fontSize: '11px' }}>sk-****8f2a</span></div>
              </div>
              <div style={{ display: 'flex', gap: '6px' }}>
                <button className="tbtn tbtn-accent" style={{ flex: 1, textAlign: 'center' }}>测试连接</button>
                <button className="tbtn tbtn-ghost" style={{ flex: 1, textAlign: 'center' }}>编辑配置</button>
              </div>
            </div>

            {/* 火山方舟 */}
            <div className="provider-card" style={{ padding: '12px' }}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '10px' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                  <div style={{ width: '34px', height: '34px', borderRadius: '9px', background: 'linear-gradient(135deg,#3b82f6,#06b6d4)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '14px', fontWeight: 700, color: 'white', flexShrink: 0 }}>火</div>
                  <div><div style={{ fontSize: '12px', fontWeight: 600, color: '#EBEBF5' }}>火山方舟</div><div style={{ fontSize: '11px', color: '#636366' }}>Volcano Engine</div></div>
                </div>
                <span style={{ fontSize: '10px', padding: '1px 6px', borderRadius: '4px', background: 'rgba(255,255,255,0.06)', color: '#636366' }}>未配置</span>
              </div>
              <div className="group" style={{ marginBottom: '8px' }}>
                <div className="group-row"><span className="group-label">可用模型</span><span className="group-value" style={{ color: '#636366' }}>—</span></div>
                <div className="group-row"><span className="group-label">API Key</span><span className="group-value" style={{ color: '#636366' }}>未设置</span></div>
              </div>
              <div style={{ display: 'flex', gap: '6px' }}>
                <button className="tbtn tbtn-accent" style={{ flex: 1, textAlign: 'center' }}>添加配置</button>
                <button className="tbtn tbtn-ghost" style={{ padding: '3px 8px' }}>
                  <svg fill="none" stroke="currentColor" strokeWidth="1.75" viewBox="0 0 24 24" width="14" height="14"><path strokeLinecap="round" strokeLinejoin="round" d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"/></svg>
                </button>
              </div>
            </div>

            {/* MiniMax */}
            <div className="provider-card" style={{ padding: '12px' }}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '10px' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                  <div style={{ width: '34px', height: '34px', borderRadius: '9px', background: 'linear-gradient(135deg,#8b5cf6,#ec4899)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '14px', fontWeight: 700, color: 'white', flexShrink: 0 }}>M</div>
                  <div><div style={{ fontSize: '12px', fontWeight: 600, color: '#EBEBF5' }}>MiniMax</div><div style={{ fontSize: '11px', color: '#636366' }}>MiniMax API</div></div>
                </div>
                <span style={{ fontSize: '10px', padding: '1px 6px', borderRadius: '4px', background: 'rgba(255,255,255,0.06)', color: '#636366' }}>未配置</span>
              </div>
              <div className="group" style={{ marginBottom: '8px' }}>
                <div className="group-row"><span className="group-label">可用模型</span><span className="group-value" style={{ color: '#636366' }}>—</span></div>
                <div className="group-row"><span className="group-label">API Key</span><span className="group-value" style={{ color: '#636366' }}>未设置</span></div>
              </div>
              <div style={{ display: 'flex', gap: '6px' }}>
                <button className="tbtn tbtn-accent" style={{ flex: 1, textAlign: 'center' }}>添加配置</button>
                <button className="tbtn tbtn-ghost" style={{ padding: '3px 8px' }}>
                  <svg fill="none" stroke="currentColor" strokeWidth="1.75" viewBox="0 0 24 24" width="14" height="14"><path strokeLinecap="round" strokeLinejoin="round" d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"/></svg>
                </button>
              </div>
            </div>

          </div>
        </section>

        {/* 模型对比 */}
        <section>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '7px' }}>
            <span className="section-label" style={{ padding: 0 }}>模型对比</span>
            <button className="tbtn tbtn-ghost" style={{ padding: '2px 8px', fontSize: '11px' }}>筛选</button>
          </div>
          <div className="group">
            <table>
              <thead>
                <tr>
                  <th>模型名称</th>
                  <th>提供商</th>
                  <th>上下文</th>
                  <th>输入价格</th>
                  <th>输出价格</th>
                  <th>能力</th>
                  <th style={{ textAlign: 'center' }}>操作</th>
                </tr>
              </thead>
              <tbody>
                <tr>
                  <td>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '7px' }}>
                      <div style={{ width: '22px', height: '22px', borderRadius: '6px', background: 'rgba(139,92,246,0.2)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '10px', fontWeight: 700, color: '#a78bfa', flexShrink: 0 }}>Q</div>
                      <span style={{ fontWeight: 500 }}>qwen-max</span>
                    </div>
                  </td>
                  <td style={{ color: '#636366' }}>阿里云百炼</td>
                  <td>128K</td>
                  <td>¥0.02/1K</td>
                  <td>¥0.06/1K</td>
                  <td><span className="tag" style={{ background: 'rgba(52,199,89,0.15)', color: '#34c759' }}>推理</span> <span className="tag" style={{ background: 'rgba(59,130,246,0.15)', color: '#60a5fa' }}>代码</span></td>
                  <td style={{ textAlign: 'center' }}><button style={{ fontSize: '11px', color: '#a78bfa', background: 'none', border: 'none', cursor: 'pointer' }}>设为默认</button></td>
                </tr>
                <tr>
                  <td>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '7px' }}>
                      <div style={{ width: '22px', height: '22px', borderRadius: '6px', background: 'rgba(139,92,246,0.2)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '10px', fontWeight: 700, color: '#a78bfa', flexShrink: 0 }}>Q</div>
                      <span style={{ fontWeight: 500 }}>qwen-plus</span>
                    </div>
                  </td>
                  <td style={{ color: '#636366' }}>阿里云百炼</td>
                  <td>32K</td>
                  <td>¥0.008/1K</td>
                  <td>¥0.02/1K</td>
                  <td><span className="tag" style={{ background: 'rgba(52,199,89,0.15)', color: '#34c759' }}>推理</span></td>
                  <td style={{ textAlign: 'center' }}><button style={{ fontSize: '11px', color: '#636366', background: 'none', border: 'none', cursor: 'pointer' }}>设为默认</button></td>
                </tr>
                <tr>
                  <td>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '7px' }}>
                      <div style={{ width: '22px', height: '22px', borderRadius: '6px', background: 'rgba(6,182,212,0.2)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '10px', fontWeight: 700, color: '#06b6d4', flexShrink: 0 }}>D</div>
                      <span style={{ fontWeight: 500 }}>deepseek-v3</span>
                    </div>
                  </td>
                  <td style={{ color: '#636366' }}>火山方舟</td>
                  <td>64K</td>
                  <td>¥0.008/1K</td>
                  <td>¥0.016/1K</td>
                  <td><span className="tag" style={{ background: 'rgba(52,199,89,0.15)', color: '#34c759' }}>推理</span> <span className="tag" style={{ background: 'rgba(59,130,246,0.15)', color: '#60a5fa' }}>代码</span></td>
                  <td style={{ textAlign: 'center' }}><button style={{ fontSize: '11px', color: '#636366', background: 'none', border: 'none', cursor: 'pointer' }}>未配置</button></td>
                </tr>
                <tr>
                  <td>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '7px' }}>
                      <div style={{ width: '22px', height: '22px', borderRadius: '6px', background: 'rgba(6,182,212,0.2)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '10px', fontWeight: 700, color: '#06b6d4', flexShrink: 0 }}>D</div>
                      <span style={{ fontWeight: 500 }}>deepseek-coder</span>
                    </div>
                  </td>
                  <td style={{ color: '#636366' }}>火山方舟</td>
                  <td>16K</td>
                  <td>¥0.008/1K</td>
                  <td>¥0.016/1K</td>
                  <td><span className="tag" style={{ background: 'rgba(59,130,246,0.15)', color: '#60a5fa' }}>代码</span></td>
                  <td style={{ textAlign: 'center' }}><button style={{ fontSize: '11px', color: '#636366', background: 'none', border: 'none', cursor: 'pointer' }}>未配置</button></td>
                </tr>
                <tr>
                  <td>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '7px' }}>
                      <div style={{ width: '22px', height: '22px', borderRadius: '6px', background: 'rgba(139,92,246,0.2)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '10px', fontWeight: 700, color: '#a78bfa', flexShrink: 0 }}>M</div>
                      <span style={{ fontWeight: 500 }}>MiniMax-Text-01</span>
                    </div>
                  </td>
                  <td style={{ color: '#636366' }}>MiniMax</td>
                  <td>256K</td>
                  <td>¥0.01/1K</td>
                  <td>¥0.03/1K</td>
                  <td><span className="tag" style={{ background: 'rgba(245,158,11,0.15)', color: '#f59e0b' }}>长文本</span></td>
                  <td style={{ textAlign: 'center' }}><button style={{ fontSize: '11px', color: '#636366', background: 'none', border: 'none', cursor: 'pointer' }}>未配置</button></td>
                </tr>
              </tbody>
            </table>
          </div>
        </section>

      </div>
    </main>
  )
}
