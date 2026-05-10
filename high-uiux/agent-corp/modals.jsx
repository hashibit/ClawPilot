// modals.jsx — modal dialogs

const { useState: useStateM, useEffect: useEffectM } = React;

function Modal({ open, onClose, title, sub, size, children, footer }) {
  if (!open) return null;
  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className={"modal " + (size === "lg" ? "modal-lg" : size === "xl" ? "modal-xl" : "")} onClick={e => e.stopPropagation()}>
        <div className="modal-header">
          <div>
            <h3 className="modal-title">{title}</h3>
            {sub && <p className="modal-sub">{sub}</p>}
          </div>
          <div className="modal-close" onClick={onClose}><Icon name="close" size={16}/></div>
        </div>
        <div className="modal-body">{children}</div>
        {footer && <div className="modal-footer">{footer}</div>}
      </div>
    </div>
  );
}

function CreateCompanyModal({ open, onClose, onConfirm }) {
  const [name, setName] = useStateM("");
  const [id, setId] = useStateM("");
  return (
    <Modal open={open} onClose={onClose}
           title="创建公司"
           sub="新建一个 OPC 团队配置"
           footer={<>
             <button className="btn" onClick={onClose}>取消</button>
             <button className="btn btn-primary" onClick={() => { onConfirm({name, id}); onClose(); }}>创建</button>
           </>}>
      <div style={{display:"flex", flexDirection:"column", gap:18}}>
        <div>
          <label className="label">显示名称（中文）</label>
          <input className="input" placeholder="如：客服小队" value={name} onChange={e => setName(e.target.value)} autoFocus/>
        </div>
        <div>
          <label className="label">内部标识（英文）</label>
          <input className="input mono" placeholder="customer_support" value={id} onChange={e => setId(e.target.value)}/>
          <div className="field-hint">用作目录名 · 仅允许小写字母、数字、下划线</div>
        </div>
        <div style={{padding:"14px 16px", background:"var(--accent-soft)", borderRadius: 9, border:"1px solid var(--accent-border)", display:"flex", gap:10}}>
          <Icon name="sparkles" size={16} style={{color:"var(--accent)", flexShrink:0, marginTop:2}}/>
          <div style={{fontSize:12.5, color:"var(--text-secondary)"}}>
            创建后，公司空间会预置一位领队 Agent。你可以稍后通过「批量添加」让 AI 一次性为你生成整个团队。
          </div>
        </div>
      </div>
    </Modal>
  );
}

function GenerateAgentModal({ open, onClose }) {
  const [desc, setDesc] = useStateM("");
  const [generating, setGenerating] = useStateM(false);
  return (
    <Modal open={open} onClose={onClose}
           title="AI 一键生成 Agent" sub="描述这位 Agent 的角色，让 AI 帮你填好所有配置" size="lg"
           footer={<>
             <button className="btn" onClick={onClose}>取消</button>
             <button className="btn btn-primary" onClick={() => { setGenerating(true); setTimeout(() => { setGenerating(false); onClose(); }, 1800); }} disabled={!desc || generating}>
               {generating ? <><span className="spinner-mini"/> 生成中…</> : <><Icon name="sparkles" size={13}/> 开始生成</>}
             </button>
           </>}>
      <div>
        <label className="label">角色描述</label>
        <textarea className="textarea" rows={5} placeholder="例如：一位严谨的法务审阅专家，负责合同条款检查，性格冷静，引用法规要严谨…" value={desc} onChange={e => setDesc(e.target.value)} autoFocus/>
        <div className="field-hint" style={{marginTop:6}}>越详细越好 · AI 会自动生成 SOUL、IDENTITY、技能、工具权限等</div>
      </div>
      <div style={{marginTop:18}}>
        <label className="label">参考模板</label>
        <div style={{display:"flex", gap:8, flexWrap:"wrap"}}>
          {["客服 · 友善型", "技术支持 · 严谨型", "活动运营 · 活泼型", "法务 · 冷静型", "调研员 · 中立型"].map(t => (
            <span key={t} style={{
              padding:"6px 12px", borderRadius:999,
              border:"1px solid var(--border-subtle)", fontSize:12,
              cursor:"pointer", color:"var(--text-secondary)"
            }} onClick={() => setDesc(t + "，请生成完整配置")}>{t}</span>
          ))}
        </div>
      </div>
      {generating && (
        <div style={{marginTop:18, padding:14, background:"var(--bg-canvas)", borderRadius:9, fontFamily:"var(--font-mono)", fontSize:12, color:"var(--text-secondary)", lineHeight:1.7}}>
          <div><span style={{color:"var(--success)"}}>✓</span> 解析角色描述</div>
          <div><span style={{color:"var(--success)"}}>✓</span> 生成 SOUL.md</div>
          <div><span style={{color:"var(--accent)"}}>○</span> 推荐工具权限<span className="cursor-blink"/></div>
          <div style={{color:"var(--text-muted)"}}>· 生成护栏规则</div>
          <div style={{color:"var(--text-muted)"}}>· 选择合适的模型</div>
        </div>
      )}
    </Modal>
  );
}

function BatchAddModal({ open, onClose }) {
  const [text, setText] = useStateM("队长 · 客服领队，统筹分发\n技术 · 技术支持，负责 API 问题\n账务 · 账务专员，负责退款发票\n活动 · 活动运营，推荐优惠");
  return (
    <Modal open={open} onClose={onClose}
           title="批量添加" sub="每行一个角色，AI 会为每个角色生成完整配置" size="lg"
           footer={<>
             <button className="btn" onClick={onClose}>取消</button>
             <button className="btn btn-primary"><Icon name="bolt" size={13}/> 批量生成 ({text.split("\n").filter(Boolean).length} 个)</button>
           </>}>
      <textarea className="textarea mono" rows={10} value={text} onChange={e => setText(e.target.value)}
                style={{fontFamily:"var(--font-mono)", fontSize:13}}/>
    </Modal>
  );
}

function SkillModal({ open, onClose }) {
  const [tab, setTab] = useStateM("local");
  const [q, setQ] = useStateM("");
  const skills = [
    { name: "FAQ 检索", source: "local", installed: true, desc: "从知识库中查找匹配答案", uses: 1284 },
    { name: "工单升级", source: "local", installed: true, desc: "判断是否需要升级到人工", uses: 96 },
    { name: "情绪识别", source: "local", installed: false, desc: "识别用户当前情绪状态", uses: 642 },
    { name: "代码诊断", source: "hub", installed: false, desc: "分析 stack trace、定位错误", uses: 8230 },
    { name: "日志聚合分析", source: "hub", installed: false, desc: "从大量日志中找出异常模式", uses: 3120 },
    { name: "海报生成", source: "hub", installed: false, desc: "根据文案生成营销海报图", uses: 1820 },
    { name: "周报撰写", source: "hub", installed: false, desc: "整理本周工作并生成报告", uses: 5440 },
    { name: "用户画像", source: "hub", installed: false, desc: "根据对话记录构建用户画像", uses: 2100 },
  ];
  const filtered = skills.filter(s => s.source === tab && (q === "" || s.name.includes(q)));
  return (
    <Modal open={open} onClose={onClose} size="lg"
           title="技能库" sub="从本地或 ClawHub 添加技能">
      <div style={{display:"flex", gap:10, marginBottom:14}}>
        <input className="search-input" placeholder="搜索技能…" value={q} onChange={e => setQ(e.target.value)} style={{flex:1, maxWidth:"none"}}/>
        <div className="seg">
          <div className={"seg-item " + (tab === "local" ? "active" : "")} onClick={() => setTab("local")}>本地 (3)</div>
          <div className={"seg-item " + (tab === "hub" ? "active" : "")} onClick={() => setTab("hub")}>ClawHub (5)</div>
        </div>
      </div>
      <div style={{display:"flex", flexDirection:"column", gap:8, maxHeight: 340, overflowY:"auto"}}>
        {filtered.map((s, i) => (
          <div key={i} style={{display:"flex", alignItems:"center", gap:14, padding:"12px 14px", border:"1px solid var(--border-subtle)", borderRadius: 9, background:"var(--bg-input)"}}>
            <div style={{
              width:36, height:36, borderRadius:9, background:"var(--bg-elevated)",
              display:"grid", placeItems:"center", color:"var(--accent)", flexShrink:0
            }}><Icon name="star" size={16}/></div>
            <div style={{flex:1, minWidth:0}}>
              <div style={{fontSize:13.5, fontWeight: 500, display:"flex", alignItems:"center", gap:8}}>
                {s.name}
                {s.installed && <span className="tag success" style={{fontSize:10, padding:"1px 5px"}}>已安装</span>}
              </div>
              <div style={{fontSize:12, color:"var(--text-tertiary)", marginTop:2}}>{s.desc} · {s.uses.toLocaleString()} 次调用</div>
            </div>
            {s.installed
              ? <button className="btn btn-sm">移除</button>
              : <button className="btn btn-sm btn-primary">{s.source === "hub" ? "安装" : "启用"}</button>}
          </div>
        ))}
      </div>
    </Modal>
  );
}

function TestChatDrawer({ open, onClose, agent }) {
  const [msgs, setMsgs] = useStateM([
    { who: "bot", text: `你好，我是${agent?.name || "Agent"}。你想测试什么？` },
  ]);
  const [input, setInput] = useStateM("");
  if (!open || !agent) return null;
  const send = () => {
    if (!input.trim()) return;
    setMsgs([...msgs, { who: "user", text: input }]);
    setInput("");
    setTimeout(() => {
      setMsgs(m => [...m, { who: "bot", text: "已收到。让我根据当前 SOUL 配置思考下…\n\n" + (Math.random() > 0.5 ? "我们一起来看看这个问题。" : "好的，这个我可以帮您。") }]);
    }, 800);
  };
  return (
    <>
      <div className="drawer-backdrop" onClick={onClose}/>
      <div className="drawer">
        <div className="drawer-head">
          <div style={{width:36, height:36, borderRadius:9, background: agent.color, display:"grid", placeItems:"center", fontSize:18}}>{agent.emoji}</div>
          <div className="drawer-title">
            <div>测试对话 · {agent.name}</div>
            <div style={{fontSize:11, color:"var(--text-tertiary)", fontWeight:400, marginTop:2}}>使用当前 SOUL 配置 · 不会发送到飞书</div>
          </div>
          <button className="btn btn-sm btn-ghost btn-icon" onClick={onClose}><Icon name="close" size={14}/></button>
        </div>
        <div className="drawer-body">
          {msgs.map((m, i) => (
            <div key={i} className={"chat-msg " + m.who}>
              <div className="chat-avatar" style={{background: m.who === "user" ? "var(--bg-elevated)" : agent.color}}>
                {m.who === "user" ? "你" : agent.emoji}
              </div>
              <div className="chat-bubble">{m.text}</div>
            </div>
          ))}
        </div>
        <div className="drawer-input">
          <input className="input" placeholder="输入测试消息…" value={input} onChange={e => setInput(e.target.value)} onKeyDown={e => e.key === "Enter" && send()} style={{flex:1}}/>
          <button className="btn btn-primary" onClick={send}><Icon name="arrowRight" size={14}/></button>
        </div>
      </div>
    </>
  );
}

function InstallPropertyModal({ open, onClose }) {
  const [step, setStep] = useStateM(0);
  const [logs, setLogs] = useStateM([]);
  const [done, setDone] = useStateM(false);
  useEffectM(() => {
    if (!open) { setStep(0); setLogs([]); setDone(false); return; }
    const lines = [
      { type: "info", text: "[14:38:21] → 开始安装物业 @ 10.20.3.41" },
      { type: "info", text: "[14:38:22] [SSH] 连接中…" },
      { type: "ok",   text: "[14:38:23] [SSH] 已连接 · ubuntu@10.20.3.41" },
      { type: "info", text: "[14:38:24] [STEP 1/3] 检查依赖" },
      { type: "ok",   text: "[14:38:25]   ✓ python 3.11 已安装" },
      { type: "ok",   text: "[14:38:26]   ✓ git 2.42 已安装" },
      { type: "info", text: "[14:38:28] [STEP 2/3] 安装 OpenClaw" },
      { type: "info", text: "[14:38:30]   $ git clone openclaw v1.8.1" },
      { type: "info", text: "[14:38:35]   $ pip install -r requirements.txt" },
      { type: "warn", text: "[14:38:42]   ! pydantic 版本警告（已忽略）" },
      { type: "ok",   text: "[14:38:48]   ✓ OpenClaw 安装完成" },
      { type: "info", text: "[14:38:49] [STEP 3/3] 启动 Daemon" },
      { type: "ok",   text: "[14:38:51]   ✓ Daemon 启动成功 · PID 8429" },
      { type: "ok",   text: "[14:38:52] ✓ 安装完成（用时 31s）" },
    ];
    let i = 0;
    const t = setInterval(() => {
      if (i >= lines.length) { clearInterval(t); setDone(true); return; }
      setLogs(prev => [...prev, lines[i]]);
      if (i === 3) setStep(1);
      if (i === 7) setStep(2);
      if (i === 12) setStep(3);
      i++;
    }, 380);
    return () => clearInterval(t);
  }, [open]);
  return (
    <Modal open={open} onClose={onClose}
           title="安装物业" sub="在远程主机部署 OpenClaw 环境" size="lg"
           footer={<>
             <button className="btn" onClick={onClose}>{done ? "关闭" : "停止"}</button>
             {done && <button className="btn btn-primary" onClick={onClose}><Icon name="check" size={13}/> 完成</button>}
           </>}>
      <div className="steps">
        {["SSH 连接", "OpenClaw", "Daemon", "完成"].map((s, i) => (
          <div key={i} className={"step " + (i < step ? "done" : i === step ? "active" : "")}>
            <div className="step-circle">{i < step ? <Icon name="check" size={12}/> : i+1}</div>
            <div className="step-label">{s}</div>
          </div>
        ))}
      </div>
      <div className="terminal">
        {logs.map((l, i) => (
          <div key={i} className={"term-" + l.type}>{l.text}</div>
        ))}
        {!done && <span className="cursor-blink"/>}
      </div>
    </Modal>
  );
}

function CommandPalette({ open, onClose, items }) {
  const [q, setQ] = useStateM("");
  const [active, setActive] = useStateM(0);
  useEffectM(() => { if (open) { setQ(""); setActive(0); } }, [open]);
  if (!open) return null;
  const filtered = items.filter(i => i.label.toLowerCase().includes(q.toLowerCase()));
  return (
    <div className="modal-backdrop" onClick={onClose} style={{alignItems:"flex-start", paddingTop: 100}}>
      <div className="cmd-palette" onClick={e => e.stopPropagation()}>
        <input className="cmd-search" placeholder="搜索页面、Agent、办公室或操作…"
               value={q} onChange={e => { setQ(e.target.value); setActive(0); }} autoFocus
               onKeyDown={e => {
                 if (e.key === "ArrowDown") { e.preventDefault(); setActive(a => Math.min(a+1, filtered.length-1)); }
                 if (e.key === "ArrowUp") { e.preventDefault(); setActive(a => Math.max(a-1, 0)); }
                 if (e.key === "Enter") { filtered[active]?.onSelect?.(); onClose(); }
                 if (e.key === "Escape") onClose();
               }}/>
        <div className="cmd-list">
          <div className="cmd-group-label">建议</div>
          {filtered.length === 0 && <div style={{padding:"24px", textAlign:"center", color:"var(--text-tertiary)", fontSize:13}}>无匹配结果</div>}
          {filtered.map((it, i) => (
            <div key={it.id} className={"cmd-item " + (i === active ? "active" : "")}
                 onMouseEnter={() => setActive(i)}
                 onClick={() => { it.onSelect?.(); onClose(); }}>
              <Icon name={it.icon} size={14}/>
              <span>{it.label}</span>
              {it.hint && <span className="cmd-hint">{it.hint}</span>}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

window.Modal = Modal;
window.CreateCompanyModal = CreateCompanyModal;
window.GenerateAgentModal = GenerateAgentModal;
window.BatchAddModal = BatchAddModal;
window.SkillModal = SkillModal;
window.TestChatDrawer = TestChatDrawer;
window.InstallPropertyModal = InstallPropertyModal;
window.CommandPalette = CommandPalette;
