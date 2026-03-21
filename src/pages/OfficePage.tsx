import { useEffect, useState, useCallback, useRef } from 'react'
import { getOffices, createOffice, updateOffice, deleteOffice, getOfficeDeployments, checkDaemonHealth, installDaemon, installOpenclaw } from '../lib/api'
import type { DaemonHealthResult } from '../lib/api'
import { toast } from '../components/Toast'
import type { Office, OfficeGrade, OfficeDeployment, AccessAuthType } from '../lib/types'

function fmtDate(ts: number) {
  return new Date(ts * 1000).toLocaleString('zh-CN', { month: 'numeric', day: 'numeric', hour: '2-digit', minute: '2-digit' })
}

const GRADE_LABELS: Record<OfficeGrade, string> = {
  HIGH: '高档',
  MEDIUM: '中档',
  LOW: '普通',
}

export default function OfficePage() {
  const [offices, setOffices] = useState<Office[]>([])
  const [selected, setSelected] = useState<Office | null>(null)
  const [form, setForm] = useState<Partial<Office>>({})
  const [editing, setEditing] = useState(false)
  const [saving, setSaving] = useState(false)
  const [deployHistory, setDeployHistory] = useState<OfficeDeployment[]>([])
  const [daemonHealth, setDaemonHealth] = useState<DaemonHealthResult | null>(null)
  const [healthChecking, setHealthChecking] = useState(false)
  const [installLogs, setInstallLogs] = useState<string[]>([])
  const [installStep, setInstallStep] = useState<'idle' | 'openclaw' | 'daemon' | 'done' | 'error'>('idle')
  const installAbortRef = useRef<boolean>(false)

  // Derived from form.address: true = remote, false = localhost, null = unset
  const addressMode = !form.address ? null : form.address === 'localhost' ? false : true

  useEffect(() => {
    loadOffices()
  }, [])

  const loadOffices = async () => {
    try {
      const list = await getOffices()
      setOffices(list)
      if (list.length > 0 && !selected) {
        setSelected(list[0]); setForm(list[0])
        getOfficeDeployments(list[0].id).then(setDeployHistory).catch(() => setDeployHistory([]))
      } else if (selected) {
        // refresh selected with latest data (e.g. current_opc_name updated)
        const updated = list.find(o => o.id === selected.id)
        if (updated) setSelected(updated)
      }
    } catch (e) { toast(String(e), 'error') }
  }

  const checkDaemon = useCallback(async (daemonUrl: string, apiKey: string) => {
    setHealthChecking(true)
    setDaemonHealth(null)
    try {
      const result = await checkDaemonHealth(daemonUrl, apiKey)
      setDaemonHealth(result)
    } catch (e) {
      setDaemonHealth({ ok: false, error: String(e) })
    } finally {
      setHealthChecking(false)
    }
  }, [])

  const handleSelect = useCallback((office: Office) => {
    setSelected(office); setForm(office)
    setEditing(false)
    setDaemonHealth(null)
    getOfficeDeployments(office.id).then(setDeployHistory).catch(() => setDeployHistory([]))
    if (office.daemon_url) checkDaemon(office.daemon_url, office.daemon_api_key ?? '')
  }, [checkDaemon])

  const handleFormChange = (field: keyof Office, value: unknown) => {
    setForm(prev => ({ ...prev, [field]: value }))
  }

  const handleSave = async () => {
    if (!selected) return
    const isLocalhost = form.address === 'localhost'
    if (isLocalhost) {
      const conflict = offices.find(o => o.id !== selected.id && (!o.address || o.address === 'localhost'))
      if (conflict) {
        toast(`保存失败：「${conflict.name}」已是本机办公室，只能有一个办公室是本机设备`, 'error')
        return
      }
    }
    setSaving(true)
    try {
      const addressChanged = form.address !== selected.address
      const credChanged =
        form.access_auth_type !== selected.access_auth_type ||
        form.access_user !== selected.access_user ||
        form.access_password !== selected.access_password ||
        form.ssh_key_path !== selected.ssh_key_path

      // Address changed → old daemon info is invalid, clear it
      const daemonFields = addressChanged
        ? { daemon_url: undefined, daemon_api_key: undefined }
        : {}

      const updated: Office = { ...selected, ...form, ...daemonFields, updated_at: Math.floor(Date.now() / 1000) }
      await updateOffice(selected.id, updated)
      setOffices(prev => prev.map(o => o.id === updated.id ? updated : o))
      setSelected(updated)
      setEditing(false)
      setDaemonHealth(null)
      toast('办公室信息已保存', 'success')

      if (!addressChanged && updated.daemon_url) {
        checkDaemon(updated.daemon_url, updated.daemon_api_key ?? '')
      }
    } catch (e) { toast(String(e), 'error') }
    finally { setSaving(false) }
  }

  const handleCancel = () => {
    setEditing(false)
    if (selected) setForm(selected)
  }

  const handleAdd = async () => {
    const now = Math.floor(Date.now() / 1000)
    const newOffice: Office = {
      id: crypto.randomUUID(),
      name: `新办公室 ${offices.length + 1}`,
      address: '',
      ownership: 'RENTED',
      decoration_grade: 'MEDIUM',
      created_at: now,
      updated_at: now,
    }
    try {
      await createOffice(newOffice)
      await loadOffices()
      setSelected(newOffice); setForm(newOffice)
      setEditing(true)
      toast('办公室已创建', 'success')
    } catch (e) { toast(String(e), 'error') }
  }

  const handleDelete = async (id: string) => {
    try {
      await deleteOffice(id)
      const list = offices.filter(o => o.id !== id)
      setOffices(list)
      if (selected?.id === id) {
        const next = list[0] ?? null
        setSelected(next); setForm(next ?? {})
        if (next) getOfficeDeployments(next.id).then(setDeployHistory).catch(() => setDeployHistory([]))
        else setDeployHistory([])
      }
      toast('已删除', 'success')
    } catch (e) { toast(String(e), 'error') }
  }

  const handleInstallLatest = async () => {
    if (!selected) return
    if (installStep === 'openclaw' || installStep === 'daemon') return
    installAbortRef.current = false
    setInstallLogs([])
    setInstallStep('openclaw')
    const lg = (line: string) => setInstallLogs(prev => [...prev, line])
    const saved = selected
    const isRemote = !(!saved.address || saved.address === 'localhost')
    const sshBase = isRemote ? {
      ssh_host: saved.address,
      ssh_port: 22,
      ...(saved.access_auth_type === 'ssh_key'
        ? { ssh_key_path: saved.ssh_key_path }
        : { ssh_user: saved.access_user ?? 'root', ssh_password: saved.access_password }),
    } : {}
    const mode = isRemote ? 'ssh' : 'local'
    // Step 1: install openclaw
    try {
      lg('▶ 开始安装 OpenClaw…')
      const r1 = await installOpenclaw({ office_id: selected.id, mode, ...sshBase })
      r1.logs?.forEach(l => lg(l))
      if (!r1.ok) { lg(`❌ ${r1.error ?? '安装失败'}`); setInstallStep('error'); return }
      lg('✅ OpenClaw 安装完成')
    } catch (e) { lg(`❌ ${String(e)}`); setInstallStep('error'); return }
    if (installAbortRef.current) { setInstallStep('idle'); return }
    // Step 2: install daemon
    setInstallStep('daemon')
    try {
      lg('▶ 开始安装 Daemon…')
      const r2 = await installDaemon({ office_id: selected.id, mode, ...sshBase })
      r2.logs?.forEach(l => lg(l))
      if (!r2.ok) { lg(`❌ ${r2.error ?? '安装失败'}`); setInstallStep('error'); return }
      lg('✅ Daemon 安装完成')
      if (r2.daemon_url && r2.api_key) {
        handleFormChange('daemon_url', r2.daemon_url)
        handleFormChange('daemon_api_key', r2.api_key)
        loadOffices()
        checkDaemon(r2.daemon_url, r2.api_key)
      }
      setInstallStep('done')
    } catch (e) { lg(`❌ ${String(e)}`); setInstallStep('error'); }
  }

  return (
    <>
      {/* COL2 - office list */}
      <div className="list-pane">
        <div className="toolbar" style={{ justifyContent: 'space-between' }}>
          <span style={{ fontSize: '15px', fontWeight: 600, color: '#FFFFFF' }}>办公室</span>
        </div>
        <div style={{ flex: 1, overflowY: 'auto' }}>
          {offices.length === 0 && (
            <div style={{ padding: '20px 12px', textAlign: 'center', fontSize: '12px', color: '#8E8E93' }}>
              暂无办公室，点击下方添加
            </div>
          )}
          {offices.map(office => (
            <div
              key={office.id}
              className={`list-row${selected?.id === office.id ? ' selected' : ''}`}
              onClick={() => handleSelect(office)}
              style={{ cursor: 'pointer' }}
            >
              <div style={{
                width: '30px', height: '30px', borderRadius: '8px',
                background: 'linear-gradient(135deg,#8b5cf6,#06b6d4)',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                fontSize: '14px', flexShrink: 0,
              }}>🏢</div>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontSize: '13px', fontWeight: 500, color: selected?.id === office.id ? '#FFFFFF' : 'rgba(255,255,255,0.8)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                  {office.name}
                </div>
                <div style={{ fontSize: '11px', color: 'rgba(255,255,255,0.65)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                  {GRADE_LABELS[office.decoration_grade]}
                  {office.address ? ` · ${office.address}` : ''}
                </div>
              </div>
            </div>
          ))}
        </div>
        <div style={{ padding: '8px 10px', borderTop: '1px solid rgba(255,255,255,0.06)', flexShrink: 0 }}>
          <button
            onClick={handleAdd}
            style={{ width: '100%', display: 'flex', alignItems: 'center', gap: '6px', padding: '5px 8px', borderRadius: '6px', background: 'none', border: 'none', cursor: 'pointer', color: '#8E8E93', fontSize: '12px' }}
          >
            <svg fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24" width="12" height="12"><path strokeLinecap="round" strokeLinejoin="round" d="M12 6v6m0 0v6m0-6h6m-6 0H6"/></svg>
            添加办公室
          </button>
        </div>
      </div>

      {/* COL3 - detail/edit */}
      <main className="detail-pane">
        {!selected ? (
          <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#8E8E93', fontSize: '13px' }}>
            请选择一个办公室
          </div>
        ) : (
          <>
            <div className="toolbar" style={{ justifyContent: 'space-between' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                <span style={{ fontSize: '18px' }}>🏢</span>
                <span style={{ fontSize: '15px', fontWeight: 600, color: '#FFFFFF' }}>{selected.name}</span>
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                {editing ? (
                  <>
                    <button className="tbtn tbtn-ghost" onClick={handleCancel}>取消</button>
                    <button className="tbtn tbtn-accent" onClick={handleSave} disabled={saving}>{saving ? '保存中…' : '保存'}</button>
                  </>
                ) : (
                  <>
                    <button className="tbtn tbtn-ghost" onClick={() => setEditing(true)}>编辑</button>
                    <button className="tbtn tbtn-ghost" style={{ color: '#f43f5e' }} onClick={() => handleDelete(selected.id)}>删除</button>
                  </>
                )}
              </div>
            </div>

            <div style={{ flex: 1, overflowY: 'auto', padding: '12px 16px', display: 'flex', flexDirection: 'column', gap: '18px' }}>

              {/* 基本信息 */}
              <section>
                <div className="section-label" style={{ padding: '0 0 5px' }}>基本信息</div>
                <div className="group">
                  <div className="group-row" style={{ gap: '10px' }}>
                    <span className="group-label">办公室名称</span>
                    <input type="text" value={form.name ?? ''} onChange={e => handleFormChange('name', e.target.value)} className="field-input" style={{ flex: 1 }} disabled={!editing} />
                  </div>
                  <div className="group-row" style={{ gap: '10px' }}>
                    <span className="group-label">地址（IP）</span>
                    <div style={{ display: 'flex', gap: '6px', flex: 1, alignItems: 'center' }}>
                      {(['local', 'remote'] as const).map(t => {
                        const active = t === 'local' ? addressMode === false : addressMode === true
                        return (
                          <button key={t} onClick={() => {
                            if (!editing) return
                            if (t === 'local') handleFormChange('address', 'localhost')
                            else if (form.address === 'localhost') handleFormChange('address', '')
                          }} style={{
                            padding: '4px 10px', borderRadius: '6px', fontSize: '12px', cursor: editing ? 'pointer' : 'default', flexShrink: 0,
                            border: active ? '1px solid rgba(139,92,246,0.6)' : '1px solid rgba(255,255,255,0.1)',
                            background: active ? 'rgba(139,92,246,0.25)' : 'rgba(255,255,255,0.04)',
                            color: active ? '#c4b5fd' : 'rgba(235,235,245,0.45)',
                            fontWeight: active ? 500 : 400,
                            opacity: editing ? 1 : 0.7,
                          }}>
                            {t === 'local' ? '本机' : '远程'}
                          </button>
                        )
                      })}
                      <input
                        type="text"
                        value={addressMode !== false ? (form.address ?? '') : ''}
                        onChange={e => handleFormChange('address', e.target.value)}
                        disabled={addressMode === false || !editing}
                        className="field-input"
                        style={{ flex: 1, opacity: addressMode === false ? 0.5 : 1 }}
                        placeholder="如：192.168.1.100 或云主机 IP"
                      />
                    </div>
                  </div>
                  {/* 门禁：仅远程模式显示 */}
                  {addressMode === true && (
                    <div className="group-row" style={{ gap: '10px', alignItems: 'flex-start', flexDirection: 'column', padding: '8px 12px' }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '10px', width: '100%' }}>
                        <span className="group-label">门禁</span>
                        <div style={{ display: 'flex', gap: '6px' }}>
                          {(['password', 'ssh_key'] as AccessAuthType[]).map(t => {
                            const active = (form.access_auth_type ?? 'password') === t
                            return (
                              <button key={t} onClick={() => { if (editing) handleFormChange('access_auth_type', t) }} style={{
                                padding: '4px 10px', borderRadius: '6px', fontSize: '12px', cursor: editing ? 'pointer' : 'default', flexShrink: 0,
                                border: active ? '1px solid rgba(139,92,246,0.6)' : '1px solid rgba(255,255,255,0.1)',
                                background: active ? 'rgba(139,92,246,0.25)' : 'rgba(255,255,255,0.04)',
                                color: active ? '#c4b5fd' : 'rgba(235,235,245,0.45)',
                                fontWeight: active ? 500 : 400,
                                opacity: editing ? 1 : 0.7,
                              }}>
                                {t === 'password' ? '用户名密码' : 'SSH 私钥'}
                              </button>
                            )
                          })}
                        </div>
                      </div>
                      {(form.access_auth_type ?? 'password') === 'password' ? (
                        <div style={{ display: 'flex', gap: '6px', width: '100%', paddingLeft: '82px' }}>
                          <input type="text" value={form.access_user ?? ''} onChange={e => handleFormChange('access_user', e.target.value)} className="field-input" style={{ flex: 1 }} placeholder="用户名" disabled={!editing} />
                          <input type="password" value={form.access_password ?? ''} onChange={e => handleFormChange('access_password', e.target.value)} className="field-input" style={{ flex: 1 }} placeholder="密码" disabled={!editing} />
                        </div>
                      ) : (
                        <div style={{ display: 'flex', width: '100%', paddingLeft: '82px' }}>
                          <input type="text" value={form.ssh_key_path ?? ''} onChange={e => handleFormChange('ssh_key_path', e.target.value)} className="field-input" style={{ flex: 1 }} placeholder="如：~/.ssh/id_rsa" disabled={!editing} />
                        </div>
                      )}
                    </div>
                  )}
                  <div className="group-row" style={{ gap: '10px' }}>
                    <span className="group-label">装修档次</span>
                    <div style={{ display: 'flex', gap: '8px', flex: 1 }}>
                      {(['HIGH', 'MEDIUM', 'LOW'] as OfficeGrade[]).map(v => (
                        <button
                          key={v}
                          onClick={() => { if (editing) handleFormChange('decoration_grade', v) }}
                          style={{
                            padding: '5px 14px', borderRadius: '6px', fontSize: '12px', cursor: editing ? 'pointer' : 'default', border: 'none',
                            background: form.decoration_grade === v ? 'rgba(139,92,246,0.2)' : 'rgba(255,255,255,0.06)',
                            color: form.decoration_grade === v ? '#a78bfa' : 'rgba(235,235,245,0.6)',
                            opacity: editing ? 1 : 0.8,
                          }}
                        >
                          {GRADE_LABELS[v]}
                        </button>
                      ))}
                    </div>
                  </div>
                  <div className="group-row" style={{ gap: '10px' }}>
                    <span className="group-label">前台形象</span>
                    <input type="text" value={form.receptionist_image ?? ''} onChange={e => handleFormChange('receptionist_image', e.target.value)} className="field-input" style={{ flex: 1 }} placeholder="如：图片 URL 或描述" disabled={!editing} />
                  </div>
                  <div className="group-row" style={{ gap: '10px', alignItems: 'flex-start' }}>
                    <span className="group-label" style={{ paddingTop: '2px' }}>备注</span>
                    <textarea className="field-input" rows={2} style={{ flex: 1, padding: '5px 9px', lineHeight: 1.5, resize: 'none' }} value={form.description ?? ''} onChange={e => handleFormChange('description', e.target.value)} disabled={!editing} />
                  </div>
                </div>
              </section>

              {/* 物业信息 */}
              <section>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '0 0 5px' }}>
                  <span className="section-label" style={{ padding: 0 }}>物业信息</span>
                  <div style={{ display: 'flex', gap: '6px' }}>
                    {selected.daemon_url && (
                      <button
                        onClick={() => checkDaemon(selected.daemon_url!, selected.daemon_api_key ?? '')}
                        disabled={healthChecking || installStep === 'openclaw' || installStep === 'daemon'}
                        style={{ padding: '2px 8px', borderRadius: '5px', fontSize: '11px', cursor: 'pointer', border: '1px solid rgba(255,255,255,0.12)', background: 'rgba(255,255,255,0.05)', color: 'rgba(235,235,245,0.6)', opacity: healthChecking ? 0.5 : 1 }}
                      >
                        {healthChecking ? '检测中…' : '刷新'}
                      </button>
                    )}
                    <button
                      onClick={handleInstallLatest}
                      disabled={installStep === 'openclaw' || installStep === 'daemon'}
                      style={{
                        padding: '2px 8px', borderRadius: '5px', fontSize: '11px', cursor: 'pointer',
                        border: '1px solid rgba(139,92,246,0.4)', background: 'rgba(139,92,246,0.12)', color: '#c4b5fd',
                        opacity: (installStep === 'openclaw' || installStep === 'daemon') ? 0.5 : 1,
                      }}
                    >
                      {installStep === 'openclaw' ? '安装 OpenClaw…' : installStep === 'daemon' ? '安装 Daemon…' : '安装最新物业'}
                    </button>
                  </div>
                </div>
                <div className="group">
                  <div className="group-row">
                    <span className="group-label">安装状态</span>
                    {selected.daemon_url ? (
                      <span className="group-value" style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                        <span style={{ width: '7px', height: '7px', borderRadius: '50%', flexShrink: 0, background: daemonHealth?.ok ? '#34c759' : healthChecking ? '#ff9f0a' : daemonHealth ? '#8E8E93' : '#34c759' }} />
                        <span style={{ fontSize: '13px', color: daemonHealth?.ok ? '#34c759' : healthChecking ? '#ff9f0a' : daemonHealth ? '#8E8E93' : '#34c759' }}>
                          {healthChecking ? '检测中…' : daemonHealth?.ok ? '已安装并运行' : daemonHealth ? '已安装（离线）' : '已安装'}
                        </span>
                      </span>
                    ) : (
                      <span className="group-value" style={{ color: '#8E8E93' }}>未安装</span>
                    )}
                  </div>
                  <div className="group-row">
                    <span className="group-label">物业版本</span>
                    <span className="group-value" style={{ color: daemonHealth?.version ? '#EBEBF5' : '#8E8E93' }}>
                      {daemonHealth?.version ? `v${daemonHealth.version}` : '—'}
                    </span>
                  </div>
                  {daemonHealth && !daemonHealth.ok && daemonHealth.error && (
                    <div style={{ padding: '5px 10px', fontSize: '11px', color: '#f87171', background: 'rgba(244,63,94,0.06)', borderTop: '1px solid rgba(244,63,94,0.1)' }}>
                      {daemonHealth.error}
                    </div>
                  )}
                  {/* 安装进度日志 */}
                  {installLogs.length > 0 && (
                    <div style={{ borderTop: '1px solid rgba(255,255,255,0.06)' }}>
                      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '6px 10px 4px' }}>
                        <span style={{ fontSize: '11px', color: 'rgba(235,235,245,0.4)' }}>
                          {installStep === 'openclaw' ? '安装 OpenClaw 中…' : installStep === 'daemon' ? '安装 Daemon 中…' : installStep === 'done' ? '✅ 安装完成' : '❌ 安装失败'}
                        </span>
                        {(installStep === 'done' || installStep === 'error') && (
                          <button onClick={() => { setInstallLogs([]); setInstallStep('idle') }} style={{ fontSize: '10px', background: 'none', border: 'none', color: 'rgba(235,235,245,0.35)', cursor: 'pointer', padding: 0 }}>收起</button>
                        )}
                      </div>
                      <div style={{ margin: '0 10px 8px', background: 'rgba(0,0,0,0.3)', borderRadius: '6px', padding: '8px 10px', fontFamily: 'monospace', fontSize: '11px', lineHeight: 1.7, maxHeight: '160px', overflowY: 'auto' }}>
                        {installLogs.map((line, i) => (
                          <div key={i} style={{ color: line.startsWith('❌') ? '#f87171' : (line.startsWith('✅') || line.startsWith('🔑') || line.startsWith('💾')) ? '#34d399' : line.startsWith('▶') ? '#a78bfa' : '#EBEBF5' }}>
                            {line}
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              </section>

              {/* 部署信息 */}
              <section>
                <div className="section-label" style={{ padding: '0 0 5px' }}>当前部署</div>
                <div className="group">
                  <div className="group-row">
                    <span className="group-label">部署公司</span>
                    {selected.current_opc_id ? (
                      <span className="group-value flex-center gap-5">
                        <span style={{ width: '7px', height: '7px', borderRadius: '50%', background: '#34c759', flexShrink: 0 }}></span>
                        <a href="#/opc" style={{ color: '#a78bfa', fontSize: '13px', textDecoration: 'none' }}>
                          {selected.current_opc_name}
                        </a>
                      </span>
                    ) : (
                      <span className="group-value" style={{ color: '#8E8E93' }}>未部署</span>
                    )}
                  </div>
                </div>
              </section>

              {deployHistory.length > 0 && (
                <section>
                  <div className="section-label" style={{ padding: '0 0 5px' }}>部署历史</div>
                  <div className="group">
                    {deployHistory.map(d => (
                      <div key={d.id} className="group-row" style={{ gap: '8px' }}>
                        <span style={{
                          fontSize: '10px', padding: '1px 6px', borderRadius: '4px', flexShrink: 0,
                          background: d.is_active ? 'rgba(52,199,89,0.15)' : 'rgba(255,255,255,0.06)',
                          color: d.is_active ? '#34c759' : '#8E8E93',
                        }}>
                          {d.is_active ? '运行中' : '已撤销'}
                        </span>
                        <div style={{ flex: 1 }}>
                          <div style={{ fontSize: '12px', color: '#EBEBF5' }}>{d.opc_name}</div>
                          <div style={{ fontSize: '11px', color: '#8E8E93' }}>
                            {fmtDate(d.deployed_at)}
                            {d.undeployed_at ? ` → ${fmtDate(d.undeployed_at)}` : ''}
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                </section>
              )}

            </div>
          </>
        )}
      </main>
    </>
  )
}
