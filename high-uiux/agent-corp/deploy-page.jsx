// deploy-page.jsx — Block View deploy interface.
// Metaphor: 整页是一张街区俯视图。公司 = 一张可拖动的角色卡片 (在顶部 banner)。
// 办公楼 = 街上的一排楼。把公司拖到任意一栋空楼 → 部署 = 搬入。
// 部署进度 = 楼层从下往上依次点亮 (4 步 = 4 层灯光)。

const { useState: useStateD, useRef: useRefD, useEffect: useEffectD } = React;

function DeployPage({ data, currentCompany, onDeploy }) {
  const company = data.COMPANIES.find(c => c.id === currentCompany) || data.COMPANIES[0];

  // Local override of office.deployed so demo deploy actually moves tenants
  // {officeId: companyId|null}. null = explicit move-out.
  const [tenants, setTenants] = useStateD({});

  // Active deployment animation { officeId, step:0..4, percent:0..100 } | null
  const [moveOp, setMoveOp] = useStateD(null);

  // Office id currently hovered while dragging
  const [hoverId, setHoverId] = useStateD(null);
  // Whether the company chip is currently being dragged
  const [dragging, setDragging] = useStateD(false);
  // Office selected (click) but not yet committed — shows "搬进去" action button
  const [pickedId, setPickedId] = useStateD(null);

  // History flash
  const [justDeployedId, setJustDeployedId] = useStateD(null);
  const [showLog, setShowLog] = useStateD(false);

  // Resolve effective offices with overrides
  const offices = data.OFFICES.map(o => {
    if (o.id in tenants) return { ...o, deployed: tenants[o.id] };
    return o;
  });

  const homeOffice = offices.find(o => o.deployed === company.id) || null;

  // ---- ACTIONS ----
  const canMoveIn = (o) => {
    if (o.daemon.status !== "online") return { ok: false, reason: "离线" };
    if (o.deployed && o.deployed !== company.id) {
      const t = data.COMPANIES.find(c => c.id === o.deployed);
      return { ok: false, reason: `已被 ${t ? t.name : "其他公司"} 占用` };
    }
    if (o.deployed === company.id) return { ok: false, reason: "已是本公司住所" };
    return { ok: true };
  };

  const runDeploy = (officeId) => {
    // Vacate previous home (if any)
    setTenants(prev => {
      const next = { ...prev };
      offices.forEach(o => {
        if (o.deployed === company.id && o.id !== officeId) next[o.id] = null;
      });
      return next;
    });

    setMoveOp({ officeId, step: 0, percent: 0 });
    let p = 0;
    const interval = setInterval(() => {
      p += 4;
      if (p >= 100) {
        clearInterval(interval);
        setTenants(prev => ({ ...prev, [officeId]: company.id }));
        setMoveOp({ officeId, step: 4, percent: 100 });
        setJustDeployedId(officeId);
        setTimeout(() => setMoveOp(null), 1500);
        setTimeout(() => setJustDeployedId(null), 4000);
        return;
      }
      setMoveOp({
        officeId,
        step: Math.min(3, Math.floor(p / 25)),
        percent: p,
      });
    }, 60);
  };

  const tryDropAt = (officeId) => {
    const o = offices.find(x => x.id === officeId);
    if (!o) return;
    const r = canMoveIn(o);
    if (!r.ok) return;
    setPickedId(null);
    runDeploy(officeId);
  };

  const pickOffice = (officeId) => {
    const o = offices.find(x => x.id === officeId);
    if (!o) return;
    const r = canMoveIn(o);
    if (!r.ok) return;
    setPickedId(curr => curr === officeId ? null : officeId);
  };

  const moveOut = () => {
    if (!homeOffice) return;
    setTenants(prev => ({ ...prev, [homeOffice.id]: null }));
  };

  // Drag handlers — also support keyboard click as fallback
  const onChipDragStart = (e) => {
    e.dataTransfer.setData("text/plain", company.id);
    e.dataTransfer.effectAllowed = "move";
    // Hide the default ghost (we have our own visual)
    if (e.dataTransfer.setDragImage) {
      const ghost = document.createElement("div");
      ghost.style.cssText = "width:1px;height:1px;opacity:0;position:absolute;top:-1000px";
      document.body.appendChild(ghost);
      e.dataTransfer.setDragImage(ghost, 0, 0);
      setTimeout(() => document.body.removeChild(ghost), 0);
    }
    setDragging(true);
  };

  const onChipDragEnd = () => {
    setDragging(false);
    setHoverId(null);
  };

  return (
    <div className="dpv fade-in">
      {/* ============ HERO ============ */}
      <div className="dpv-hero">
        <div className="dpv-hero-left">
          <div className="dpv-company-chip"
               draggable={!moveOp}
               onDragStart={onChipDragStart}
               onDragEnd={onChipDragEnd}>
            <div className="dpv-company-avatar" style={{background: company.color}}>{company.emoji}</div>
            <div className="dpv-company-info">
              <div className="dpv-company-name">{company.name}</div>
              <div className="dpv-company-meta">
                <span><Icon name="agents" size={11} style={{verticalAlign:"-1px"}}/> {data.AGENTS.length} 个 Agent</span>
                <span>·</span>
                <span className="mono" style={{fontSize: 11}}>v1.4.2</span>
              </div>
            </div>
            <div className="dpv-drag-hint">
              <Icon name="grip" size={14}/>
              <span>拖动我</span>
            </div>
          </div>
        </div>

        <div className="dpv-hero-right">
          {homeOffice ? (
            <div className="dpv-status home">
              <div className="dpv-status-line">
                <span className="dpv-status-dot live"/>
                <span>当前住在</span>
                <b>{homeOffice.receptionist} {homeOffice.name}</b>
              </div>
              <div className="dpv-status-actions">
                <button className="btn btn-sm" onClick={() => setShowLog(s => !s)}>
                  <Icon name="terminal" size={11}/> 日志
                </button>
                <button className="btn btn-sm btn-ghost" onClick={moveOut}>
                  <Icon name="logout" size={11}/> 搬出
                </button>
              </div>
            </div>
          ) : (
            <div className="dpv-status nowhere">
              <div className="dpv-status-line">
                <span className="dpv-status-dot idle"/>
                <span>还没住进任何办公楼</span>
              </div>
              <div className="dpv-status-hint">点击一栋空楼 选定，或 拖动公司卡片 直接松手入住 →</div>
            </div>
          )}
        </div>
      </div>

      {/* ============ STREET ============ */}
      <div className={"dpv-street " + (dragging ? "is-dragging" : "")}>
        <div className="dpv-street-sky"/>
        <div className="dpv-street-ground"/>

        <div className="dpv-buildings-row">
          {offices.map(o => {
            const tenant = o.deployed ? data.COMPANIES.find(c => c.id === o.deployed) : null;
            const verdict = canMoveIn(o);
            const isHome = tenant && tenant.id === company.id;
            const isOccupiedByOther = tenant && tenant.id !== company.id;
            const isOffline = o.daemon.status !== "online";
            const isHover = hoverId === o.id;
            const isMovingIn = moveOp && moveOp.officeId === o.id;
            const isJustDone = justDeployedId === o.id && !isMovingIn;
            const isPicked = pickedId === o.id && !isMovingIn;

            const floors = 3;
            // During move op: light floors bottom-to-top based on step (0..4)
            const litFloors = isMovingIn
              ? Math.ceil((moveOp.step / 4) * floors)
              : isHome ? floors
              : isOccupiedByOther ? floors
              : 0;

            return (
              <div
                key={o.id}
                className={
                  "dpv-bldg " +
                  (isHome ? "is-home " : "") +
                  (isOccupiedByOther ? "is-occupied " : "") +
                  (isOffline ? "is-offline " : "") +
                  (verdict.ok && dragging ? "is-droppable " : "") +
                  (isHover && verdict.ok ? "is-hover " : "") +
                  (isHover && !verdict.ok ? "is-hover-blocked " : "") +
                  (isMovingIn ? "is-moving-in " : "") +
                  (isJustDone ? "is-just-done " : "") +
                  (isPicked ? "is-picked " : "")
                }
                onDragOver={e => {
                  if (verdict.ok || isOccupiedByOther || isOffline) {
                    e.preventDefault();
                    setHoverId(o.id);
                    e.dataTransfer.dropEffect = verdict.ok ? "move" : "none";
                  }
                }}
                onDragLeave={() => setHoverId(curr => curr === o.id ? null : curr)}
                onDrop={e => {
                  e.preventDefault();
                  setHoverId(null);
                  setDragging(false);
                  tryDropAt(o.id);
                }}
                onClick={() => { if (verdict.ok && !moveOp) pickOffice(o.id); }}
              >
                {/* Roof + flag */}
                <div className="dpv-bldg-roof">
                  {(isHome || isMovingIn) && (
                    <div className="dpv-bldg-flag" style={{background: company.color}}>
                      <span style={{fontSize: 9}}>{company.emoji}</span>
                    </div>
                  )}
                  {isOccupiedByOther && (
                    <div className="dpv-bldg-flag muted" style={{background: tenant.color}}>
                      <span style={{fontSize: 9}}>{tenant.emoji}</span>
                    </div>
                  )}
                </div>

                {/* Body with floors */}
                <div className="dpv-bldg-body">
                  {Array.from({length: floors}).map((_, idx) => {
                    // Floor index from bottom (idx=0 is top in flex-column ordering, so reverse)
                    const fromBottom = floors - 1 - idx;
                    const isLit = fromBottom < litFloors;
                    const isCurrentStep = isMovingIn && fromBottom === moveOp.step - 1 && moveOp.step > 0;
                    return (
                      <div key={idx} className={
                        "dpv-bldg-floor " +
                        (isLit ? "lit " : "") +
                        (isCurrentStep ? "current-step " : "") +
                        (isOccupiedByOther ? "other-tenant " : "")
                      }>
                        <span className="dpv-bldg-window"/>
                        <span className="dpv-bldg-window"/>
                        <span className="dpv-bldg-window"/>
                        <span className="dpv-bldg-window"/>
                      </div>
                    );
                  })}
                </div>

                {/* Door + receptionist */}
                <div className="dpv-bldg-door">
                  <div className="dpv-bldg-receptionist">{o.receptionist}</div>
                </div>

                {/* Sign with office name */}
                <div className="dpv-bldg-sign">
                  <div className="dpv-bldg-name">{o.name}</div>
                  <div className="dpv-bldg-host mono">{o.host}</div>
                </div>

                {/* Status badge */}
                <div className="dpv-bldg-badge">
                  {isOffline ? <span className="b-tag offline">⚠ 离线</span>
                    : isHome ? <span className="b-tag home">✓ 当前住所</span>
                    : isOccupiedByOther ? <span className="b-tag busy">{tenant.emoji} {tenant.name}</span>
                    : <span className="b-tag vacant">空置 · 可入住</span>}
                </div>

                {/* Hover preview overlay */}
                {isHover && verdict.ok && (
                  <div className="dpv-bldg-preview">
                    <div className="dpv-bldg-preview-emoji">{company.emoji}</div>
                    <div className="dpv-bldg-preview-msg">松手即入住</div>
                  </div>
                )}
                {isHover && !verdict.ok && (
                  <div className="dpv-bldg-preview blocked">
                    <div className="dpv-bldg-preview-emoji">🚫</div>
                    <div className="dpv-bldg-preview-msg">{verdict.reason}</div>
                  </div>
                )}

                {/* Move-in step caption */}
                {isMovingIn && moveOp.step > 0 && (
                  <div className="dpv-bldg-step-caption">
                    <span className="dot live"/>
                    {["准备配置", "写入目录", "重启进程", "健康检查"][moveOp.step - 1]}
                  </div>
                )}
                {isJustDone && (
                  <div className="dpv-bldg-done-banner">
                    <Icon name="check" size={12}/>
                    {o.receptionist} 已迎接 {company.name} 入驻
                  </div>
                )}

                {/* Picked: show explicit move-in action button */}
                {isPicked && (
                  <div className="dpv-bldg-action" onClick={e => e.stopPropagation()}>
                    <div className="dpv-bldg-action-arrow">
                      <span className="dpv-bldg-action-emoji" style={{background: company.color}}>{company.emoji}</span>
                      <span className="dpv-bldg-action-arrowline">
                        <svg width="36" height="14" viewBox="0 0 36 14" fill="none">
                          <path d="M2 7 H28 M22 2 L30 7 L22 12" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round"/>
                        </svg>
                      </span>
                      <span className="dpv-bldg-action-target">{o.receptionist}</span>
                    </div>
                    <button
                      className="btn btn-primary dpv-bldg-action-btn"
                      onClick={e => { e.stopPropagation(); tryDropAt(o.id); }}>
                      <Icon name="deploy" size={13}/>
                      搬进去
                    </button>
                    <button
                      className="dpv-bldg-action-cancel"
                      onClick={e => { e.stopPropagation(); setPickedId(null); }}>
                      取消
                    </button>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </div>

      {/* ============ LOG (collapsed by default) ============ */}
      {showLog && homeOffice && (
        <div className="dpv-log">
          <div className="dpv-log-head">
            <Icon name="terminal" size={12}/>
            <span>部署日志 · {homeOffice.host}</span>
            <button className="btn btn-sm btn-ghost" onClick={() => setShowLog(false)} style={{marginLeft:"auto"}}>关闭</button>
          </div>
          <div className="dpv-log-body mono">
{`[14:22:01] ► daemon hand-shake @ ${homeOffice.host}
[14:22:01] ✓ daemon online · v0.4.2
[14:22:02] ► uploading opc-${company.id}-v1.4.2.tar (3.1 MB)
[14:22:04] ✓ rsync complete
[14:22:04] ► restarting openclaw daemon
[14:22:06] ✓ daemon up · pid 8421
[14:22:06] ► spawning ${data.AGENTS.length} agents
${data.AGENTS.map(a => `[14:22:0${7 + (data.AGENTS.indexOf(a)%3)}] ✓ ${a.emoji} ${a.name} · ready`).join('\n')}
[14:22:11] ✓ healthcheck pass · all agents responding
[14:22:11] ► company "${company.name}" is now live`}
          </div>
        </div>
      )}

      {/* ============ HISTORY ============ */}
      <div className="dpv-history">
        <div className="dpv-history-head">
          <h3 className="chart-title">最近搬迁</h3>
          <span className="muted" style={{fontSize: 12}}>最近 5 次</span>
        </div>
        <div className="dpv-history-list">
          {[
            { time:"刚刚", from:"—", to:"上海主办公室", co:"🎧 客服小队", who:"陈一鸣", status:"ok" },
            { time:"2 小时前", from:"测试沙箱", to:"北京备份", co:"📝 内容生产部", who:"陈一鸣", status:"ok" },
            { time:"昨天 18:22", from:"—", to:"深圳分部", co:"📊 数据洞察组", who:"李珊", status:"ok" },
            { time:"3 天前", from:"—", to:"测试沙箱", co:"🧪 增长实验室", who:"陈一鸣", status:"warn" },
            { time:"1 周前", from:"上海主办公室", to:"—", co:"⚙️ 运维中枢", who:"system", status:"undo" },
          ].map((d, i) => (
            <div key={i} className={"dpv-history-row " + d.status}>
              <span className="dpv-history-time">{d.time}</span>
              <span className="dpv-history-co">{d.co}</span>
              <span className="dpv-history-arrow">
                {d.from !== "—" && <span className="muted">{d.from}</span>}
                <Icon name="arrowRight" size={11} style={{margin:"0 4px", color:"var(--text-muted)"}}/>
                <span>{d.to}</span>
              </span>
              <span className="dpv-history-who muted">{d.who}</span>
              <span className={"dpv-history-status " + d.status}>
                {d.status === "ok" ? "✓ 成功" : d.status === "warn" ? "⚠ 有警告" : "↩ 撤销"}
              </span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

window.DeployPage = DeployPage;
