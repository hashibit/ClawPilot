export default function AgentsPage() {
  return (
    <>
      {/* list-pane */}
      <div className="list-pane">
        <div className="toolbar" style={{ gap: '6px' }}>
          <div style={{ position: 'relative', flex: 1, minWidth: 0 }}>
            <select className="company-select" style={{ width: '100%' }}>
              <option>互联网公司</option>
              <option>手机助手公司</option>
              <option>自媒体公司</option>
            </select>
            <svg style={{ position: 'absolute', right: '6px', top: '50%', transform: 'translateY(-50%)', pointerEvents: 'none', color: '#636366' }} width="10" height="10" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7"/></svg>
          </div>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '8px 10px 3px' }}>
          <span className="section-label" style={{ padding: 0 }}>智能体 (5)</span>
          <span style={{ fontSize: '11px', color: '#636366' }}>拖拽排序</span>
        </div>
        <div style={{ flex: 1, overflowY: 'auto' }}>
          <div className="agent-row selected">
            <div className="drag-handle"><span></span><span></span><span></span></div>
            <div style={{ width: '30px', height: '30px', borderRadius: '8px', background: 'linear-gradient(135deg,#8b5cf6,#ec4899)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '10px', fontWeight: 700, color: 'white', flexShrink: 0 }}>PM</div>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '5px' }}>
                <span style={{ fontSize: '13px', fontWeight: 500, color: '#FFFFFF', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>产品经理</span>
                <span style={{ fontSize: '10px', background: 'rgba(139,92,246,0.18)', color: '#a78bfa', padding: '1px 5px', borderRadius: '4px', whiteSpace: 'nowrap', flexShrink: 0 }}>默认响应</span>
              </div>
              <div style={{ fontSize: '12px', color: 'rgba(255,255,255,0.75)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>百炼[qwen-max] · 3 工具</div>
            </div>
          </div>
          <div className="agent-row">
            <div className="drag-handle"><span></span><span></span><span></span></div>
            <div style={{ width: '30px', height: '30px', borderRadius: '8px', background: 'linear-gradient(135deg,#06b6d4,#3b82f6)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '10px', fontWeight: 700, color: 'white', flexShrink: 0 }}>UX</div>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '5px' }}>
                <span style={{ fontSize: '13px', fontWeight: 500, color: 'rgba(255,255,255,0.8)' }}>UX设计师</span>
              </div>
              <div style={{ fontSize: '12px', color: 'rgba(255,255,255,0.75)' }}>火山方舟[deepseek-v3] · 2 工具</div>
            </div>
          </div>
          <div className="agent-row">
            <div className="drag-handle"><span></span><span></span><span></span></div>
            <div style={{ width: '30px', height: '30px', borderRadius: '8px', background: 'linear-gradient(135deg,#f59e0b,#f97316)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '10px', fontWeight: 700, color: 'white', flexShrink: 0 }}>DA</div>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '5px' }}>
                <span style={{ fontSize: '13px', fontWeight: 500, color: 'rgba(255,255,255,0.8)' }}>数据分析师</span>
              </div>
              <div style={{ fontSize: '12px', color: 'rgba(255,255,255,0.75)' }}>百炼[qwen-max] · 4 工具</div>
            </div>
          </div>
          <div className="agent-row">
            <div className="drag-handle"><span></span><span></span><span></span></div>
            <div style={{ width: '30px', height: '30px', borderRadius: '8px', background: 'linear-gradient(135deg,#10b981,#14b8a6)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '10px', fontWeight: 700, color: 'white', flexShrink: 0 }}>DO</div>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '5px' }}>
                <span style={{ fontSize: '13px', fontWeight: 500, color: 'rgba(255,255,255,0.8)' }}>技术文档工程师</span>
              </div>
              <div style={{ fontSize: '12px', color: 'rgba(255,255,255,0.75)' }}>百炼[qwen-plus] · 2 工具</div>
            </div>
          </div>
          <div className="agent-row">
            <div className="drag-handle"><span></span><span></span><span></span></div>
            <div style={{ width: '30px', height: '30px', borderRadius: '8px', background: 'linear-gradient(135deg,#f43f5e,#ec4899)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '10px', fontWeight: 700, color: 'white', flexShrink: 0 }}>QA</div>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '5px' }}>
                <span style={{ fontSize: '13px', fontWeight: 500, color: 'rgba(255,255,255,0.8)' }}>质量保证工程师</span>
              </div>
              <div style={{ fontSize: '12px', color: 'rgba(255,255,255,0.75)' }}>火山方舟[deepseek-coder] · 3 工具</div>
            </div>
          </div>
        </div>
        <div style={{ padding: '8px 10px', borderTop: '1px solid rgba(255,255,255,0.06)', flexShrink: 0 }}>
          <button style={{ width: '100%', display: 'flex', alignItems: 'center', gap: '6px', padding: '5px 8px', borderRadius: '6px', background: 'none', border: 'none', cursor: 'pointer', color: '#636366', fontSize: '12px' }}>
            <svg fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24" width="12" height="12"><path strokeLinecap="round" strokeLinejoin="round" d="M12 6v6m0 0v6m0-6h6m-6 0H6"/></svg>
            添加智能体
          </button>
        </div>
      </div>

      {/* detail-pane */}
      <main className="detail-pane">
        <div className="toolbar" style={{ justifyContent: 'space-between' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <div style={{ width: '22px', height: '22px', borderRadius: '6px', background: 'linear-gradient(135deg,#8b5cf6,#ec4899)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '9px', fontWeight: 700, color: 'white', flexShrink: 0 }}>PM</div>
            <span style={{ fontSize: '15px', fontWeight: 600, color: '#FFFFFF' }}>产品经理</span>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
            <button className="tbtn tbtn-ghost">取消</button>
            <button className="tbtn tbtn-accent">保存</button>
          </div>
        </div>
        <div style={{ flex: 1, overflowY: 'auto', padding: '12px 16px', display: 'flex', flexDirection: 'column', gap: '18px' }}>
          {/* AI 快速生成 */}
          <section>
            <div className="section-label" style={{ padding: '0 0 5px' }}>AI 快速生成</div>
            <div style={{ display: 'flex', gap: '7px', alignItems: 'center' }}>
              <div style={{ width: '28px', height: '28px', borderRadius: '8px', background: 'linear-gradient(135deg,#8b5cf6,#06b6d4)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                <svg width="14" height="14" fill="none" stroke="white" strokeWidth="2.2" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" d="M13 10V3L4 14h7v7l9-11h-7z"/></svg>
              </div>
              <input type="text" placeholder="用一句话描述智能体，AI 自动生成完整配置…" className="field-input" style={{ flex: 1 }} />
              <button className="tbtn tbtn-accent" style={{ whiteSpace: 'nowrap' }}>生成配置</button>
            </div>
          </section>
          {/* 基本信息 */}
          <section>
            <div className="section-label" style={{ padding: '0 0 5px' }}>基本信息</div>
            <div className="group">
              <div className="group-row" style={{ gap: '10px' }}>
                <span className="group-label">显示名称</span>
                <input type="text" defaultValue="产品经理" className="field-input" style={{ flex: 1 }} />
              </div>
              <div className="group-row" style={{ gap: '10px' }}>
                <span className="group-label">英文标识</span>
                <input type="text" defaultValue="product_manager" className="field-input" style={{ flex: 1, fontFamily: "'SF Mono','Menlo',monospace" }} />
              </div>
              <div className="group-row" style={{ gap: '10px', alignItems: 'flex-start' }}>
                <span className="group-label" style={{ paddingTop: '2px' }}>简介</span>
                <textarea className="field-input" rows={2} style={{ flex: 1, padding: '5px 9px', lineHeight: 1.5, resize: 'none' }} defaultValue="负责产品规划、需求分析和项目管理的产品经理"></textarea>
              </div>
            </div>
          </section>
          {/* 模型与工具 */}
          <section>
            <div className="section-label" style={{ padding: '0 0 5px' }}>模型与工具</div>
            <div className="group">
              <div className="group-row" style={{ gap: '10px' }}>
                <span className="group-label">使用模型</span>
                <div style={{ position: 'relative', flex: 1 }}>
                  <select className="field-input" style={{ width: '100%', paddingRight: '24px' }}>
                    <optgroup label="阿里云百炼">
                      <option>百炼[qwen-max]</option>
                      <option>百炼[qwen-plus]</option>
                      <option>百炼[qwen-turbo]</option>
                    </optgroup>
                    <optgroup label="火山方舟">
                      <option>火山方舟[deepseek-v3]</option>
                      <option>火山方舟[deepseek-r1]</option>
                    </optgroup>
                  </select>
                  <svg style={{ position: 'absolute', right: '8px', top: '50%', transform: 'translateY(-50%)', pointerEvents: 'none', color: '#636366' }} width="10" height="10" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7"/></svg>
                </div>
              </div>
              <div style={{ padding: '5px 12px 2px', fontSize: '11px', fontWeight: 600, letterSpacing: '0.04em', color: 'rgba(255,255,255,0.5)', textTransform: 'uppercase', borderTop: '1px solid rgba(255,255,255,0.12)' }}>工具权限 <span style={{ marginLeft: '6px', color: 'rgba(255,255,255,0.4)' }}>3</span></div>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px', padding: '6px 12px 8px' }}>
                {/* tool chips */}
                <button style={{ display: 'inline-flex', alignItems: 'center', gap: '5px', padding: '4px 8px', borderRadius: '6px', background: 'rgba(139,92,246,0.18)', border: '1px solid rgba(139,92,246,0.3)', color: '#a78bfa', fontSize: '12px', cursor: 'pointer', fontFamily: 'inherit' }}>
                  <svg width="14" height="14" fill="none" stroke="currentColor" strokeWidth="1.5" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z"/></svg>
                  web_search
                </button>
                <button style={{ display: 'inline-flex', alignItems: 'center', gap: '5px', padding: '4px 8px', borderRadius: '6px', background: 'rgba(139,92,246,0.18)', border: '1px solid rgba(139,92,246,0.3)', color: '#a78bfa', fontSize: '12px', cursor: 'pointer', fontFamily: 'inherit' }}>
                  <svg width="14" height="14" fill="none" stroke="currentColor" strokeWidth="1.5" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" d="M10 20l4-16m4 4l-4-4m4 4l4-16"/></svg>
                  code_interpreter
                </button>
                <button style={{ display: 'inline-flex', alignItems: 'center', gap: '5px', padding: '4px 8px', borderRadius: '6px', background: 'rgba(139,92,246,0.18)', border: '1px solid rgba(139,92,246,0.3)', color: '#a78bfa', fontSize: '12px', cursor: 'pointer', fontFamily: 'inherit' }}>
                  <svg width="14" height="14" fill="none" stroke="currentColor" strokeWidth="1.5" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"/></svg>
                  file_reader
                </button>
                <button style={{ display: 'inline-flex', alignItems: 'center', gap: '5px', padding: '4px 8px', borderRadius: '6px', background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.1)', color: 'rgba(235,235,245,0.5)', fontSize: '12px', cursor: 'pointer', fontFamily: 'inherit' }}>
                  <svg width="14" height="14" fill="none" stroke="currentColor" strokeWidth="1.5" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z"/></svg>
                  feishu_message
                </button>
                <button style={{ display: 'inline-flex', alignItems: 'center', gap: '5px', padding: '4px 8px', borderRadius: '6px', background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.1)', color: 'rgba(235,235,245,0.5)', fontSize: '12px', cursor: 'pointer', fontFamily: 'inherit' }}>
                  <svg width="14" height="14" fill="none" stroke="currentColor" strokeWidth="1.5" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z"/></svg>
                  image_analysis
                </button>
              </div>
            </div>
          </section>
          {/* 护栏规则 */}
          <section>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '5px' }}>
              <span className="section-label" style={{ padding: 0 }}>护栏规则</span>
              <button style={{ fontSize: '11px', color: '#a78bfa', background: 'none', border: 'none', cursor: 'pointer', padding: 0 }}>可视化配置</button>
            </div>
            <div style={{ display: 'flex', gap: '8px' }}>
              <div className="guardrail-col">
                <div style={{ display: 'flex', alignItems: 'center', gap: '5px', marginBottom: '6px' }}>
                  <svg fill="none" stroke="#34c759" strokeWidth="2.5" viewBox="0 0 24 24" width="12" height="12"><path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7"/></svg>
                  <span style={{ fontSize: '11px', fontWeight: 500, color: '#34c759' }}>允许范围</span>
                </div>
                <ul style={{ listStyle: 'none', padding: 0, margin: 0, display: 'flex', flexDirection: 'column', gap: '3px' }}>
                  <li style={{ fontSize: '12px', color: 'rgba(255,255,255,0.7)' }}>· 回答产品相关问题</li>
                  <li style={{ fontSize: '12px', color: 'rgba(255,255,255,0.7)' }}>· 生成 PRD 文档</li>
                  <li style={{ fontSize: '12px', color: 'rgba(255,255,255,0.7)' }}>· 分析竞品功能</li>
                  <li style={{ fontSize: '12px', color: 'rgba(255,255,255,0.7)' }}>· 制定项目计划</li>
                </ul>
              </div>
              <div className="guardrail-col">
                <div style={{ display: 'flex', alignItems: 'center', gap: '5px', marginBottom: '6px' }}>
                  <svg fill="none" stroke="#f43f5e" strokeWidth="2.5" viewBox="0 0 24 24" width="12" height="12"><path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12"/></svg>
                  <span style={{ fontSize: '11px', fontWeight: 500, color: '#f43f5e' }}>禁止范围</span>
                </div>
                <ul style={{ listStyle: 'none', padding: 0, margin: 0, display: 'flex', flexDirection: 'column', gap: '3px' }}>
                  <li style={{ fontSize: '12px', color: 'rgba(255,255,255,0.7)' }}>· 编写代码实现</li>
                  <li style={{ fontSize: '12px', color: 'rgba(255,255,255,0.7)' }}>· 执行系统命令</li>
                  <li style={{ fontSize: '12px', color: 'rgba(255,255,255,0.7)' }}>· 访问敏感数据</li>
                  <li style={{ fontSize: '12px', color: 'rgba(255,255,255,0.7)' }}>· 修改配置文件</li>
                </ul>
              </div>
            </div>
          </section>
          {/* 人格配置 */}
          <section>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '7px' }}>
              <span className="section-label" style={{ padding: 0 }}>人格配置</span>
              <div style={{ display: 'flex', gap: '5px' }}>
                <button className="tbtn tbtn-ghost" style={{ padding: '1px 8px', fontSize: '11px' }}>导入</button>
                <button className="tbtn tbtn-ghost" style={{ padding: '1px 8px', fontSize: '11px' }}>导出</button>
              </div>
            </div>
            <div style={{ display: 'flex', gap: '4px', flexWrap: 'wrap', marginBottom: '8px' }}>
              <button className="soul-tab active">SOUL</button>
              <button className="soul-tab">IDENTITY</button>
              <button className="soul-tab">AGENTS</button>
              <button className="soul-tab">USER</button>
              <button className="soul-tab">MEMORY</button>
              <button className="soul-tab">HEARTBEAT</button>
              <button className="soul-tab">TOOLS</button>
            </div>
            <div style={{ fontSize: '11px', color: '#636366', marginBottom: '7px', lineHeight: 1.5 }}>定义 Agent 的人格、沟通风格与行为边界，每次会话开始时加载。</div>
            <div style={{ borderRadius: '8px', overflow: 'hidden', border: '1px solid rgba(255,255,255,0.08)' }}>
              <div style={{ height: '26px', background: '#2C2C2E', display: 'flex', alignItems: 'center', padding: '0 10px', borderBottom: '1px solid rgba(255,255,255,0.08)' }}>
                <span style={{ fontSize: '11px', color: '#636366', fontFamily: "'SF Mono','Menlo',monospace" }}>SOUL.md</span>
              </div>
              <textarea className="field-textarea" rows={10} spellCheck={false} defaultValue={`# 产品经理\n\n## 人格设定\n你是一位资深产品经理，拥有10年SaaS产品经验，擅长敏捷开发与用户中心设计。\n\n## 沟通风格\n- 专业、清晰、结构化\n- 使用产品术语时附带解释\n- 提供可落地的具体建议\n\n## 行为边界\n- 聚焦于产品、需求与项目管理领域\n- 不编写代码实现，不执行系统命令\n- 遇到超出范围的问题礼貌说明并引导`}></textarea>
            </div>
          </section>
        </div>
      </main>
    </>
  )
}
