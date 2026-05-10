// pages-global.jsx — global pages: Overview, Companies, Providers, Office, Logs, Activities, Settings

const { useState, useMemo, useEffect, useRef } = React;

// ============ OVERVIEW ============
function OverviewPage({ data, onEnter }) {
  const totals = useMemo(() => ({
    companies: data.COMPANIES.length,
    agents: data.COMPANIES.reduce((s, c) => s + c.agents, 0),
    channels: data.COMPANIES.reduce((s, c) => s + c.channels, 0),
    msgsToday: 4123,
  }), [data]);
  const running = data.COMPANIES.filter(c => c.status === "running");
  const maxMsg = Math.max(...running.map(c => c.messages));

  const metrics = [
    { lbl: "公司总数", val: totals.companies, delta: "+2 本月", deltaUp: true, icon: "companies" },
    { lbl: "智能体总数", val: totals.agents, delta: "+5 本周", deltaUp: true, icon: "agents" },
    { lbl: "飞书频道", val: totals.channels, delta: "持平", deltaUp: null, icon: "bindings" },
    { lbl: "今日消息", val: totals.msgsToday.toLocaleString(), delta: "+12.4%", deltaUp: true, icon: "activity" },
  ];

  return (
    <div className="overview fade-in">
      <div>
        <h1 className="page-title">数据概览</h1>
        <p className="page-sub">{new Date().toLocaleDateString('zh-CN', {month:'long', day:'numeric', weekday:'long'})} · 全局运营大盘</p>
      </div>

      <div className="metric-grid">
        {metrics.map((m, i) => (
          <div className="metric-card" key={i}>
            <div className="metric-card-head">
              <div className="metric-card-label">{m.lbl}</div>
              <div className="metric-card-icon"><Icon name={m.icon} size={14}/></div>
            </div>
            <div className="metric-card-value">{m.val}</div>
            {m.delta && <div className={"metric-card-delta " + (m.deltaUp ? "delta-up" : m.deltaUp === false ? "delta-down" : "muted")}>
              {m.deltaUp === true ? "↑" : m.deltaUp === false ? "↓" : "·"} {m.delta} 较昨日
            </div>}
          </div>
        ))}
      </div>

      <div className="row-2">
        <div className="chart-card">
          <div className="chart-head">
            <h3 className="chart-title">各公司消息量</h3>
            <div className="chart-meta">今日 · 14:38 更新</div>
          </div>
          {running.map((c, i) => {
            const pct = (c.messages / maxMsg) * 100;
            return (
              <div className="bar-row" key={c.id}>
                <div className="bar-label">
                  <span style={{fontSize:14}}>{c.emoji}</span>
                  <span>{c.name}</span>
                </div>
                <div className="bar-track">
                  <div className="bar-fill" style={{width: pct + "%", background: c.color, animationDelay: (i*100)+"ms"}}/>
                </div>
                <div className="bar-value">{c.messages.toLocaleString()}</div>
              </div>
            );
          })}
        </div>

        <div className="chart-card">
          <div className="chart-head">
            <h3 className="chart-title">运行中公司</h3>
            <div className="chart-meta">{running.length} / {data.COMPANIES.length}</div>
          </div>
          <div className="running-list">
            {running.map(c => (
              <div className="running-row" key={c.id}>
                <div className="running-avatar" style={{background: c.color}}>{c.emoji}</div>
                <div className="running-info">
                  <div className="running-name">{c.name}</div>
                  <div className="running-host">{c.host} · {c.lastDeploy}</div>
                </div>
                <span className="dot live"/>
              </div>
            ))}
          </div>
        </div>
      </div>

      <div className="chart-card">
        <div className="chart-head">
          <h3 className="chart-title">今日消息趋势</h3>
          <div className="chart-meta">总计 4,123 条</div>
        </div>
        <Sparkline/>
      </div>
    </div>
  );
}

function Sparkline() {
  // Hours 0..23 — two series: 消息量 (left axis) + 平均响应时长 ms (right axis)
  const messages = [12, 18, 24, 22, 30, 38, 45, 52, 48, 55, 62, 70, 68, 75, 82, 90, 95, 88, 92, 86, 80, 74, 65, 52];
  const latency  = [620, 540, 480, 510, 580, 720, 810, 920, 870, 890, 840, 950, 1020, 980, 1100, 1280, 1320, 1180, 1260, 1080, 940, 820, 720, 640];
  const yesterday = [10, 14, 19, 18, 24, 30, 38, 44, 42, 48, 54, 60, 58, 64, 70, 78, 82, 76, 80, 75, 70, 64, 56, 45];

  const w = 880, h = 220, padL = 36, padR = 44, padT = 16, padB = 28;
  const innerW = w - padL - padR;
  const innerH = h - padT - padB;

  const maxL = Math.ceil(Math.max(...messages, ...yesterday) / 20) * 20; // left axis max
  const maxR = Math.ceil(Math.max(...latency) / 200) * 200; // right axis max (ms)

  const x = (i) => padL + (i / (messages.length - 1)) * innerW;
  const yL = (v) => padT + innerH - (v / maxL) * innerH;
  const yR = (v) => padT + innerH - (v / maxR) * innerH;

  const buildPath = (arr, yFn) => arr.map((v, i) => (i === 0 ? "M" : "L") + x(i) + "," + yFn(v)).join(" ");
  const msgPath = buildPath(messages, yL);
  const yPath   = buildPath(yesterday, yL);
  const latPath = buildPath(latency, yR);
  const msgArea = msgPath + ` L${x(messages.length-1)},${padT+innerH} L${padL},${padT+innerH} Z`;

  const [hover, setHover] = useState(null);

  const onMove = (e) => {
    const svg = e.currentTarget;
    const rect = svg.getBoundingClientRect();
    const px = ((e.clientX - rect.left) / rect.width) * w;
    const ratio = Math.max(0, Math.min(1, (px - padL) / innerW));
    const idx = Math.round(ratio * (messages.length - 1));
    setHover(idx);
  };

  // y-axis ticks (4 ticks)
  const ticksL = [0, 0.25, 0.5, 0.75, 1].map(t => Math.round(maxL * t));
  const ticksR = [0, 0.25, 0.5, 0.75, 1].map(t => Math.round(maxR * t));

  return (
    <div style={{position:"relative"}}>
      <div style={{display:"flex", gap:18, marginBottom:8, fontSize:12, color:"var(--text-tertiary)"}}>
        <span style={{display:"inline-flex", alignItems:"center", gap:6}}>
          <span style={{width:10, height:2, background:"var(--accent)"}}/> 消息量
        </span>
        <span style={{display:"inline-flex", alignItems:"center", gap:6}}>
          <span style={{width:10, height:2, background:"var(--text-muted)", borderTop:"1px dashed"}}/> 昨日同期
        </span>
        <span style={{display:"inline-flex", alignItems:"center", gap:6}}>
          <span style={{width:10, height:2, background:"var(--mint)"}}/> 平均响应 (ms)
        </span>
      </div>
      <svg viewBox={`0 0 ${w} ${h}`} style={{width:"100%", height: 240, display:"block"}}
           onMouseMove={onMove} onMouseLeave={() => setHover(null)}>
        <defs>
          <linearGradient id="sp" x1="0" x2="0" y1="0" y2="1">
            <stop offset="0%" stopColor="var(--accent)" stopOpacity="0.32"/>
            <stop offset="100%" stopColor="var(--accent)" stopOpacity="0"/>
          </linearGradient>
        </defs>

        {/* Horizontal gridlines + left ticks */}
        {ticksL.map((t, i) => {
          const yy = padT + innerH - (i / 4) * innerH;
          return (
            <g key={i}>
              <line x1={padL} x2={padL + innerW} y1={yy} y2={yy} stroke="var(--border-subtle)" strokeWidth="1"/>
              <text x={padL - 8} y={yy + 3} fontSize="10" fill="var(--text-muted)" textAnchor="end">{t}</text>
            </g>
          );
        })}
        {/* Right axis ticks */}
        {ticksR.map((t, i) => {
          const yy = padT + innerH - (i / 4) * innerH;
          return <text key={i} x={padL + innerW + 8} y={yy + 3} fontSize="10" fill="var(--mint)" textAnchor="start" opacity="0.7">{t}</text>;
        })}

        {/* Yesterday baseline (dashed) */}
        <path d={yPath} stroke="var(--text-muted)" strokeWidth="1.2" fill="none" strokeDasharray="3 3"/>

        {/* Messages area + line */}
        <path d={msgArea} fill="url(#sp)"/>
        <path d={msgPath} stroke="var(--accent)" strokeWidth="2" fill="none"/>

        {/* Latency line (right axis) */}
        <path d={latPath} stroke="var(--mint)" strokeWidth="1.5" fill="none" strokeDasharray="0"/>

        {/* Hour labels */}
        {messages.map((p, i) => i % 4 === 0 && (
          <text key={i} x={x(i)} y={h - 8} fontSize="10" fill="var(--text-muted)" textAnchor="middle">{i.toString().padStart(2,"0")}:00</text>
        ))}

        {/* Hover indicators */}
        {hover != null && (
          <g>
            <line x1={x(hover)} x2={x(hover)} y1={padT} y2={padT+innerH} stroke="var(--border-strong)" strokeWidth="1"/>
            <circle cx={x(hover)} cy={yL(messages[hover])} r="4" fill="var(--accent)" stroke="var(--bg-surface)" strokeWidth="2"/>
            <circle cx={x(hover)} cy={yR(latency[hover])} r="4" fill="var(--mint)" stroke="var(--bg-surface)" strokeWidth="2"/>
          </g>
        )}
      </svg>
      {hover != null && (
        <div style={{
          position:"absolute",
          left: `calc(${(x(hover) / w) * 100}% + 8px)`,
          top: 28,
          background:"var(--bg-elevated)",
          border:"1px solid var(--border-default)",
          borderRadius: 8,
          padding:"8px 12px",
          fontSize: 11.5,
          pointerEvents:"none",
          minWidth: 140,
          boxShadow:"var(--shadow-md)"
        }}>
          <div style={{color:"var(--text-tertiary)", marginBottom:6, fontFamily:"var(--font-mono)"}}>{hover.toString().padStart(2,"0")}:00 — {(hover+1).toString().padStart(2,"0")}:00</div>
          <div style={{display:"flex", justifyContent:"space-between", gap:14, alignItems:"center"}}>
            <span style={{color:"var(--text-secondary)"}}>消息</span>
            <span style={{color:"var(--accent)", fontWeight:600, fontVariantNumeric:"tabular-nums"}}>{messages[hover]}</span>
          </div>
          <div style={{display:"flex", justifyContent:"space-between", gap:14}}>
            <span style={{color:"var(--text-secondary)"}}>响应</span>
            <span style={{color:"var(--mint)", fontWeight:600, fontVariantNumeric:"tabular-nums"}}>{latency[hover]} ms</span>
          </div>
          <div style={{display:"flex", justifyContent:"space-between", gap:14, marginTop: 4, paddingTop: 4, borderTop:"1px solid var(--border-subtle)"}}>
            <span style={{color:"var(--text-tertiary)"}}>昨日</span>
            <span style={{color:"var(--text-tertiary)", fontVariantNumeric:"tabular-nums"}}>{yesterday[hover]}</span>
          </div>
        </div>
      )}
    </div>
  );
}

// ============ COMPANIES ============
function CompaniesPage({ data, onEnter, onCreate }) {
  const [q, setQ] = useState("");
  const [filter, setFilter] = useState("all");
  const filtered = data.COMPANIES.filter(c =>
    (filter === "all" || c.status === filter) &&
    (c.name.includes(q) || c.id.includes(q))
  );
  return (
    <div className="companies fade-in">
      <div>
        <h1 className="page-title">公司列表</h1>
        <p className="page-sub">管理 OPC 团队（子公司）配置</p>
      </div>
      <div className="toolbar" style={{marginTop:24}}>
        <input className="search-input" placeholder="搜索公司名称或标识…" value={q} onChange={e => setQ(e.target.value)}/>
        <div className="filter-tabs">
          {[["all","全部"],["running","运行中"],["stopped","已停止"]].map(([k,v]) => (
            <div key={k} className={"filter-tab " + (filter === k ? "active" : "")} onClick={() => setFilter(k)}>{v}</div>
          ))}
        </div>
        <div className="toolbar-spacer"/>
        <button className="btn btn-primary" onClick={onCreate}><Icon name="plus" size={14}/> 创建公司</button>
      </div>
      <div className="company-grid">
        {filtered.map(c => (
          <div className="company-card" key={c.id}>
            <div className="company-card-head">
              <div className="company-avatar" style={{background: c.color}}>{c.emoji}</div>
              <div className="company-card-info">
                <div className="company-card-name">{c.name}</div>
                <div className="company-card-id">{c.id}</div>
              </div>
              {c.status === "running"
                ? <span className="tag success"><span className="dot live"/> 运行中</span>
                : <span className="tag"><span className="dot"/> 已停止</span>}
            </div>
            <div className="company-card-stats">
              <div className="stat-item"><div className="stat-num">{c.agents}</div><div className="stat-lbl">智能体</div></div>
              <div className="stat-item"><div className="stat-num">{c.channels}</div><div className="stat-lbl">飞书频道</div></div>
              <div className="stat-item"><div className="stat-num">{c.messages > 0 ? c.messages.toLocaleString() : "—"}</div><div className="stat-lbl">今日消息</div></div>
            </div>
            <div className="company-card-actions">
              <button className="btn btn-primary btn-sm" onClick={() => onEnter(c.id)}>进入公司 <Icon name="arrowRight" size={12}/></button>
              <button className="btn btn-sm btn-ghost btn-icon" title="删除"><Icon name="trash" size={14}/></button>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

// ============ PROVIDERS ============
function ProvidersPage({ data }) {
  const [selectedId, setSelectedId] = useState(data.PROVIDERS[0].id);
  const [editing, setEditing] = useState(false);
  const selected = data.PROVIDERS.find(p => p.id === selectedId);

  return (
    <div style={{display:"flex", flexDirection:"column", height:"100%"}}>
      <div className="split" style={{flex:1, minHeight:0}}>
        <div className="split-list">
          <div className="split-list-header">
            <div className="split-list-title">提供商 · {data.PROVIDERS.length}</div>
            <button className="btn btn-sm btn-ghost btn-icon"><Icon name="search" size={13}/></button>
          </div>
          <div className="split-list-body">
            {data.PROVIDERS.map(p => (
              <div key={p.id} className={"list-row " + (p.id === selectedId ? "selected" : "")} onClick={() => { setSelectedId(p.id); setEditing(false); }}>
                <div className="list-row-avatar" style={{background: p.color, color: "var(--text-on-accent)"}}>{p.icon}</div>
                <div className="list-row-info">
                  <div className="list-row-title">{p.name}</div>
                  <div className="list-row-meta">
                    <span className={"dot " + (p.status === "connected" ? "live" : p.status === "warning" ? "warn" : "danger")}/>
                    <span>{p.protocol}</span>
                    <span>·</span>
                    <span>{p.models.length} 模型</span>
                  </div>
                </div>
              </div>
            ))}
            <div className="split-list-add"><Icon name="plus" size={14}/> 添加提供商</div>
          </div>
        </div>
        <div className="split-detail">
          <div className="detail-header">
            <div className="detail-avatar-lg" style={{background: selected.color, color:"var(--text-on-accent)"}}>{selected.icon}</div>
            <div>
              <h2 className="detail-title">{selected.name}</h2>
              <div className="detail-sub">
                <span className="tag accent">{selected.protocol}</span>
                <span className={"tag " + (selected.status === "connected" ? "success" : selected.status === "warning" ? "warn" : "danger")}>
                  <span className={"dot " + (selected.status === "connected" ? "live" : selected.status === "warning" ? "warn" : "danger")}/>
                  {selected.status === "connected" ? "已连接" : selected.status === "warning" ? "凭证过期" : "未连接"}
                </span>
                <span>· 上次测试 {selected.lastTest}</span>
              </div>
            </div>
            <div className="detail-actions">
              <button className="btn btn-sm"><Icon name="refresh" size={13}/> 测试连接</button>
              <button className="btn btn-sm" onClick={() => setEditing(!editing)}><Icon name={editing ? "close" : "edit"} size={13}/> {editing ? "取消" : "编辑"}</button>
              {editing && <button className="btn btn-sm btn-primary"><Icon name="save" size={13}/> 保存</button>}
              <button className="btn btn-sm btn-danger btn-icon"><Icon name="trash" size={13}/></button>
            </div>
          </div>
          <div className="detail-body">
            <div className="section-card">
              <div className="section-card-head">
                <div>
                  <h3 className="section-card-title">提供商信息</h3>
                  <div className="section-card-sub">连接配置和凭证</div>
                </div>
              </div>
              <div className="section-card-body">
                <FieldRow label="名称" hint="显示在列表中">
                  {editing ? <input className="input" defaultValue={selected.name}/> : <div className="read-value">{selected.name}</div>}
                </FieldRow>
                <FieldRow label="API 协议" hint="决定请求格式">
                  {editing ? (
                    <div className="seg">
                      {["OpenAI","Anthropic","Gemini"].map(p => <div key={p} className={"seg-item " + (selected.protocol === p ? "active" : "")}>{p}</div>)}
                    </div>
                  ) : <div className="read-value"><span className="tag accent">{selected.protocol}</span></div>}
                </FieldRow>
                <FieldRow label="Base URL">
                  {editing ? <input className="input" defaultValue={selected.baseUrl}/> : <div className="read-value mono">{selected.baseUrl}</div>}
                </FieldRow>
                <FieldRow label="API Key">
                  {editing ? <input className="input" type="password" placeholder="sk-..."/> : <div className="read-value mono">{selected.apiKey}</div>}
                </FieldRow>
              </div>
            </div>

            <div className="section-card">
              <div className="section-card-head">
                <div>
                  <h3 className="section-card-title">模型列表 · {selected.models.length}</h3>
                  <div className="section-card-sub">该提供商可用的模型</div>
                </div>
                <button className="btn btn-sm"><Icon name="plus" size={13}/> 添加模型</button>
              </div>
              <table className="tbl">
                <thead><tr><th>Model ID</th><th>名称</th><th>上下文</th><th>输入类型</th><th>视觉</th><th></th></tr></thead>
                <tbody>
                  {selected.models.map(m => (
                    <tr key={m.id}>
                      <td className="mono">{m.id}</td>
                      <td>{m.name}</td>
                      <td>{m.ctx}</td>
                      <td><span style={{color:"var(--text-tertiary)"}}>{m.inputs}</span></td>
                      <td>{m.vision ? <Icon name="check" size={14} style={{color:"var(--success)"}}/> : <span className="muted">—</span>}</td>
                      <td style={{textAlign:"right"}}>
                        <button className="btn btn-sm btn-ghost btn-icon"><Icon name="edit" size={13}/></button>
                        <button className="btn btn-sm btn-ghost btn-icon"><Icon name="trash" size={13}/></button>
                      </td>
                    </tr>
                  ))}
                  {selected.models.length === 0 && (
                    <tr><td colSpan={6} style={{textAlign:"center", padding:"32px", color:"var(--text-tertiary)"}}>还没有模型 · 点击「添加模型」开始配置</td></tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

function FieldRow({label, hint, children}) {
  return (
    <div className="field-row">
      <div className="field-label-cell">
        <div className="field-name">{label}</div>
        {hint && <div className="field-hint">{hint}</div>}
      </div>
      <div className="field-value-cell">{children}</div>
    </div>
  );
}

// ============ OFFICE ============
function OfficePage({ data, onInstall }) {
  const [selectedId, setSelectedId] = useState(data.OFFICES[0].id);
  // local override of receptionist by office id (drag-and-drop swap)
  const [recOverrides, setRecOverrides] = useState({});
  // most recently swapped office id (drives swap animation in header)
  const [swapPulse, setSwapPulse] = useState(null);
  const baseSelected = data.OFFICES.find(o => o.id === selectedId);
  const selected = { ...baseSelected, receptionist: recOverrides[selectedId] || baseSelected.receptionist };
  const [remote, setRemote] = useState(selected.remote);
  useEffect(() => setRemote(selected.remote), [selectedId]);
  const setReceptionist = (officeId, emoji) => {
    setRecOverrides(prev => ({ ...prev, [officeId]: emoji }));
    setSwapPulse(officeId + "-" + Date.now());
  };

  return (
    <div className="split" style={{height:"100%"}}>
      <div className="split-list">
        <div className="split-list-header">
          <div className="split-list-title">办公室 · {data.OFFICES.length}</div>
        </div>
        <div className="split-list-body">
          {data.OFFICES.map(o => {
            const eff = recOverrides[o.id] || o.receptionist;
            return (
            <div key={o.id} className={"list-row " + (o.id === selectedId ? "selected" : "")} onClick={() => setSelectedId(o.id)}>
              <div className="list-row-avatar" style={{background:"var(--bg-elevated)", fontSize:18}}>{eff}</div>
              <div className="list-row-info">
                <div className="list-row-title">{o.name}</div>
                <div className="list-row-meta">
                  <span className={"dot " + (o.daemon.status === "online" ? "live" : "danger")}/>
                  <span style={{fontFamily:"var(--font-mono)"}}>{o.host}</span>
                </div>
              </div>
              <span className="tag" style={{fontSize:10, padding:"2px 6px"}}>{o.level}</span>
            </div>
            );
          })}
          <div className="split-list-add"><Icon name="plus" size={14}/> 添加办公室</div>
        </div>
      </div>
      <div className="split-detail">
        <div className="detail-header">
          <div className="detail-avatar-lg rec-target-avatar" key={swapPulse || selectedId} style={{background:"var(--bg-elevated)", fontSize: 28}}>{selected.receptionist}</div>
          <div>
            <h2 className="detail-title">{selected.name}</h2>
            <div className="detail-sub">
              <span className="tag">{selected.remote ? "远程主机" : "本机"}</span>
              <span style={{fontFamily:"var(--font-mono)"}}>{selected.host}</span>
              <span>·</span>
              <span>装修等级 {selected.level}</span>
            </div>
          </div>
          <div className="detail-actions">
            <button className="btn btn-sm"><Icon name="refresh" size={13}/> 健康检查</button>
            <button className="btn btn-sm btn-primary" onClick={onInstall}><Icon name="wand" size={13}/> 安装物业</button>
          </div>
        </div>
        <div className="detail-body">
          <div className="section-card">
            <div className="section-card-head">
              <h3 className="section-card-title">基本信息</h3>
            </div>
            <div className="section-card-body">
              <FieldRow label="名称">
                <input className="input" defaultValue={selected.name}/>
              </FieldRow>
              <FieldRow label="接待员" hint="拖动右侧头像到左侧接待台 · 会有 swap 动画">
                <ReceptionistDnD office={selected} onSet={(emoji) => setReceptionist(selectedId, emoji)}/>
              </FieldRow>
              <FieldRow label="地址" hint="本机或远程主机">
                <div style={{display:"flex", gap:10, alignItems:"center"}}>
                  <div className="seg">
                    <div className={"seg-item " + (!remote ? "active" : "")} onClick={() => setRemote(false)}>本机</div>
                    <div className={"seg-item " + (remote ? "active" : "")} onClick={() => setRemote(true)}>远程</div>
                  </div>
                  <input className="input" style={{flex:1}} defaultValue={selected.host} disabled={!remote}/>
                  {remote && <button className="btn btn-sm">测试连接</button>}
                </div>
              </FieldRow>
              {remote && <FieldRow label="门禁" hint="SSH 凭证">
                <div className="form-grid">
                  <div>
                    <label className="label">用户名</label>
                    <input className="input" defaultValue="ubuntu"/>
                  </div>
                  <div>
                    <label className="label">认证方式</label>
                    <div className="seg" style={{width:"100%"}}>
                      <div className="seg-item active" style={{flex:1, textAlign:"center"}}>SSH 密钥</div>
                      <div className="seg-item" style={{flex:1, textAlign:"center"}}>密码</div>
                    </div>
                  </div>
                </div>
              </FieldRow>}
              <FieldRow label="装修等级" hint="决定可承载的 Agent 数量">
                <div className="seg">
                  {["HIGH","MEDIUM","LOW"].map(l => <div key={l} className={"seg-item " + (l === selected.level ? "active" : "")}>{l}</div>)}
                </div>
              </FieldRow>
              <FieldRow label="备注">
                <textarea className="textarea" rows={2} placeholder="给同事留个说明…"/>
              </FieldRow>
            </div>
          </div>

          <div className="section-card">
            <div className="section-card-head">
              <h3 className="section-card-title">物业信息</h3>
              <button className="btn btn-sm btn-ghost"><Icon name="refresh" size={13}/> 刷新</button>
            </div>
            <div className="section-card-body">
              <div className="health-grid">
                <div className="health-card">
                  <div className="health-row">
                    <div className="health-name">Daemon</div>
                    {selected.daemon.status === "online"
                      ? <span className="tag success"><span className="dot live"/> 在线</span>
                      : <span className="tag danger"><span className="dot danger"/> 离线</span>}
                  </div>
                  <div className="health-version">{selected.daemon.version}</div>
                </div>
                <div className="health-card">
                  <div className="health-row">
                    <div className="health-name">OpenClaw</div>
                    {selected.openclaw.status === "running"
                      ? <span className="tag success"><span className="dot live"/> 运行中</span>
                      : <span className="tag"><span className="dot"/> 未安装</span>}
                  </div>
                  <div className="health-version">{selected.openclaw.version}</div>
                </div>
              </div>
            </div>
          </div>

          <div className="section-card">
            <div className="section-card-head">
              <div>
                <h3 className="section-card-title">部署历史</h3>
                <div className="section-card-sub">该办公室的部署轨迹</div>
              </div>
            </div>
            <div className="section-card-body">
              <div className="timeline">
                <div className="timeline-item">
                  <div className="timeline-time">2026-05-05 14:38</div>
                  <div className="timeline-title">部署 客服小队</div>
                  <div className="timeline-desc">v2.4.1 · 由 陈一鸣 触发 · 当前运行</div>
                </div>
                <div className="timeline-item done">
                  <div className="timeline-time">2026-05-04 09:12</div>
                  <div className="timeline-title">部署 客服小队</div>
                  <div className="timeline-desc">v2.4.0 · 由 陈一鸣 触发</div>
                </div>
                <div className="timeline-item cancelled">
                  <div className="timeline-time">2026-05-02 16:45</div>
                  <div className="timeline-title">回滚到 v2.3.8</div>
                  <div className="timeline-desc">由 李珊 触发 · 已撤销</div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

// ============ LOGS ============
function LogsPage({data}) {
  return (
    <div className="log-page fade-in">
      <div className="page-header" style={{padding: "0 0 20px", border: "none"}}>
        <div>
          <h1 className="page-title">运行日志</h1>
          <p className="page-sub">操作审计 · 按时间倒序</p>
        </div>
        <div style={{display:"flex", gap:8}}>
          <input className="search-input" style={{width: 240}} placeholder="搜索日志…"/>
          <button className="btn btn-sm">导出 CSV</button>
        </div>
      </div>
      <div className="log-list">
        <div className="log-row" style={{background:"var(--bg-canvas)", fontWeight:600, color:"var(--text-tertiary)", fontSize: 11, letterSpacing:"0.05em", textTransform:"uppercase"}}>
          <div>时间</div><div>操作者</div><div>操作 · 目标</div><div>详情</div><div style={{textAlign:"right"}}>状态</div>
        </div>
        {data.LOGS.map((l, i) => (
          <div className="log-row" key={i}>
            <div className="log-time">{l.time}</div>
            <div className="log-actor">
              {l.actor === "system"
                ? <span className="tag">系统</span>
                : <><span className="log-actor-avatar">{l.actor[0]}</span><span>{l.actor}</span></>}
            </div>
            <div><span className="tag accent" style={{marginRight:8}}>{l.action}</span><span className="mono" style={{fontSize:12}}>{l.target}</span></div>
            <div className="log-detail">{l.detail}</div>
            <div style={{textAlign:"right"}}>
              <span className={"tag " + (l.status === "success" ? "success" : l.status === "warning" ? "warn" : l.status === "danger" ? "danger" : "")}>{l.status}</span>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

// ============ ACTIVITIES ============
function ActivitiesPage({data}) {
  const [activities, setActivities] = useState(data.ACTIVITIES);
  const newestRef = useRef(0);
  useEffect(() => {
    const t = setInterval(() => {
      newestRef.current += 1;
      const sample = data.ACTIVITIES[newestRef.current % data.ACTIVITIES.length];
      setActivities(prev => [{...sample, id: Date.now(), time: "刚刚"}, ...prev].slice(0, 30));
    }, 4000);
    return () => clearInterval(t);
  }, []);
  return (
    <div className="activity-page">
      <div className="activity-stream">
        <div style={{display:"flex", justifyContent:"space-between", alignItems:"center", marginBottom: 16}}>
          <div>
            <h1 className="page-title">实时活动</h1>
            <p className="page-sub">所有 Agent 的消息与工具调用</p>
          </div>
          <div style={{display:"flex", gap:8, alignItems:"center"}}>
            <span className="tag success"><span className="dot live"/> 实时</span>
            <button className="btn btn-sm">暂停</button>
          </div>
        </div>
        {activities.map(a => {
          const agent = data.AGENTS.find(g => g.id === a.agent) || data.AGENTS[0];
          return (
            <div className="activity-row" key={a.id}>
              <div className="activity-avatar" style={{background: agent.color}}>{agent.emoji}</div>
              <div className="activity-content">
                <div className="activity-meta">
                  <span style={{color:"var(--text-primary)", fontWeight: 500}}>{agent.name}</span>
                  <span>{a.action}</span>
                  <span className="mono" style={{color:"var(--accent)"}}>{a.target}</span>
                  <span style={{marginLeft:"auto"}}>{a.time}</span>
                </div>
                <div className="activity-text activity-text-muted">{a.text}</div>
              </div>
            </div>
          );
        })}
      </div>
      <div className="activity-side">
        <h3 className="section-title">活跃 Agent</h3>
        {data.AGENTS.slice(0,4).map(a => (
          <div key={a.id} style={{display:"flex", alignItems:"center", gap:10, padding:"10px 0", borderBottom:"1px solid var(--border-subtle)"}}>
            <div style={{width:32, height:32, borderRadius: 9, display:"grid", placeItems:"center", background: a.color, fontSize: 16}}>{a.emoji}</div>
            <div style={{flex:1}}>
              <div style={{fontSize:13, fontWeight:500}}>{a.name}</div>
              <div style={{fontSize:11, color:"var(--text-tertiary)"}}>{Math.floor(Math.random()*40+5)} 条 / 分钟</div>
            </div>
            <span className="dot live"/>
          </div>
        ))}
        <h3 className="section-title" style={{marginTop:24}}>消息热点</h3>
        <div style={{display:"flex", flexDirection:"column", gap:8}}>
          {data.FEISHU_GROUPS.slice(0,4).map(g => (
            <div key={g.id} style={{padding:"8px 10px", background:"var(--bg-surface)", borderRadius:8, fontSize:12.5, display:"flex", justifyContent:"space-between"}}>
              <span>{g.name}</span>
              <span className="muted">{Math.floor(Math.random()*200+20)}</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

// ============ Receptionist Drag-and-Drop ============
const RECEPTIONIST_POOL = [
  { e: "🦊", name: "晓狐" },
  { e: "🦉", name: "夜枭" },
  { e: "🐢", name: "缓缓" },
  { e: "🐱", name: "三花" },
  { e: "🦝", name: "果子" },
  { e: "🐼", name: "团团" },
  { e: "🦁", name: "金鬃" },
  { e: "🐧", name: "南极" },
  { e: "🦦", name: "水獭" },
  { e: "🐻", name: "棕棕" },
  { e: "🐰", name: "胡萝卜" },
  { e: "🦔", name: "刺刺" },
];

function ReceptionistDnD({ office, onSet }) {
  const [dragging, setDragging] = useState(null);   // emoji being dragged
  const [over, setOver] = useState(false);          // hovering target
  const [dropFx, setDropFx] = useState(null);       // {emoji, ts} for the splash
  const [recentSwap, setRecentSwap] = useState(null); // emoji that was just dropped

  const handleDragStart = (e, emoji) => {
    setDragging(emoji);
    e.dataTransfer.effectAllowed = "move";
    e.dataTransfer.setData("text/plain", emoji);
    // ghost: empty image so our custom cursor preview takes over
    const img = new Image();
    img.src = "data:image/gif;base64,R0lGODlhAQABAAAAACH5BAEKAAEALAAAAAABAAEAAAICTAEAOw==";
    e.dataTransfer.setDragImage(img, 0, 0);
  };
  const handleDragEnd = () => { setDragging(null); setOver(false); };
  const handleDragOver = (e) => { e.preventDefault(); e.dataTransfer.dropEffect = "move"; setOver(true); };
  const handleDragLeave = (e) => {
    if (e.currentTarget.contains(e.relatedTarget)) return;
    setOver(false);
  };
  const handleDrop = (e) => {
    e.preventDefault();
    const emoji = e.dataTransfer.getData("text/plain") || dragging;
    if (!emoji || emoji === office.receptionist) { setOver(false); return; }
    setDropFx({ emoji, ts: Date.now() });
    setRecentSwap(emoji);
    onSet?.(emoji);
    setOver(false);
    setTimeout(() => setDropFx(null), 700);
  };

  return (
    <div className="rec-dnd">
      <div className="rec-dnd-stage">
        {/* Receptionist desk (drop target) */}
        <div
          className={"rec-desk " + (over ? "is-over " : "") + (dragging ? "is-armed " : "")}
          onDragOver={handleDragOver}
          onDragEnter={handleDragOver}
          onDragLeave={handleDragLeave}
          onDrop={handleDrop}>
          <div className="rec-desk-label">
            <Icon name="user" size={11} style={{marginRight: 4, verticalAlign: "-1px"}}/>
            接待台
          </div>
          <div className="rec-desk-slot">
            <div className="rec-desk-glow"/>
            <div className="rec-desk-emoji" key={office.receptionist}>{office.receptionist}</div>
            {dropFx && (
              <div className="rec-drop-splash" key={dropFx.ts}>{dropFx.emoji}</div>
            )}
            <div className="rec-desk-ring"/>
          </div>
          <div className="rec-desk-name">
            {RECEPTIONIST_POOL.find(p => p.e === office.receptionist)?.name || "接待员"}
            <span className="muted" style={{marginLeft: 6, fontSize: 11}}>· {office.name}</span>
          </div>
          <div className={"rec-drop-hint " + (over ? "show" : "")}>
            <Icon name="check" size={12}/> 松手即可换班
          </div>
        </div>

        <div className="rec-arrow">
          <svg width="46" height="22" viewBox="0 0 46 22" fill="none">
            <path d="M2 11 H38 M30 4 L40 11 L30 18" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round" strokeDasharray="3 3"/>
          </svg>
          <span>拖动头像</span>
        </div>

        {/* Palette */}
        <div className="rec-pool">
          <div className="rec-pool-head">
            <span>候选 · {RECEPTIONIST_POOL.length}</span>
            <span className="muted" style={{fontSize: 11}}>按住即可拖</span>
          </div>
          <div className="rec-pool-grid">
            {RECEPTIONIST_POOL.map(p => {
              const isCurrent = p.e === office.receptionist;
              const isJustDropped = p.e === recentSwap;
              return (
                <div
                  key={p.e}
                  className={"rec-tile " + (isCurrent ? "is-current " : "") + (dragging === p.e ? "is-dragging " : "") + (isJustDropped ? "is-just " : "")}
                  draggable={!isCurrent}
                  onDragStart={(e) => handleDragStart(e, p.e)}
                  onDragEnd={handleDragEnd}
                  title={isCurrent ? "正在值班" : `拖到接待台 · ${p.name}`}>
                  <div className="rec-tile-emoji">{p.e}</div>
                  <div className="rec-tile-name">{p.name}</div>
                  {isCurrent && <div className="rec-tile-badge">值班中</div>}
                </div>
              );
            })}
          </div>
        </div>
      </div>
    </div>
  );
}

// ============ SETTINGS ============
function SettingsPage() {
  return (
    <div className="settings-page fade-in">
      <div style={{marginBottom: 24}}>
        <h1 className="page-title">设置</h1>
        <p className="page-sub">全局系统配置</p>
      </div>
      <div className="settings-section">
        <div className="settings-section-head">
          <h3 className="settings-section-title">工作区</h3>
          <p className="settings-section-sub">所有 OPC 配置的根目录</p>
        </div>
        <div className="settings-section-body">
          <FieldRow label="opc_root" hint="存放所有公司配置的目录">
            <input className="input mono" defaultValue="/Users/chen/dev/openclaw/opc"/>
          </FieldRow>
          <FieldRow label="日志保留" hint="超过则自动清理">
            <div className="seg"><div className="seg-item">7 天</div><div className="seg-item active">30 天</div><div className="seg-item">90 天</div><div className="seg-item">永久</div></div>
          </FieldRow>
        </div>
      </div>
      <div className="settings-section">
        <div className="settings-section-head">
          <h3 className="settings-section-title">外观</h3>
          <p className="settings-section-sub">主题与显示偏好</p>
        </div>
        <div className="settings-section-body">
          <FieldRow label="主题">
            <div className="seg"><div className="seg-item active">深色（默认）</div><div className="seg-item">浅色</div><div className="seg-item">跟随系统</div></div>
          </FieldRow>
          <FieldRow label="语言">
            <div className="seg"><div className="seg-item active">简体中文</div><div className="seg-item">English</div></div>
          </FieldRow>
        </div>
      </div>
      <div className="settings-section">
        <div className="settings-section-head">
          <h3 className="settings-section-title">遥测</h3>
          <p className="settings-section-sub">帮助我们改进产品</p>
        </div>
        <div className="settings-section-body">
          <FieldRow label="匿名使用统计">
            <div style={{display:"flex", alignItems:"center", gap:10}}>
              <div className="toggle on"/>
              <span className="muted">已开启</span>
            </div>
          </FieldRow>
          <FieldRow label="崩溃报告">
            <div style={{display:"flex", alignItems:"center", gap:10}}>
              <div className="toggle on"/>
              <span className="muted">已开启</span>
            </div>
          </FieldRow>
        </div>
      </div>
    </div>
  );
}

window.OverviewPage = OverviewPage;
window.CompaniesPage = CompaniesPage;
window.ProvidersPage = ProvidersPage;
window.OfficePage = OfficePage;
window.LogsPage = LogsPage;
window.ActivitiesPage = ActivitiesPage;
window.SettingsPage = SettingsPage;
window.FieldRow = FieldRow;
