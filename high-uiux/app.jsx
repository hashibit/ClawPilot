// app.jsx — main shell, navigation, tweaks panel integration

const { useState: useStateA, useEffect: useEffectA, useMemo: useMemoA } = React;

const TWEAK_DEFAULTS = /*EDITMODE-BEGIN*/{
  "scope": "global",
  "currentCompanyId": "customer_support",
  "theme": "mint"
}/*EDITMODE-END*/;

function App() {
  const data = window.MOCK;
  const [tweaks, setTweaksState] = useStateA(TWEAK_DEFAULTS);
  const setTweak = (k, v) => {
    const edits = (typeof k === "object") ? k : { [k]: v };
    setTweaksState(prev => ({ ...prev, ...edits }));
    window.parent.postMessage({type: '__edit_mode_set_keys', edits}, '*');
  };
  const [editMode, setEditMode] = useStateA(false);
  useEffectA(() => {
    const handler = (e) => {
      if (e.data?.type === '__activate_edit_mode') setEditMode(true);
      if (e.data?.type === '__deactivate_edit_mode') setEditMode(false);
    };
    window.addEventListener('message', handler);
    window.parent.postMessage({type:'__edit_mode_available'}, '*');
    return () => window.removeEventListener('message', handler);
  }, []);

  const scope = tweaks.scope; // 'global' | 'company'
  const currentCompanyId = tweaks.currentCompanyId;
  const company = data.COMPANIES.find(c => c.id === currentCompanyId) || data.COMPANIES[0];

  // Apply theme to <html data-theme>
  useEffectA(() => {
    const t = tweaks.theme || "mint";
    if (t === "amber") document.documentElement.removeAttribute("data-theme");
    else document.documentElement.setAttribute("data-theme", t);
  }, [tweaks.theme]);

  const initialPage = scope === "global" ? "overview" : "agents";
  const [page, setPage] = useStateA(initialPage);
  useEffectA(() => { setPage(scope === "global" ? "overview" : "agents"); }, [scope]);

  // Modals
  const [showCreateCompany, setCreateCompany] = useStateA(false);
  const [showGenerate, setGenerate] = useStateA(false);
  const [showBatch, setBatch] = useStateA(false);
  const [showSkill, setSkill] = useStateA(false);
  const [showInstall, setInstall] = useStateA(false);
  const [showTest, setTest] = useStateA(false);
  const [showCmd, setShowCmd] = useStateA(false);
  const [toasts, setToasts] = useStateA([]);

  const addToast = (t) => {
    const id = Date.now();
    setToasts(prev => [...prev, { ...t, id }]);
    setTimeout(() => setToasts(prev => prev.filter(x => x.id !== id)), 3000);
  };

  // cmd-K
  useEffectA(() => {
    const h = (e) => {
      if ((e.metaKey || e.ctrlKey) && e.key === "k") { e.preventDefault(); setShowCmd(true); }
      if (e.key === "Escape") setShowCmd(false);
    };
    window.addEventListener("keydown", h);
    return () => window.removeEventListener("keydown", h);
  }, []);

  useEffectA(() => {
    const t = setTimeout(() => document.getElementById("splash")?.classList.add("hidden"), 100);
    return () => clearTimeout(t);
  }, []);

  const enterCompany = (id) => {
    setTweak({ scope: "company", currentCompanyId: id });
    addToast({ title: "已进入公司空间", desc: data.COMPANIES.find(c => c.id === id).name, type: "success" });
  };
  const exitCompany = () => {
    setTweak("scope", "global");
  };

  const globalNav = [
    { id: "overview", icon: "overview", label: "数据概览" },
    { id: "companies", icon: "companies", label: "公司列表", count: data.COMPANIES.length },
    { id: "providers", icon: "providers", label: "模型管理", count: data.PROVIDERS.length },
    { id: "office", icon: "office", label: "办公室管理", count: data.OFFICES.length },
    { id: "logs", icon: "logs", label: "运行日志" },
    { id: "activities", icon: "activity", label: "实时活动" },
    { id: "settings", icon: "settings", label: "设置" },
  ];
  const companyNav = [
    { id: "agents", icon: "agents", label: "智能体管理", count: data.AGENTS.length },
    { id: "bindings", icon: "bindings", label: "渠道端管理", count: data.FEISHU_GROUPS.length },
    { id: "deploy", icon: "deploy", label: "一键部署" },
  ];
  const nav = scope === "global" ? globalNav : companyNav;
  const current = nav.find(n => n.id === page) || nav[0];

  const cmdItems = useMemoA(() => [
    ...globalNav.map(n => ({ id: "g-" + n.id, icon: n.icon, label: "前往 " + n.label, hint: "全局", onSelect: () => { setTweak("scope", "global"); setPage(n.id); } })),
    ...data.COMPANIES.map(c => ({ id: "c-" + c.id, icon: "companies", label: "进入 " + c.name, hint: "公司", onSelect: () => enterCompany(c.id) })),
    ...data.AGENTS.map(a => ({ id: "a-" + a.id, icon: "agents", label: "Agent · " + a.name, hint: "跳转", onSelect: () => { enterCompany(currentCompanyId); setPage("agents"); } })),
    { id: "act-create", icon: "plus", label: "创建公司", hint: "操作", onSelect: () => setCreateCompany(true) },
    { id: "act-deploy", icon: "deploy", label: "一键部署当前公司", hint: "操作", onSelect: () => { enterCompany(currentCompanyId); setPage("deploy"); } },
    { id: "act-test", icon: "chat", label: "测试当前 Agent", hint: "操作", onSelect: () => { enterCompany(currentCompanyId); setPage("agents"); setTimeout(() => setTest(true), 300); } },
  ], [data, currentCompanyId]);

  return (
    <div className="app">
      {/* Sidebar */}
      <aside className="sidebar" data-screen-label="Sidebar">
        <div className="brand">
          <div className="brand-mark">CP</div>
          <div>
            <div className="brand-name">ClawPilot</div>
            <div className="brand-sub">v0.4.2</div>
          </div>
        </div>

        {scope === "company" && (
          <>
            <div className="back-home" onClick={exitCompany}>
              <Icon name="home" size={14}/>
              <span>返回全局</span>
            </div>
            <div className="company-context">
              <div className="company-context-avatar" style={{background: company.color}}>{company.emoji}</div>
              <div className="company-context-text">
                <div className="company-context-label">公司空间</div>
                <div className="company-context-name">{company.name}</div>
              </div>
            </div>
          </>
        )}

        <div className="nav-section">{scope === "global" ? "全局" : "工作区"}</div>
        {nav.map(n => (
          <div key={n.id} className={"nav-item " + (page === n.id ? "active" : "")} onClick={() => setPage(n.id)}>
            <Icon name={n.icon} className="icon" size={16}/>
            <span>{n.label}</span>
            {n.count != null && <span className="count">{n.count}</span>}
          </div>
        ))}

        <div className="sidebar-footer">
          <div className="user-avatar">陈</div>
          <div style={{flex:1, minWidth:0}}>
            <div className="user-name">陈一鸣</div>
            <div className="user-role">管理员</div>
          </div>
        </div>
        <div className="cmd-trigger" onClick={() => setShowCmd(true)}>
          <Icon name="search" size={11}/> <span style={{flex:1}}>命令面板</span>
          <span style={{padding:"1px 5px", borderRadius:4, background:"var(--bg-elevated)", fontSize:10}}>⌘K</span>
        </div>
      </aside>

      {/* Main */}
      <div className="main">
        <div className="topbar">
          <div className="breadcrumb">
            {scope === "company" ? (
              <>
                <span style={{cursor:"pointer"}} onClick={exitCompany}>全局</span>
                <Icon name="chevron" size={11}/>
                <span>{company.name}</span>
                <Icon name="chevron" size={11}/>
                <span className="breadcrumb-current">{current.label}</span>
              </>
            ) : (
              <>
                <span>ClawPilot</span>
                <Icon name="chevron" size={11}/>
                <span className="breadcrumb-current">{current.label}</span>
              </>
            )}
          </div>
          <div className="topbar-spacer"/>
          <div className="topbar-cmd" onClick={() => setShowCmd(true)}>
            <Icon name="search" size={12}/>
            <span className="placeholder">搜索 · 跳转 · 操作…</span>
            <span style={{padding:"1px 6px", borderRadius:4, background:"var(--bg-input)", fontSize:11, color:"var(--text-secondary)"}}>⌘K</span>
          </div>
          <div className="topbar-icon-btn" title="实时活动" onClick={() => { setTweak("scope", "global"); setPage("activities"); }}>
            <Icon name="bell" size={15}/>
            <span className="badge"/>
          </div>
        </div>

        <div className="page" data-screen-label={current.label}>
          {page === "overview" && <OverviewPage data={data} onEnter={enterCompany}/>}
          {page === "companies" && <CompaniesPage data={data} onEnter={enterCompany} onCreate={() => setCreateCompany(true)}/>}
          {page === "providers" && <ProvidersPage data={data}/>}
          {page === "office" && <OfficePage data={data} onInstall={() => setInstall(true)}/>}
          {page === "logs" && <LogsPage data={data}/>}
          {page === "activities" && <ActivitiesPage data={data}/>}
          {page === "settings" && <SettingsPage/>}
          {page === "agents" && <AgentsPage data={data} onTest={() => setTest(true)} onGenerate={() => setGenerate(true)} onAddSkill={() => setSkill(true)} onBatchAdd={() => setBatch(true)}/>}
          {page === "bindings" && <BindingsPage data={data}/>}
          {page === "deploy" && <DeployPage data={data} currentCompany={currentCompanyId}/>}
        </div>
      </div>

      {/* Modals */}
      <CreateCompanyModal open={showCreateCompany} onClose={() => setCreateCompany(false)} onConfirm={c => addToast({title:"公司已创建", desc: c.name, type:"success"})}/>
      <GenerateAgentModal open={showGenerate} onClose={() => setGenerate(false)}/>
      <BatchAddModal open={showBatch} onClose={() => setBatch(false)}/>
      <SkillModal open={showSkill} onClose={() => setSkill(false)}/>
      <InstallPropertyModal open={showInstall} onClose={() => setInstall(false)}/>
      <TestChatDrawer open={showTest} onClose={() => setTest(false)} agent={data.AGENTS[0]}/>
      <CommandPalette open={showCmd} onClose={() => setShowCmd(false)} items={cmdItems}/>

      {/* Toasts */}
      <div className="toast-stack">
        {toasts.map(t => (
          <div key={t.id} className={"toast " + (t.type || "")}>
            <div className="toast-title">{t.title}</div>
            {t.desc && <div className="toast-desc">{t.desc}</div>}
          </div>
        ))}
      </div>

      {/* Tweaks panel */}
      {editMode && <TweaksPanel scope={scope} setTweak={setTweak} currentCompanyId={currentCompanyId} data={data} theme={tweaks.theme}/>}
    </div>
  );
}

function TweaksPanel({ scope, setTweak, currentCompanyId, data, theme }) {
  const close = () => window.parent.postMessage({type: '__edit_mode_dismissed'}, '*');
  const themes = [
    { id: "amber", name: "暖琥珀金", sub: "原始 v1 · 偏奢侈品", swatch: ["#d4a574", "#7ba896", "#0d1310"] },
    { id: "mint",  name: "赛博薄荷", sub: "推荐 · 有电流感", swatch: ["#5eead4", "#fcd34d", "#0a1413"] },
    { id: "volt",  name: "终端荧光", sub: "工程师工具感",   swatch: ["#a3e635", "#22d3ee", "#0a0f08"] },
    { id: "cyan",  name: "基础设施青", sub: "Cloudflare 系", swatch: ["#22d3ee", "#c4b5fd", "#08111a"] },
  ];
  return (
    <div style={{
      position: "fixed", top: 80, right: 24,
      width: 320,
      background: "var(--bg-surface)",
      border: "1px solid var(--border-default)",
      borderRadius: "var(--r-lg)",
      boxShadow: "var(--shadow-lg)",
      zIndex: 80,
      overflow: "hidden"
    }}>
      <div style={{padding:"14px 16px", borderBottom:"1px solid var(--border-subtle)", display:"flex", alignItems:"center"}}>
        <div style={{fontSize:13, fontWeight:600, flex:1}}>Tweaks</div>
        <div className="modal-close" onClick={close}><Icon name="close" size={14}/></div>
      </div>
      <div style={{padding:"14px 16px", display:"flex", flexDirection:"column", gap:16, maxHeight:"calc(100vh - 180px)", overflowY:"auto"}}>
        <div>
          <div style={{fontSize:12, fontWeight:500, marginBottom:8, color:"var(--text-secondary)"}}>主题色</div>
          <div style={{display:"flex", flexDirection:"column", gap:6}}>
            {themes.map(t => {
              const active = (theme || "mint") === t.id;
              return (
                <div key={t.id}
                     onClick={() => setTweak("theme", t.id)}
                     style={{
                       display:"flex", alignItems:"center", gap:10,
                       padding:"8px 10px",
                       borderRadius: 9,
                       border: "1px solid " + (active ? "var(--accent)" : "var(--border-subtle)"),
                       background: active ? "var(--accent-soft)" : "var(--bg-input)",
                       cursor:"pointer"
                     }}>
                  <div style={{display:"flex", gap:3, flexShrink:0}}>
                    {t.swatch.map((c,i) => (
                      <div key={i} style={{width:14, height:18, borderRadius:3, background:c, border:"1px solid rgba(255,255,255,0.06)"}}/>
                    ))}
                  </div>
                  <div style={{flex:1, minWidth:0}}>
                    <div style={{fontSize:12.5, fontWeight: active ? 600 : 500, color: active ? "var(--accent)" : "var(--text-primary)"}}>{t.name}</div>
                    <div style={{fontSize:11, color:"var(--text-tertiary)", marginTop:1}}>{t.sub}</div>
                  </div>
                  {active && <Icon name="check" size={12} style={{color:"var(--accent)"}}/>}
                </div>
              );
            })}
          </div>
        </div>
        <div>
          <div style={{fontSize:12, fontWeight:500, marginBottom:8, color:"var(--text-secondary)"}}>导航空间</div>
          <div className="seg" style={{width:"100%"}}>
            <div className={"seg-item " + (scope === "global" ? "active" : "")} style={{flex:1, textAlign:"center"}} onClick={() => setTweak("scope", "global")}>全局导航</div>
            <div className={"seg-item " + (scope === "company" ? "active" : "")} style={{flex:1, textAlign:"center"}} onClick={() => setTweak("scope", "company")}>公司空间</div>
          </div>
        </div>
        {scope === "company" && (
          <div>
            <div style={{fontSize:12, fontWeight:500, marginBottom:8, color:"var(--text-secondary)"}}>当前公司</div>
            <select className="input" value={currentCompanyId} onChange={e => setTweak("currentCompanyId", e.target.value)}>
              {data.COMPANIES.map(c => <option key={c.id} value={c.id}>{c.emoji} {c.name}</option>)}
            </select>
          </div>
        )}
      </div>
    </div>
  );
}

ReactDOM.createRoot(document.getElementById("root")).render(<App/>);
