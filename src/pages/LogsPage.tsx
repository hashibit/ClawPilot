export default function LogsPage() {
  return (
    <>
      {/* Log stream */}
      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden', minWidth: 0 }}>
        <div className="toolbar" style={{ justifyContent: 'space-between' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <span style={{ fontSize: '15px', fontWeight: 600 }}>运行日志</span>
            <span style={{ fontSize: '11px', color: '#636366' }}>实时流</span>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '5px', padding: '2px 8px', background: 'rgba(52,199,89,0.12)', borderRadius: '5px' }}>
              <span className="pulse-dot" style={{ width: '5px', height: '5px', borderRadius: '50%', background: '#34c759', display: 'inline-block' }}></span>
              <span style={{ fontSize: '11px', color: '#34c759' }}>实时</span>
            </div>
            <button className="tbtn tbtn-ghost" style={{ padding: '2px 8px' }}>
              <svg fill="none" stroke="currentColor" strokeWidth="1.75" viewBox="0 0 24 24" width="13" height="13" style={{ display: 'inline', marginRight: '3px' }}><path strokeLinecap="round" strokeLinejoin="round" d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4"/></svg>
              导出
            </button>
          </div>
        </div>
        <div style={{ flex: 1, overflowY: 'auto', background: '#161618', padding: '10px 14px' }}>
          <div className="log-line log-info">[2024-03-13 14:32:18] [INFO   ] OpenClaw v2.1.0 starting...</div>
          <div className="log-line log-info">[2024-03-13 14:32:18] [INFO   ] Loading configuration from ~/.openclaw/</div>
          <div className="log-line log-info">[2024-03-13 14:32:19] [INFO   ] OPC "互联网公司" loaded (5 agents)</div>
          <div className="log-line log-info">[2024-03-13 14:32:19] [INFO   ] Agent "product_manager" initialized with qwen-max</div>
          <div className="log-line log-info">[2024-03-13 14:32:19] [INFO   ] Agent "ux_designer" initialized with deepseek-v3</div>
          <div className="log-line log-info">[2024-03-13 14:32:19] [INFO   ] Agent "data_analyst" initialized with qwen-max</div>
          <div className="log-line log-info">[2024-03-13 14:32:20] [INFO   ] Agent "tech_writer" initialized with qwen-plus</div>
          <div className="log-line log-info">[2024-03-13 14:32:20] [INFO   ] Agent "qa_engineer" initialized with deepseek-coder</div>
          <div className="log-line log-info">[2024-03-13 14:32:20] [INFO   ] Feishu channel connected: 产品讨论组</div>
          <div className="log-line log-info">[2024-03-13 14:32:21] [INFO   ] Feishu channel connected: 设计交流群</div>
          <div className="log-line log-success">[2024-03-13 14:32:21] [SUCCESS] All systems operational</div>
          <div className="log-line log-info">[2024-03-13 14:35:42] [DISPATCH] [产品讨论组] user_123: "@产品经理 帮我分析一下这个功能"</div>
          <div className="log-line log-agent">[2024-03-13 14:35:42] [AGENT  ] [product_manager] Received message, processing...</div>
          <div className="log-line log-info">[2024-03-13 14:35:43] [LLM    ] Calling qwen-max (streaming)</div>
          <div className="log-line log-info">[2024-03-13 14:35:45] [LLM    ] Response received, 342 tokens</div>
          <div className="log-line log-reply">[2024-03-13 14:35:45] [REPLY  ] [product_manager] -&gt; [产品讨论组]: "我来帮你分析..."</div>
          <div className="log-line log-info">[2024-03-13 14:36:12] [DISPATCH] [设计交流群] user_987: "@UX设计师 这个交互流程有问题"</div>
          <div className="log-line log-agent">[2024-03-13 14:36:12] [AGENT  ] [ux_designer] Received message, processing...</div>
          <div className="log-line log-info">[2024-03-13 14:36:13] [LLM    ] Calling deepseek-v3 (streaming)</div>
          <div className="log-line log-info">[2024-03-13 14:36:16] [LLM    ] Response received, 512 tokens</div>
          <div className="log-line log-reply">[2024-03-13 14:36:16] [REPLY  ] [ux_designer] -&gt; [设计交流群]: "你说得对，这个交互确实存在问题..."</div>
          <div className="log-line log-info">[2024-03-13 14:38:28] [DISPATCH] [产品讨论组] user_555: "@数据分析师 看下昨天的数据"</div>
          <div className="log-line log-agent">[2024-03-13 14:38:28] [AGENT  ] [data_analyst] Received message, processing...</div>
          <div className="log-line log-info">[2024-03-13 14:38:29] [TOOL   ] [data_analyst] Using tool: code_interpreter</div>
          <div className="log-line log-info">[2024-03-13 14:38:32] [TOOL   ] Execution completed successfully</div>
          <div className="log-line log-reply">[2024-03-13 14:38:35] [REPLY  ] [data_analyst] -&gt; [产品讨论组]: "根据昨天的数据分析..."</div>
          <div className="log-line log-warn" style={{ marginTop: '2px' }}>[2024-03-13 14:42:03] [WARN   ] [data_analyst] Tool execution timeout, retrying...</div>
          <div className="log-line log-info">[2024-03-13 14:42:05] [TOOL   ] [data_analyst] Retry successful</div>
          <div className="log-line log-info">[2024-03-13 14:45:22] [INFO   ] Message contains @all, ignoring</div>
        </div>
      </div>
      {/* Filters panel */}
      <div style={{ width: '168px', borderLeft: '1px solid rgba(255,255,255,0.08)', display: 'flex', flexDirection: 'column', overflow: 'hidden', flexShrink: 0 }}>
        <div className="toolbar" style={{ justifyContent: 'flex-start' }}>
          <span style={{ fontSize: '12px', fontWeight: 500, color: '#EBEBF5' }}>过滤</span>
        </div>
        <div style={{ flex: 1, overflowY: 'auto', padding: '8px 12px' }}>
          <div className="section-label" style={{ padding: '0 0 5px' }}>日志级别</div>
          {[
            { label: 'INFO', color: 'rgba(235,235,245,0.85)' },
            { label: 'WARN', color: '#f59e0b' },
            { label: 'ERROR', color: '#f43f5e' },
            { label: 'DISPATCH', color: 'rgba(235,235,245,0.85)' },
            { label: 'REPLY', color: '#06b6d4' },
            { label: 'LLM', color: 'rgba(235,235,245,0.85)' },
            { label: 'SUCCESS', color: '#34c759' },
          ].map(item => (
            <label key={item.label} className="filter-check">
              <input type="checkbox" className="mac-check" defaultChecked />
              <span style={{ color: item.color }}>{item.label}</span>
            </label>
          ))}
          <div className="section-label" style={{ padding: '10px 0 5px' }}>智能体</div>
          {['产品经理', 'UX设计师', '数据分析师', '文档工程师', '质保工程师'].map(agent => (
            <label key={agent} className="filter-check">
              <input type="checkbox" className="mac-check" defaultChecked />
              <span>{agent}</span>
            </label>
          ))}
        </div>
      </div>
    </>
  )
}
