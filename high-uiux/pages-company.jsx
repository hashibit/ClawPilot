// pages-company.jsx — company-space pages: Agents, Bindings, Deploy

const { useState: useStateC, useMemo: useMemoC, useEffect: useEffectC, useRef: useRefC } = React;

// ============ AGENTS ============
function AgentsPage({ data, onTest, onGenerate, onAddSkill, onBatchAdd }) {
  const [view, setView] = useStateC("config"); // 'config' | 'graph'
  const [selectedId, setSelectedId] = useStateC("lead");
  const [editing, setEditing] = useStateC(false);
  const [activeTab, setActiveTab] = useStateC("SOUL");
  const selected = data.AGENTS.find(a => a.id === selectedId);
  const [enabledTools, setEnabledTools] = useStateC(selected.tools);
  useEffectC(() => setEnabledTools(selected.tools), [selectedId]);

  return (
    <div className="agents-page">
      <div className="agent-strip">
        {data.AGENTS.map(a => (
          <div key={a.id}
               className={"agent-pill " + (a.id === selectedId ? "selected " : "") + (a.leader ? "leader" : "")}
               onClick={() => { setSelectedId(a.id); setEditing(false); }}>
            <div className="agent-pill-avatar" style={{background: a.color}}>{a.emoji}</div>
            <div className="agent-pill-name">{a.name}</div>
          </div>
        ))}
        <div className="agent-pill" style={{minWidth: 60}} onClick={() => {}}>
          <div className="agent-pill-add"><Icon name="plus" size={18}/></div>
          <div className="agent-pill-name">添加</div>
        </div>
        <div className="agent-pill" style={{minWidth: 60}} onClick={onBatchAdd}>
          <div className="agent-pill-add" style={{borderStyle:"solid", color:"var(--accent)", borderColor:"var(--accent-border)"}}><Icon name="bolt" size={18}/></div>
          <div className="agent-pill-name">批量</div>
        </div>

        <div style={{marginLeft:"auto", display:"flex", gap:6, alignItems:"center"}}>
          <div className="seg" style={{padding:2}}>
            <div className={"seg-item " + (view === "config" ? "active" : "")} onClick={() => setView("config")}><Icon name="grid" size={12} style={{marginRight:5, verticalAlign:"-2px"}}/>配置</div>
            <div className={"seg-item " + (view === "graph" ? "active" : "")} onClick={() => setView("graph")}><Icon name="network" size={12} style={{marginRight:5, verticalAlign:"-2px"}}/>关系图</div>
          </div>
        </div>
      </div>

      {view === "graph" ? (
        <AgentGraph data={data} selectedId={selectedId} onSelect={setSelectedId}/>
      ) : (
        <>
          <div className="agent-toolbar">
            <div className="agent-pill-avatar" style={{background: selected.color, width:36, height:36, fontSize:18, borderRadius:9}}>{selected.emoji}</div>
            <div className="agent-toolbar-name">
              {selected.name}
              {selected.leader && <span className="tag accent" style={{marginLeft:10}}><Icon name="crown" size={10} style={{marginRight:4, verticalAlign:"-1px"}}/>领队</span>}
              {editing && <span className="unsaved-dot" title="未保存"/>}
            </div>
            <div style={{marginLeft:"auto", display:"flex", gap:6}}>
              <button className="btn btn-sm" onClick={onGenerate}><Icon name="sparkles" size={13}/> AI 一键生成</button>
              <button className="btn btn-sm" onClick={onTest}><Icon name="chat" size={13}/> 测试对话</button>
              {!selected.leader && <button className="btn btn-sm"><Icon name="crown" size={13}/> 设为领队</button>}
              {editing ? (
                <>
                  <button className="btn btn-sm" onClick={() => setEditing(false)}>取消</button>
                  <button className="btn btn-sm btn-primary" onClick={() => setEditing(false)}><Icon name="save" size={13}/> 保存</button>
                </>
              ) : (
                <button className="btn btn-sm btn-primary" onClick={() => setEditing(true)}><Icon name="edit" size={13}/> 编辑</button>
              )}
              <button className="btn btn-sm btn-danger btn-icon"><Icon name="trash" size={13}/></button>
            </div>
          </div>

          <div className="agent-detail">
            <div className="section-card">
              <div className="section-card-head">
                <div>
                  <h3 className="section-card-title">基本信息</h3>
                  <div className="section-card-sub">名称、职位、简介</div>
                </div>
              </div>
              <div className="section-card-body">
                <FieldRow label="显示名称">
                  {editing ? <input className="input" defaultValue={selected.name}/> : <div className="read-value">{selected.name}</div>}
                </FieldRow>
                <FieldRow label="英文标识" hint="文件名与日志中使用">
                  {editing ? <input className="input mono" defaultValue={selected.id}/> : <div className="read-value mono">{selected.id}</div>}
                </FieldRow>
                <FieldRow label="职位">
                  {editing ? <input className="input" defaultValue={selected.role}/> : <div className="read-value">{selected.role}</div>}
                </FieldRow>
                <FieldRow label="简介" hint="一句话说明这位 Agent 做什么">
                  {editing ? <textarea className="textarea" defaultValue={selected.brief} rows={2}/> : <div className="read-value">{selected.brief}</div>}
                </FieldRow>
              </div>
            </div>

            <div className="section-card">
              <div className="section-card-head">
                <div>
                  <h3 className="section-card-title">模型与工具</h3>
                  <div className="section-card-sub">大脑与可调用的能力</div>
                </div>
              </div>
              <div className="section-card-body">
                <FieldRow label="模型">
                  {editing ? (
                    <select className="input" defaultValue={selected.model}>
                      {data.PROVIDERS.flatMap(p => p.models.map(m => <option key={m.id} value={m.id}>{p.name} / {m.name}</option>))}
                    </select>
                  ) : <div className="read-value mono"><span className="tag accent">{selected.model}</span></div>}
                </FieldRow>
                <FieldRow label="工具权限" hint="勾选启用">
                  <div className="tools-grid">
                    {data.TOOLS.map(t => {
                      const on = enabledTools.includes(t.id);
                      return (
                        <div key={t.id}
                             className={"tool-chip " + (on ? "on" : "")}
                             onClick={() => editing && setEnabledTools(on ? enabledTools.filter(x => x !== t.id) : [...enabledTools, t.id])}>
                          <div className="tool-chip-icon">{t.icon}</div>
                          <div className="tool-chip-name">{t.name}</div>
                          <div className="toggle-mini" style={{
                            width:14, height:14, borderRadius:4,
                            background: on ? "var(--accent)" : "var(--bg-elevated)",
                            color: "var(--text-on-accent)", display:"grid", placeItems:"center"
                          }}>
                            {on && <Icon name="check" size={10}/>}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </FieldRow>
              </div>
            </div>

            <div className="section-card">
              <div className="section-card-head">
                <div>
                  <h3 className="section-card-title">技能配置</h3>
                  <div className="section-card-sub">可复用的工作流模板</div>
                </div>
                <button className="btn btn-sm" onClick={onAddSkill}><Icon name="plus" size={13}/> 添加技能</button>
              </div>
              <div className="section-card-body">
                <div className="skill-list">
                  {selected.skills.map((s, i) => (
                    <div className="skill-card" key={i}>
                      <div className="skill-name"><Icon name="star" size={12} style={{color:"var(--accent)"}}/>{s}</div>
                      <div className="skill-desc">已启用 · 本地</div>
                    </div>
                  ))}
                  {editing && (
                    <div className="skill-card skill-add" onClick={onAddSkill}>
                      <Icon name="plus" size={16}/>
                      <span style={{fontSize:12, marginTop: 4}}>从技能库添加</span>
                    </div>
                  )}
                </div>
              </div>
            </div>

            <div className="section-card">
              <div className="section-card-head">
                <div>
                  <h3 className="section-card-title">护栏规则</h3>
                  <div className="section-card-sub">允许 Agent 做什么、禁止做什么</div>
                </div>
              </div>
              <div className="section-card-body">
                <div className="rail-grid">
                  <div className="rail-pane">
                    <div className="rail-head allow"><Icon name="check" size={12}/> 允许 ({selected.allow.length})</div>
                    <div className="rail-body">
                      {selected.allow.map((r, i) => (
                        <span key={i} className="rail-tag allow">{r} {editing && <Icon name="close" size={10}/>}</span>
                      ))}
                      {editing && <span className="rail-tag" style={{borderStyle:"dashed"}}><Icon name="plus" size={10}/> 添加</span>}
                    </div>
                  </div>
                  <div className="rail-pane">
                    <div className="rail-head deny"><Icon name="shield" size={12}/> 禁止 ({selected.deny.length})</div>
                    <div className="rail-body">
                      {selected.deny.map((r, i) => (
                        <span key={i} className="rail-tag deny">{r} {editing && <Icon name="close" size={10}/>}</span>
                      ))}
                      {editing && <span className="rail-tag" style={{borderStyle:"dashed"}}><Icon name="plus" size={10}/> 添加</span>}
                      {selected.deny.length === 0 && !editing && <span className="muted" style={{fontSize:12}}>暂无</span>}
                    </div>
                  </div>
                </div>
              </div>
            </div>

            <div className="section-card" style={{padding: 0, overflow: "hidden"}}>
              <div className="section-card-head">
                <div>
                  <h3 className="section-card-title">人格配置</h3>
                  <div className="section-card-sub">每个 Tab 对应一个 .md 文件</div>
                </div>
                <span className="tag mono" style={{fontSize:11}}>agents/{selected.id}/</span>
              </div>
              <div className="tabs">
                {data.PERSONA_TABS.map(t => (
                  <div key={t} className={"tab " + (t === activeTab ? "active" : "")} onClick={() => setActiveTab(t)}>{t}.md</div>
                ))}
              </div>
              <PersonaEditor tab={activeTab} doc={data.SOUL_DOC}/>
            </div>
          </div>
        </>
      )}
    </div>
  );
}

function PersonaEditor({ tab, doc }) {
  const content = tab === "SOUL" ? doc :
    tab === "IDENTITY" ? `# IDENTITY.md\n\n## 身份\n名字: 林晚\n职位: 客服领队\n司龄: 4 年\n\n## 形象\n声音: 中低音、平和\n口头禅: "我们一起来看看"\n` :
    tab === "AGENTS" ? `# AGENTS.md — 团队成员描述\n\n@阿涛 (tech)\n  - 技术支持\n  - 何时联系: 涉及 API、SDK、代码相关问题\n\n@小满 (billing)\n  - 账务专员\n  - 何时联系: 订阅、发票、退款\n\n@桃子 (growth)\n  - 活动运营\n  - 何时联系: 推荐活动、生成文案\n` :
    tab === "USER" ? `# USER.md — 用户画像\n\n## 主要用户\n- B 端 SaaS 客户\n- 中小企业管理员居多\n- 年龄 28-45\n\n## 用户特征\n- 技术不一定强，但耐心一般\n- 喜欢直接得到答案\n` :
    tab === "MEMORY" ? `# MEMORY.md — 长期记忆\n\n## 重要客户\n- 字节跳动 (VIP)\n- 阿里巴巴 (VIP)\n- 美团 (Pro)\n\n## 当前活动\n- 春日 7 折优惠 至 5/31\n- 老带新双方各得 200 元代金券\n` :
    tab === "HEARTBEAT" ? `# HEARTBEAT.md — 心跳任务\n\n## 每日 9:00\n- 检查昨日未结工单\n- 整理 NPS 反馈\n\n## 每周一 10:00\n- 生成周报草稿发给 @陈一鸣\n` :
    `# TOOLS.md — 自定义工具说明\n\n# 当前启用的工具\n- search: 搜索 知识库 + 互联网\n- read: 读取网页内容\n- feishu: 发送飞书消息\n- file: 读写工作目录\n- http: 调用 HTTP API (GET/POST)\n`;

  // simple syntax highlighting
  const lines = content.split("\n").map((line, i) => {
    if (line.startsWith("# ")) return <span key={i} className="h1">{line}</span>;
    if (line.startsWith("## ")) return <span key={i} className="h2">{line}</span>;
    if (line.trim().startsWith("- ")) return <span key={i}><span className="keyword">{line.match(/^\s*-/)[0]}</span>{line.replace(/^\s*-/, "")}</span>;
    if (line.startsWith("@")) return <span key={i} className="keyword">{line}</span>;
    return <span key={i}>{line}</span>;
  });
  return (
    <div className="editor">
      {lines.map((l, i) => <React.Fragment key={i}>{l}{"\n"}</React.Fragment>)}
      <span className="cursor-blink"/>
    </div>
  );
}

// Agent relationship graph — directional bezier curves
function AgentGraph({ data, selectedId, onSelect }) {
  const leader = data.AGENTS.find(a => a.leader);
  const others = data.AGENTS.filter(a => !a.leader);

  // Pixel space layout — leader center, others around in a ring
  const W = 920, H = 520;
  const cx = W / 2, cy = H / 2;
  const NODE_R = 34;            // half of node 68px box
  const ringR = Math.min(W, H) * 0.34;

  const positions = {};
  positions[leader.id] = { x: cx, y: cy };
  others.forEach((a, i) => {
    // start at top, go clockwise
    const angle = (i / others.length) * Math.PI * 2 - Math.PI / 2;
    positions[a.id] = {
      x: cx + ringR * Math.cos(angle),
      y: cy + ringR * Math.sin(angle),
    };
  });

  // Build directed edges: leader → each subordinate (downward delegation),
  // plus a couple peer edges to show cross-agent collaboration.
  const edges = [];
  others.forEach((a, i) => {
    edges.push({ from: leader.id, to: a.id, kind: "delegate", active: i % 3 !== 2 });
  });
  // peer edges (cyclic, every-other)
  if (others.length >= 2) {
    for (let i = 0; i < others.length; i += 2) {
      const j = (i + 1) % others.length;
      edges.push({ from: others[i].id, to: others[j].id, kind: "peer", active: i % 2 === 0 });
    }
  }

  // Cubic bezier from p1 to p2; trim each end by NODE_R+gap so arrow
  // sits cleanly at the node edge instead of behind it.
  const buildPath = (p1, p2, kind) => {
    const dx = p2.x - p1.x, dy = p2.y - p1.y;
    const dist = Math.hypot(dx, dy) || 1;
    const ux = dx / dist, uy = dy / dist;

    // Trim endpoints
    const gap = 6;
    const a = { x: p1.x + ux * (NODE_R + gap), y: p1.y + uy * (NODE_R + gap) };
    const b = { x: p2.x - ux * (NODE_R + gap + 8), y: p2.y - uy * (NODE_R + gap + 8) };

    // Perpendicular for curvature
    const px = -uy, py = ux;
    const curve = kind === "peer" ? dist * 0.35 : dist * 0.18;
    const c1 = { x: a.x + ux * dist * 0.25 + px * curve * 0.5, y: a.y + uy * dist * 0.25 + py * curve * 0.5 };
    const c2 = { x: b.x - ux * dist * 0.25 + px * curve * 0.5, y: b.y - uy * dist * 0.25 + py * curve * 0.5 };
    return `M ${a.x} ${a.y} C ${c1.x} ${c1.y}, ${c2.x} ${c2.y}, ${b.x} ${b.y}`;
  };

  // Edge stats for header
  const activeCount = edges.filter(e => e.active).length;

  return (
    <div className="agent-graph-wrap">
      <div className="agent-graph-head">
        <div>
          <h3 className="agent-graph-title">团队关系图</h3>
          <p className="agent-graph-sub">
            领队居中 · 实线箭头表示<b style={{color:"var(--text-secondary)"}}>委派</b>
            <span className="muted"> · </span>
            虚线弧表示<b style={{color:"var(--text-secondary)"}}>同侪协作</b>
            <span className="muted"> · </span>
            <span className="dot live" style={{verticalAlign:"middle"}}/> 高亮代表此刻有活跃通信
          </p>
        </div>
        <div className="agent-graph-actions">
          <span className="tag accent"><span className="dot live" style={{marginRight:4}}/> {activeCount} 路活跃 / {edges.length}</span>
          <button className="btn btn-sm">导出 SVG</button>
        </div>
      </div>

      <div className="agent-graph-canvas">
        <svg className="agent-graph-svg" viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="xMidYMid meet">
          <defs>
            {/* Subtle dot grid background */}
            <pattern id="grid-dots" width="22" height="22" patternUnits="userSpaceOnUse">
              <circle cx="1" cy="1" r="1" fill="var(--border-subtle)"/>
            </pattern>
            {/* Soft radial glow behind leader */}
            <radialGradient id="leader-halo" cx="50%" cy="50%" r="50%">
              <stop offset="0%" stopColor="var(--accent)" stopOpacity="0.18"/>
              <stop offset="60%" stopColor="var(--accent)" stopOpacity="0.04"/>
              <stop offset="100%" stopColor="var(--accent)" stopOpacity="0"/>
            </radialGradient>
            {/* Arrowheads */}
            <marker id="arrow-idle" viewBox="0 0 10 10" refX="8" refY="5"
                    markerWidth="7" markerHeight="7" orient="auto-start-reverse">
              <path d="M0,0 L10,5 L0,10 Z" fill="var(--border-strong)"/>
            </marker>
            <marker id="arrow-active" viewBox="0 0 10 10" refX="8" refY="5"
                    markerWidth="7" markerHeight="7" orient="auto-start-reverse">
              <path d="M0,0 L10,5 L0,10 Z" fill="var(--accent)"/>
            </marker>
            <marker id="arrow-peer" viewBox="0 0 10 10" refX="8" refY="5"
                    markerWidth="6" markerHeight="6" orient="auto-start-reverse">
              <path d="M0,0 L10,5 L0,10 Z" fill="var(--mint)"/>
            </marker>
          </defs>

          {/* Background */}
          <rect width={W} height={H} fill="url(#grid-dots)"/>

          {/* Leader halo */}
          <circle cx={cx} cy={cy} r={ringR + 60} fill="url(#leader-halo)"/>

          {/* Ring guide */}
          <circle cx={cx} cy={cy} r={ringR}
                  fill="none" stroke="var(--border-subtle)"
                  strokeDasharray="2 6" strokeWidth="1"/>

          {/* Edges */}
          {edges.map((e, i) => {
            const p1 = positions[e.from];
            const p2 = positions[e.to];
            const d = buildPath(p1, p2, e.kind);
            const cls = "ag-edge " + e.kind + (e.active ? " active" : "");
            const marker = e.kind === "peer"
              ? "url(#arrow-peer)"
              : e.active ? "url(#arrow-active)" : "url(#arrow-idle)";
            return <path key={i} d={d} className={cls} markerEnd={marker}/>;
          })}

          {/* Nodes (drawn in SVG so positions stay aligned with edges) */}
          {data.AGENTS.map(a => {
            const p = positions[a.id];
            const isSel = a.id === selectedId;
            const isLeader = !!a.leader;
            return (
              <g key={a.id}
                 className={"ag-node " + (isLeader ? "is-leader " : "") + (isSel ? "is-selected" : "")}
                 transform={`translate(${p.x}, ${p.y})`}
                 onClick={() => onSelect(a.id)}>
                {isLeader && (
                  <circle r="42" fill="none" stroke="var(--accent)" strokeOpacity="0.35"
                          strokeDasharray="3 4" strokeWidth="1">
                    <animateTransform attributeName="transform" type="rotate"
                                      from="0" to="360" dur="40s" repeatCount="indefinite"/>
                  </circle>
                )}
                <circle r={NODE_R}
                        fill={a.color}
                        stroke={isSel ? "var(--accent)" : isLeader ? "var(--accent)" : "var(--border-default)"}
                        strokeWidth={isSel ? 2.5 : isLeader ? 2 : 1.5}/>
                <text x="0" y="6" textAnchor="middle"
                      style={{fontSize: 28, dominantBaseline: "middle"}}>{a.emoji}</text>
                {isLeader && (
                  <g transform={`translate(${NODE_R - 8}, ${-NODE_R + 4})`}>
                    <circle r="9" fill="var(--accent)"/>
                    <text x="0" y="3" textAnchor="middle"
                          style={{fontSize: 10, fill: "var(--text-on-accent)", fontWeight: 700}}>★</text>
                  </g>
                )}
                {/* label pill */}
                <g transform={`translate(0, ${NODE_R + 18})`}>
                  <rect x={-(a.name.length * 6 + 14) / 2} y="-11"
                        width={a.name.length * 6 + 14} height="22"
                        rx="11"
                        fill="var(--bg-surface)"
                        stroke={isSel ? "var(--accent)" : "var(--border-subtle)"}/>
                  <text x="0" y="4" textAnchor="middle"
                        style={{fontSize: 11.5, fill: isSel ? "var(--text-primary)" : "var(--text-secondary)", fontWeight: isSel ? 600 : 500}}>
                    {a.name}
                  </text>
                </g>
              </g>
            );
          })}
        </svg>

        <div className="agent-graph-legend">
          <div className="agent-graph-legend-item">
            <svg width="28" height="10"><path d="M2 5 H22" stroke="var(--accent)" strokeWidth="1.6" markerEnd="url(#arrow-active)"/></svg>
            活跃委派
          </div>
          <div className="agent-graph-legend-item">
            <svg width="28" height="10"><path d="M2 5 H22" stroke="var(--border-strong)" strokeWidth="1.6"/></svg>
            空闲委派
          </div>
          <div className="agent-graph-legend-item">
            <svg width="28" height="10"><path d="M2 7 Q14 -1 22 5" stroke="var(--mint)" strokeWidth="1.4" fill="none" strokeDasharray="3 3"/></svg>
            同侪协作
          </div>
          <div className="agent-graph-legend-item"><Icon name="crown" size={10} style={{color:"var(--accent)"}}/> 领队</div>
        </div>
      </div>
    </div>
  );
}

// ============ BINDINGS ============
function BindingsPage({ data }) {
  // Local binding map: groupId -> agentId (drag-and-drop target)
  const [bindMap, setBindMap] = useStateC(() => {
    const m = {};
    data.FEISHU_GROUPS.forEach(g => { m[g.id] = g.agent; });
    return m;
  });
  const [selectedGroup, setSelectedGroup] = useStateC(data.FEISHU_GROUPS[0].id);
  const [hoverEdge, setHoverEdge] = useStateC(null); // {groupId, agentId} or null
  const [pulseGroupId, setPulseGroupId] = useStateC(null);
  const [pulseAgentId, setPulseAgentId] = useStateC(null);

  // Ghost line state — drag-from-port preview
  const [drag, setDrag] = useStateC(null); // {fromKind:'group'|'agent', fromId, x, y}
  const canvasRef = useRefC(null);
  const cardRefs = useRefC({}); // key like "g:abc" or "a:abc" -> DOM node
  const [, setTick] = useStateC(0);
  const setRef = (k) => (el) => { cardRefs.current[k] = el; };

  // Re-measure on resize
  useEffectC(() => {
    const ro = new ResizeObserver(() => setTick(t => t + 1));
    if (canvasRef.current) ro.observe(canvasRef.current);
    return () => ro.disconnect();
  }, []);
  // measure once after layout settles
  useEffectC(() => { const t = setTimeout(() => setTick(x => x + 1), 30); return () => clearTimeout(t); }, [bindMap]);

  const getPortPos = (kind, id) => {
    const node = cardRefs.current[(kind === "group" ? "g:" : "a:") + id];
    const canvas = canvasRef.current;
    if (!node || !canvas) return null;
    const r = node.getBoundingClientRect();
    const cr = canvas.getBoundingClientRect();
    return {
      x: kind === "group" ? r.right - cr.left : r.left - cr.left,
      y: r.top + r.height / 2 - cr.top,
    };
  };

  const onPortMouseDown = (kind, id, e) => {
    e.preventDefault();
    const p = getPortPos(kind, id);
    if (!p) return;
    setDrag({ fromKind: kind, fromId: id, x: p.x, y: p.y, mouseX: p.x, mouseY: p.y, hoverTarget: null });
  };

  useEffectC(() => {
    if (!drag) return;
    const onMove = (e) => {
      const cr = canvasRef.current.getBoundingClientRect();
      const mx = e.clientX - cr.left;
      const my = e.clientY - cr.top;
      // hit-test the *opposite* column cards
      let hit = null;
      const opp = drag.fromKind === "group" ? "a:" : "g:";
      Object.entries(cardRefs.current).forEach(([key, el]) => {
        if (!el || !key.startsWith(opp)) return;
        const r = el.getBoundingClientRect();
        if (e.clientX >= r.left && e.clientX <= r.right && e.clientY >= r.top && e.clientY <= r.bottom) {
          hit = key.slice(2);
        }
      });
      setDrag(d => d ? { ...d, mouseX: mx, mouseY: my, hoverTarget: hit } : d);
    };
    const onUp = () => {
      if (drag && drag.hoverTarget) {
        let groupId, agentId;
        if (drag.fromKind === "group") { groupId = drag.fromId; agentId = drag.hoverTarget; }
        else { agentId = drag.fromId; groupId = drag.hoverTarget; }
        setBindMap(m => ({ ...m, [groupId]: agentId }));
        setSelectedGroup(groupId);
        setPulseGroupId(groupId); setTimeout(() => setPulseGroupId(null), 700);
        setPulseAgentId(agentId); setTimeout(() => setPulseAgentId(null), 700);
      }
      setDrag(null);
    };
    window.addEventListener("mousemove", onMove);
    window.addEventListener("mouseup", onUp);
    return () => {
      window.removeEventListener("mousemove", onMove);
      window.removeEventListener("mouseup", onUp);
    };
  }, [drag]);

  // Build edge paths
  const edges = data.FEISHU_GROUPS.map(g => {
    const aid = bindMap[g.id];
    if (!aid) return null;
    const a = getPortPos("group", g.id);
    const b = getPortPos("agent", aid);
    if (!a || !b) return null;
    const isHot = hoverEdge && hoverEdge.groupId === g.id;
    const dim = drag && drag.fromKind === "group" && drag.fromId !== g.id;
    return { groupId: g.id, agentId: aid, a, b, hot: isHot, dim };
  }).filter(Boolean);

  // count agents bound (per agent how many groups)
  const agentCounts = {};
  Object.values(bindMap).forEach(aid => { if (aid) agentCounts[aid] = (agentCounts[aid] || 0) + 1; });

  const previewPath = drag ? (() => {
    const start = { x: drag.x, y: drag.y };
    const end = { x: drag.mouseX, y: drag.mouseY };
    const cx = (start.x + end.x) / 2;
    return `M ${start.x} ${start.y} C ${cx} ${start.y}, ${cx} ${end.y}, ${end.x} ${end.y}`;
  })() : null;

  const group = data.FEISHU_GROUPS.find(g => g.id === selectedGroup);
  const agent = data.AGENTS.find(a => a.id === bindMap[group.id]) || data.AGENTS[0];

  return (
    <div style={{padding: "24px 32px 48px", display: "flex", flexDirection: "column", gap: 20, height: "100%", overflowY: "auto"}}>
      <div style={{display: "flex", alignItems: "flex-end", justifyContent: "space-between", gap: 16, flexWrap: "wrap"}}>
        <div>
          <h1 className="page-title">绑定 · 飞书 ↔ Agent</h1>
          <p className="page-sub">从左侧群组的端点拖到右侧 Agent · 即可建立路由</p>
        </div>
        <div style={{display: "flex", gap: 10, alignItems: "center"}}>
          <div className="channel-mini">
            <span style={{
              width: 26, height: 26, borderRadius: 7, background: "#0066FF",
              display: "grid", placeItems: "center", color: "#fff", fontWeight: 700, fontSize: 10
            }}>飞书</span>
            <div style={{display: "flex", flexDirection: "column"}}>
              <span style={{fontSize: 11.5, color: "var(--text-tertiary)"}}>App ID</span>
              <span style={{fontFamily: "var(--font-mono)", fontSize: 11.5}}>cli_a8••••3kF2</span>
            </div>
            <span className="tag success" style={{marginLeft: 8}}><span className="dot live"/> 已连接</span>
          </div>
          <button className="btn btn-sm"><Icon name="refresh" size={13}/> 测试连接</button>
          <button className="btn btn-sm"><Icon name="edit" size={13}/> 重新配置</button>
        </div>
      </div>

      <div className="bind-toolbar">
        <span className="bind-toolbar-tip">
          <Icon name="bolt" size={12}/> 拖动 <kbd>○</kbd> 从群组到 Agent 建立绑定
        </span>
        <span className="bind-toolbar-tip">
          点击连线高亮 · 双击解绑（演示）
        </span>
        <div style={{marginLeft: "auto", display: "flex", gap: 6}}>
          <button className="btn btn-sm btn-ghost"><Icon name="plus" size={13}/> 添加群组</button>
          <button className="btn btn-sm btn-primary"><Icon name="save" size={13}/> 保存绑定</button>
        </div>
      </div>

      <div className="bind-canvas" ref={canvasRef}>
        <svg className="bind-svg">
          {edges.map((e, i) => {
            const cx = (e.a.x + e.b.x) / 2;
            const d = `M ${e.a.x} ${e.a.y} C ${cx} ${e.a.y}, ${cx} ${e.b.y}, ${e.b.x} ${e.b.y}`;
            return (
              <path
                key={e.groupId + "->" + e.agentId + i}
                d={d}
                className={"edge " + (e.hot ? "hot " : "") + (e.dim ? "dim " : "")}
                onMouseEnter={() => setHoverEdge({groupId: e.groupId, agentId: e.agentId})}
                onMouseLeave={() => setHoverEdge(null)}
                style={{pointerEvents: "stroke"}}
                onDoubleClick={() => setBindMap(m => ({ ...m, [e.groupId]: null }))}
              />
            );
          })}
          {previewPath && <path d={previewPath} className="preview"/>}
        </svg>

        {/* LEFT: Groups */}
        <div className="bind-col">
          <div className="bind-col-head">
            <span><Icon name="agents" size={11} style={{marginRight: 5, verticalAlign: "-1px"}}/>飞书群组</span>
            <span className="count">{data.FEISHU_GROUPS.length}</span>
          </div>
          {data.FEISHU_GROUPS.map(g => {
            const ag = data.AGENTS.find(a => a.id === bindMap[g.id]);
            const isSelected = g.id === selectedGroup;
            const isTarget = drag && drag.fromKind === "agent" && drag.hoverTarget === g.id;
            const isSource = drag && drag.fromKind === "group" && drag.fromId === g.id;
            const isPulsing = pulseGroupId === g.id;
            return (
              <div
                key={g.id}
                ref={setRef("g:" + g.id)}
                className={"bind-card " + (isSelected ? "is-selected " : "") + (isTarget ? "is-target " : "") + (isSource ? "is-source-armed " : "") + (isPulsing ? "is-pulsing " : "")}
                onClick={() => setSelectedGroup(g.id)}>
                <div className="bind-card-icon" style={{background: "var(--bg-elevated)", color: "var(--text-secondary)"}}>
                  {g.type === "dm" ? <Icon name="user" size={15}/> : <Icon name="agents" size={15}/>}
                </div>
                <div className="bind-card-info">
                  <div className="bind-card-name">{g.name}</div>
                  <div className="bind-card-meta">
                    <span style={{fontFamily: "var(--font-mono)", fontSize: 10.5}}>{g.count} 人</span>
                    <span>·</span>
                    <span>{g.trigger === "@" ? "@触发" : "全部消息"}</span>
                    {!ag && <span className="bind-mini-tag unbound"><span className="dot warn"/> 未绑定</span>}
                  </div>
                </div>
                <div
                  className={"bind-port bind-port-right " + (isSource ? "is-armed " : "") + (ag ? "is-connected" : "")}
                  onMouseDown={(e) => { e.stopPropagation(); onPortMouseDown("group", g.id, e); }}/>
              </div>
            );
          })}
        </div>

        <div className="bind-mid"/>

        {/* RIGHT: Agents */}
        <div className="bind-col">
          <div className="bind-col-head">
            <span><Icon name="agents" size={11} style={{marginRight: 5, verticalAlign: "-1px"}}/>Agents</span>
            <span className="count">{data.AGENTS.length}</span>
          </div>
          {data.AGENTS.map(a => {
            const cnt = agentCounts[a.id] || 0;
            const isTarget = drag && drag.fromKind === "group" && drag.hoverTarget === a.id;
            const isSource = drag && drag.fromKind === "agent" && drag.fromId === a.id;
            const isPulsing = pulseAgentId === a.id;
            return (
              <div
                key={a.id}
                ref={setRef("a:" + a.id)}
                className={"bind-card " + (isTarget ? "is-target " : "") + (isSource ? "is-source-armed " : "") + (isPulsing ? "is-pulsing " : "")}>
                <div
                  className={"bind-port bind-port-left " + (isSource ? "is-armed " : "") + (cnt > 0 ? "is-connected " : "") + (cnt > 1 ? "has-many" : "")}
                  data-count={cnt > 1 ? "×" + cnt : ""}
                  onMouseDown={(e) => { e.stopPropagation(); onPortMouseDown("agent", a.id, e); }}/>
                <div className="bind-card-icon" style={{background: a.color}}>{a.emoji}</div>
                <div className="bind-card-info">
                  <div className="bind-card-name">
                    {a.name}
                    {a.leader && <Icon name="crown" size={11} style={{marginLeft: 6, verticalAlign: "-1px", color: "var(--accent)"}}/>}
                  </div>
                  <div className="bind-card-meta">
                    <span>{a.role}</span>
                    {cnt > 0 && <span className="bind-mini-tag">{cnt} 个群</span>}
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* Detail card for the selected group */}
      <div className="section-card">
        <div className="section-card-head">
          <div>
            <h3 className="section-card-title">
              {group.name}
              <span className="muted" style={{fontSize: 12, fontWeight: 400, marginLeft: 8}}>· 路由配置</span>
            </h3>
            <div className="section-card-sub">
              <span className="mono">{group.id}</span> · {group.count} 人 · {group.type === "dm" ? "私聊" : "群聊"}
            </div>
          </div>
          <div style={{display: "flex", gap: 6}}>
            <button className="btn btn-sm btn-danger"><Icon name="trash" size={13}/> 解绑</button>
          </div>
        </div>
        <div className="section-card-body">
          <FieldRow label="当前绑定">
            {bindMap[group.id] ? (
              <div style={{display: "flex", alignItems: "center", gap: 10}}>
                <div className="bind-card-icon" style={{background: agent.color, width: 34, height: 34}}>{agent.emoji}</div>
                <div>
                  <div style={{fontSize: 13, fontWeight: 500}}>{agent.name}</div>
                  <div style={{fontSize: 11.5, color: "var(--text-tertiary)"}}>{agent.role}</div>
                </div>
                <span className="tag accent" style={{marginLeft: 12}}>已绑定</span>
              </div>
            ) : (
              <span className="muted" style={{fontSize: 12.5}}>— 未绑定 — 拖动连线建立绑定</span>
            )}
          </FieldRow>
          <FieldRow label="触发模式" hint="决定 Agent 何时响应">
            <div className="seg">
              <div className={"seg-item " + (group.trigger === "@" ? "active" : "")}>@机器人触发</div>
              <div className={"seg-item " + (group.trigger === "all" ? "active" : "")}>所有消息</div>
            </div>
          </FieldRow>
          <FieldRow label="响应延迟" hint="模拟人类思考时间">
            <div className="seg">
              <div className="seg-item active">即时</div>
              <div className="seg-item">2-5 秒</div>
              <div className="seg-item">5-15 秒</div>
            </div>
          </FieldRow>
          <FieldRow label="启用状态">
            <div style={{display: "flex", alignItems: "center", gap: 10}}>
              <div className={"toggle " + (group.enabled ? "on" : "")}/>
              <span className="muted">{group.enabled ? "启用中 · Agent 会响应该群消息" : "已停用"}</span>
            </div>
          </FieldRow>
        </div>
      </div>
    </div>
  );
}

window.AgentsPage = AgentsPage;
window.BindingsPage = BindingsPage;
