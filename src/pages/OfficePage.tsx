import { useEffect, useState, useCallback } from 'react'
import { getOffices, createOffice, updateOffice, deleteOffice, getOfficeDeployments, checkDaemonHealth, installDaemon, installOpenclaw } from '../lib/api'
import type { DaemonHealthResult, InstallDaemonResult } from '../lib/api'
import { toast } from '../components/Toast'
import type { Office, OfficeGrade, OfficeDeployment } from '../lib/types'

// ── InstallPropertyModal (two-step wizard) ─────────────────
function InstallPropertyModal({ office, onClose, onInstalled }: {
  office: Office
  onClose: () => void
  onInstalled: (daemonUrl: string, apiKey: string) => void
}) {
  // Shared SSH config
  const [mode, setMode] = useState<'local' | 'ssh'>('local')
  const [sshHost, setSshHost] = useState('')
  const [sshPort, setSshPort] = useState(22)
  const [sshUser, setSshUser] = useState('root')
  const [sshKeyPath, setSshKeyPath] = useState('')

  // Step 1: install OpenClaw
  const [step1Done, setStep1Done] = useState(false)
  const [step1Installing, setStep1Installing] = useState(false)
  const [step1Logs, setStep1Logs] = useState<string[]>([])
  const [step1Error, setStep1Error] = useState<string | null>(null)

  // Step 2: install Daemon
  const [daemonPort, setDaemonPort] = useState(8443)
  const [step2Installing, setStep2Installing] = useState(false)
  const [step2Result, setStep2Result] = useState<InstallDaemonResult | null>(null)

  const inputStyle = { flex: 1, background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.12)', borderRadius: '7px', color: '#EBEBF5', fontSize: '12px', padding: '6px 9px', outline: 'none', fontFamily: 'inherit' }
  const labelStyle = { fontSize: '12px', color: 'rgba(235,235,245,0.5)', minWidth: '80px', flexShrink: 0 }

  const handleInstallOpenclaw = async () => {
    setStep1Installing(true)
    setStep1Logs([])
    setStep1Error(null)
    try {
      const res = await installOpenclaw({
        office_id: office.id,
        mode,
        ...(mode === 'ssh' ? { ssh_host: sshHost, ssh_port: sshPort, ssh_user: sshUser, ssh_key_path: sshKeyPath || undefined } : {}),
      })
      setStep1Logs(res.logs ?? [])
      if (res.ok) {
        setStep1Done(true)
      } else {
        setStep1Error(res.error ?? '安装失败')
      }
    } catch (e: any) {
      setStep1Error(String(e))
    } finally {
      setStep1Installing(false)
    }
  }

  const handleInstallDaemon = async () => {
    setStep2Installing(true)
    setStep2Result(null)
    try {
      const res = await installDaemon({
        office_id: office.id,
        mode,
        daemon_port: daemonPort,
        ...(mode === 'ssh' ? { ssh_host: sshHost, ssh_port: sshPort, ssh_user: sshUser, ssh_key_path: sshKeyPath || undefined } : {}),
      })
      setStep2Result(res)
      if (res.ok && res.daemon_url && res.api_key) {
        onInstalled(res.daemon_url, res.api_key)
      }
    } catch (e: any) {
      setStep2Result({ ok: false, error: String(e), logs: [] })
    } finally {
      setStep2Installing(false)
    }
  }

  const stepIndicatorStyle = (active: boolean, done: boolean, locked: boolean) => ({
    display: 'flex', alignItems: 'center', gap: '6px', flex: 1,
    padding: '8px 10px', borderRadius: '8px',
    background: done ? 'rgba(52,199,89,0.1)' : active ? 'rgba(139,92,246,0.15)' : 'rgba(255,255,255,0.03)',
    border: `1px solid ${done ? 'rgba(52,199,89,0.3)' : active ? 'rgba(139,92,246,0.4)' : 'rgba(255,255,255,0.07)'}`,
    opacity: locked ? 0.45 : 1,
  })

  const dotStyle = (done: boolean, active: boolean) => ({
    width: '18px', height: '18px', borderRadius: '50%', flexShrink: 0,
    display: 'flex', alignItems: 'center', justifyContent: 'center',
    fontSize: '10px', fontWeight: 700,
    background: done ? '#34c759' : active ? '#8b5cf6' : 'rgba(255,255,255,0.12)',
    color: done || active ? 'white' : '#8E8E93',
  })

  const LogBox = ({ logs, loading }: { logs: string[], loading?: boolean }) => (
    <div style={{ background: 'rgba(0,0,0,0.35)', borderRadius: '8px', border: '1px solid rgba(255,255,255,0.07)', padding: '10px 12px', fontFamily: 'monospace', fontSize: '11px', lineHeight: '1.7', maxHeight: '140px', overflowY: 'auto' }}>
      {logs.map((line, i) => (
        <div key={i} style={{ color: line.startsWith('❌') ? '#f87171' : (line.startsWith('✅') || line.startsWith('🔑') || line.startsWith('💾')) ? '#34d399' : '#EBEBF5' }}>{line}</div>
      ))}
      {loading && <div style={{ color: '#a78bfa' }}>…</div>}
    </div>
  )

  return (
    <div style={{ position: 'fixed', inset: 0, zIndex: 300, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
      <div onClick={onClose} style={{ position: 'absolute', inset: 0, background: 'rgba(0,0,0,0.6)' }} />
      <div style={{ position: 'relative', width: '500px', background: '#1C1C1E', borderRadius: '14px', border: '1px solid rgba(255,255,255,0.1)', boxShadow: '0 24px 64px rgba(0,0,0,0.6)', display: 'flex', flexDirection: 'column', maxHeight: '92vh', overflow: 'hidden' }}>
        {/* Header */}
        <div style={{ padding: '16px 18px 12px', borderBottom: '1px solid rgba(255,255,255,0.08)', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <div>
            <div style={{ fontSize: '14px', fontWeight: 600, color: '#FFFFFF' }}>安装物业</div>
            <div style={{ fontSize: '11px', color: '#8E8E93', marginTop: '1px' }}>为 {office.name} 安装 OpenClaw + Daemon</div>
          </div>
          <button onClick={onClose} style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#8E8E93', fontSize: '18px', lineHeight: 1, padding: '2px 6px' }}>×</button>
        </div>

        <div style={{ padding: '14px 18px', overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: '14px' }}>

          {/* Step indicator */}
          <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
            <div style={stepIndicatorStyle(!step1Done, !step1Done, false)}>
              <div style={dotStyle(step1Done, !step1Done)}>{step1Done ? '✓' : '1'}</div>
              <span style={{ fontSize: '12px', fontWeight: 500, color: step1Done ? '#34c759' : '#EBEBF5' }}>安装 OpenClaw</span>
            </div>
            <div style={{ color: 'rgba(255,255,255,0.2)', fontSize: '16px', flexShrink: 0 }}>—</div>
            <div style={stepIndicatorStyle(step1Done, step1Done, !step1Done)}>
              <div style={dotStyle(!!step2Result?.ok, step1Done && !step2Result?.ok)}>{step2Result?.ok ? '✓' : '2'}</div>
              <span style={{ fontSize: '12px', fontWeight: 500, color: step2Result?.ok ? '#34c759' : step1Done ? '#EBEBF5' : '#636366' }}>安装 Daemon</span>
            </div>
          </div>

          {/* Shared SSH config */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: '10px', padding: '10px 12px', background: 'rgba(255,255,255,0.03)', borderRadius: '8px', border: '1px solid rgba(255,255,255,0.07)' }}>
            <div style={{ fontSize: '11px', color: 'rgba(235,235,245,0.5)', marginBottom: '2px' }}>安装模式（Step 1 & 2 共用）</div>
            <div style={{ display: 'flex', gap: '8px' }}>
              {(['local', 'ssh'] as const).map(m => (
                <button key={m} onClick={() => setMode(m)} style={{
                  flex: 1, padding: '7px', borderRadius: '7px', fontSize: '12px', cursor: 'pointer', fontWeight: mode === m ? 600 : 400,
                  border: mode === m ? '1px solid rgba(139,92,246,0.6)' : '1px solid rgba(255,255,255,0.1)',
                  background: mode === m ? 'rgba(139,92,246,0.18)' : 'rgba(255,255,255,0.04)',
                  color: mode === m ? '#c4b5fd' : 'rgba(235,235,245,0.5)',
                }}>
                  {m === 'local' ? '🖥 本机' : '🌐 SSH远程'}
                </button>
              ))}
            </div>
            {mode === 'ssh' && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '7px' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                  <span style={labelStyle}>主机地址</span>
                  <input placeholder="192.168.1.100 或域名" value={sshHost} onChange={e => setSshHost(e.target.value)} style={inputStyle} />
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                  <span style={labelStyle}>SSH 端口</span>
                  <input type="number" value={sshPort} onChange={e => setSshPort(Number(e.target.value))} style={{ ...inputStyle, width: '80px', flex: 'none' }} />
                  <span style={labelStyle}>用户名</span>
                  <input value={sshUser} onChange={e => setSshUser(e.target.value)} style={inputStyle} />
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                  <span style={labelStyle}>SSH 密钥</span>
                  <input placeholder="留空则使用 ~/.ssh/id_rsa" value={sshKeyPath} onChange={e => setSshKeyPath(e.target.value)} style={inputStyle} />
                </div>
              </div>
            )}
          </div>

          {/* Step 1: Install OpenClaw */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
            <div style={{ fontSize: '12px', fontWeight: 600, color: step1Done ? '#34c759' : '#EBEBF5' }}>
              § Step 1：安装 OpenClaw
              {step1Done && <span style={{ marginLeft: '8px', fontSize: '11px' }}>✅ OpenClaw 已就绪</span>}
            </div>
            {!step1Done && (
              <button
                onClick={handleInstallOpenclaw}
                disabled={step1Installing || (mode === 'ssh' && !sshHost)}
                style={{
                  padding: '8px', borderRadius: '8px', fontSize: '12px', fontWeight: 600, cursor: step1Installing ? 'not-allowed' : 'pointer', border: 'none',
                  background: step1Installing ? 'rgba(139,92,246,0.4)' : 'rgba(139,92,246,0.8)', color: 'white',
                  opacity: (mode === 'ssh' && !sshHost) ? 0.4 : 1,
                }}
              >
                {step1Installing ? '安装中…' : '开始安装 OpenClaw'}
              </button>
            )}
            {(step1Installing || step1Logs.length > 0) && (
              <LogBox logs={step1Logs} loading={step1Installing} />
            )}
            {step1Error && (
              <div style={{ background: 'rgba(244,63,94,0.08)', border: '1px solid rgba(244,63,94,0.2)', borderRadius: '8px', padding: '8px 12px', fontSize: '12px', color: '#f87171', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                <span>安装失败：{step1Error}</span>
                <button onClick={() => { setStep1Error(null); setStep1Logs([]) }} style={{ fontSize: '11px', background: 'none', border: '1px solid rgba(244,63,94,0.4)', borderRadius: '5px', color: '#f87171', cursor: 'pointer', padding: '2px 8px', flexShrink: 0 }}>重试</button>
              </div>
            )}
          </div>

          {/* Step 2: Install Daemon */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', opacity: step1Done ? 1 : 0.45 }}>
            <div style={{ fontSize: '12px', fontWeight: 600, color: step2Result?.ok ? '#34c759' : step1Done ? '#EBEBF5' : '#636366' }}>
              § Step 2：安装 Daemon
              {step2Result?.ok && <span style={{ marginLeft: '8px', fontSize: '11px' }}>✅ Daemon 已就绪</span>}
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
              <span style={labelStyle}>监听端口</span>
              <input type="number" value={daemonPort} onChange={e => setDaemonPort(Number(e.target.value))} disabled={!step1Done} style={{ ...inputStyle, width: '90px', flex: 'none' }} />
              <span style={{ fontSize: '11px', color: 'rgba(235,235,245,0.35)' }}>默认 8443</span>
            </div>
            {!step2Result?.ok && (
              <button
                onClick={handleInstallDaemon}
                disabled={!step1Done || step2Installing || (mode === 'ssh' && !sshHost)}
                style={{
                  padding: '8px', borderRadius: '8px', fontSize: '12px', fontWeight: 600, cursor: (!step1Done || step2Installing) ? 'not-allowed' : 'pointer', border: 'none',
                  background: step2Installing ? 'rgba(6,182,212,0.4)' : 'rgba(6,182,212,0.7)', color: 'white',
                  opacity: (!step1Done || (mode === 'ssh' && !sshHost)) ? 0.4 : 1,
                }}
              >
                {step2Installing ? '安装中…' : '开始安装 Daemon'}
              </button>
            )}
            {(step2Installing || (step2Result?.logs ?? []).length > 0) && (
              <LogBox logs={step2Result?.logs ?? []} loading={step2Installing} />
            )}
            {step2Result?.ok && (
              <div style={{ background: 'rgba(52,199,89,0.08)', border: '1px solid rgba(52,199,89,0.2)', borderRadius: '8px', padding: '12px 14px', display: 'flex', flexDirection: 'column', gap: '8px' }}>
                <div style={{ fontSize: '12px', fontWeight: 600, color: '#34c759' }}>安装成功{step2Result.already_running ? '（已运行）' : ''}</div>
                <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                  <span style={{ fontSize: '11px', color: '#8E8E93', minWidth: '72px' }}>Daemon URL</span>
                  <code style={{ flex: 1, fontSize: '11px', color: '#EBEBF5', background: 'rgba(255,255,255,0.06)', padding: '3px 7px', borderRadius: '4px', wordBreak: 'break-all' }}>{step2Result.daemon_url}</code>
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                  <span style={{ fontSize: '11px', color: '#8E8E93', minWidth: '72px' }}>API Key</span>
                  <code style={{ flex: 1, fontSize: '11px', color: '#EBEBF5', background: 'rgba(255,255,255,0.06)', padding: '3px 7px', borderRadius: '4px', wordBreak: 'break-all' }}>{step2Result.api_key}</code>
                </div>
                <div style={{ fontSize: '11px', color: '#34c759' }}>配置已自动写入办公室，点击保存生效。</div>
              </div>
            )}
            {step2Result && !step2Result.ok && (
              <div style={{ background: 'rgba(244,63,94,0.08)', border: '1px solid rgba(244,63,94,0.2)', borderRadius: '8px', padding: '8px 12px', fontSize: '12px', color: '#f87171', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                <span>安装失败：{step2Result.error}</span>
                <button onClick={() => setStep2Result(null)} style={{ fontSize: '11px', background: 'none', border: '1px solid rgba(244,63,94,0.4)', borderRadius: '5px', color: '#f87171', cursor: 'pointer', padding: '2px 8px', flexShrink: 0 }}>重试</button>
              </div>
            )}
          </div>
        </div>

        <div style={{ padding: '10px 18px', borderTop: '1px solid rgba(255,255,255,0.06)', display: 'flex', justifyContent: 'flex-end' }}>
          <button onClick={onClose} style={{ padding: '6px 14px', borderRadius: '7px', background: 'rgba(255,255,255,0.06)', border: 'none', color: 'rgba(235,235,245,0.6)', fontSize: '12px', cursor: 'pointer' }}>关闭</button>
        </div>
      </div>
    </div>
  )
}

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
  const [saving, setSaving] = useState(false)
  const [deployHistory, setDeployHistory] = useState<OfficeDeployment[]>([])
  const [remoteMode, setRemoteMode] = useState(false)
  const [daemonHealth, setDaemonHealth] = useState<DaemonHealthResult | null>(null)
  const [healthChecking, setHealthChecking] = useState(false)
  const [installModalOpen, setInstallModalOpen] = useState(false)

  const initAddressMode = (office: Partial<Office>) => {
    setRemoteMode(!(!office.address || office.address === 'localhost'))
  }

  useEffect(() => {
    loadOffices()
  }, [])

  const loadOffices = async () => {
    try {
      const list = await getOffices()
      setOffices(list)
      if (list.length > 0 && !selected) {
        setSelected(list[0]); setForm(list[0]); initAddressMode(list[0])
        getOfficeDeployments(list[0].id).then(setDeployHistory).catch(() => setDeployHistory([]))
      } else if (selected) {
        // refresh selected with latest data (e.g. current_opc_name updated)
        const updated = list.find(o => o.id === selected.id)
        if (updated) setSelected(updated)
      }
    } catch (e) { toast(String(e), 'error') }
  }

  const handleSelect = useCallback((office: Office) => {
    setSelected(office); setForm(office); initAddressMode(office)
    setDaemonHealth(null)
    getOfficeDeployments(office.id).then(setDeployHistory).catch(() => setDeployHistory([]))
  }, [])

  const handleFormChange = (field: keyof Office, value: unknown) => {
    setForm(prev => ({ ...prev, [field]: value }))
  }

  const handleSave = async () => {
    if (!selected) return
    setSaving(true)
    try {
      const updated: Office = { ...selected, ...form, updated_at: Math.floor(Date.now() / 1000) }
      await updateOffice(selected.id, updated)
      setOffices(prev => prev.map(o => o.id === updated.id ? updated : o))
      setSelected(updated)
      toast('办公室信息已保存', 'success')
    } catch (e) { toast(String(e), 'error') }
    finally { setSaving(false) }
  }

  const handleCancel = () => { if (selected) { setForm(selected); initAddressMode(selected) } }

  const handleCheckDaemon = async () => {
    if (!form.daemon_url) { toast('请先填写 Daemon URL', 'error'); return }
    setHealthChecking(true)
    setDaemonHealth(null)
    try {
      const result = await checkDaemonHealth(form.daemon_url!, form.daemon_api_key ?? '')
      setDaemonHealth(result)
    } catch (e) {
      setDaemonHealth({ ok: false, error: String(e) })
    } finally {
      setHealthChecking(false)
    }
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
      setSelected(newOffice); setForm(newOffice); initAddressMode(newOffice)
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

  const handleInstalled = (daemonUrl: string, apiKey: string) => {
    handleFormChange('daemon_url', daemonUrl)
    handleFormChange('daemon_api_key', apiKey)
    loadOffices()
  }

  return (
    <>
      {installModalOpen && selected && (
        <InstallPropertyModal
          office={selected}
          onClose={() => setInstallModalOpen(false)}
          onInstalled={handleInstalled}
        />
      )}
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
                <button className="tbtn tbtn-ghost" onClick={handleCancel}>取消</button>
                <button className="tbtn tbtn-accent" onClick={handleSave} disabled={saving}>保存</button>
                <button className="tbtn tbtn-ghost" style={{ color: '#f43f5e' }} onClick={() => handleDelete(selected.id)}>删除</button>
              </div>
            </div>

            <div style={{ flex: 1, overflowY: 'auto', padding: '12px 16px', display: 'flex', flexDirection: 'column', gap: '18px' }}>

              {/* 基本信息 */}
              <section>
                <div className="section-label" style={{ padding: '0 0 5px' }}>基本信息</div>
                <div className="group">
                  <div className="group-row" style={{ gap: '10px' }}>
                    <span className="group-label">办公室名称</span>
                    <input type="text" value={form.name ?? ''} onChange={e => handleFormChange('name', e.target.value)} className="field-input" style={{ flex: 1 }} />
                  </div>
                  <div className="group-row" style={{ gap: '10px' }}>
                    <span className="group-label">地址（IP）</span>
                    <div style={{ display: 'flex', gap: '6px', flex: 1, alignItems: 'center' }}>
                      {(['local', 'remote'] as const).map(t => {
                        const active = t === 'local' ? !remoteMode : remoteMode
                        return (
                          <button key={t} onClick={() => {
                            if (t === 'local') { setRemoteMode(false); handleFormChange('address', 'localhost') }
                            else { setRemoteMode(true); if (!form.address || form.address === 'localhost') handleFormChange('address', '') }
                          }} style={{
                            padding: '4px 10px', borderRadius: '6px', fontSize: '12px', cursor: 'pointer', flexShrink: 0,
                            border: active ? '1px solid rgba(139,92,246,0.6)' : '1px solid rgba(255,255,255,0.1)',
                            background: active ? 'rgba(139,92,246,0.25)' : 'rgba(255,255,255,0.04)',
                            color: active ? '#c4b5fd' : 'rgba(235,235,245,0.45)',
                            fontWeight: active ? 500 : 400,
                          }}>
                            {t === 'local' ? '本机' : '远程'}
                          </button>
                        )
                      })}
                      <input
                        type="text"
                        value={remoteMode ? (form.address ?? '') : ''}
                        onChange={e => handleFormChange('address', e.target.value)}
                        disabled={!remoteMode}
                        className="field-input"
                        style={{ flex: 1, opacity: remoteMode ? 1 : 0.5 }}
                        placeholder="如：192.168.1.100 或云主机 IP"
                      />
                    </div>
                  </div>
                  <div className="group-row" style={{ gap: '10px' }}>
                    <span className="group-label">电话</span>
                    <input type="text" value={form.phone ?? ''} onChange={e => handleFormChange('phone', e.target.value)} className="field-input" style={{ flex: 1 }} />
                  </div>
                  <div className="group-row" style={{ gap: '10px' }}>
                    <span className="group-label">网速</span>
                    <input type="text" value={form.internet_speed ?? ''} onChange={e => handleFormChange('internet_speed', e.target.value)} className="field-input" style={{ flex: 1 }} placeholder="如：1000Mbps" />
                  </div>
                  <div className="group-row" style={{ gap: '10px' }}>
                    <span className="group-label">装修档次</span>
                    <div style={{ display: 'flex', gap: '8px', flex: 1 }}>
                      {(['HIGH', 'MEDIUM', 'LOW'] as OfficeGrade[]).map(v => (
                        <button
                          key={v}
                          onClick={() => handleFormChange('decoration_grade', v)}
                          style={{
                            padding: '5px 14px', borderRadius: '6px', fontSize: '12px', cursor: 'pointer', border: 'none',
                            background: form.decoration_grade === v ? 'rgba(139,92,246,0.2)' : 'rgba(255,255,255,0.06)',
                            color: form.decoration_grade === v ? '#a78bfa' : 'rgba(235,235,245,0.6)',
                          }}
                        >
                          {GRADE_LABELS[v]}
                        </button>
                      ))}
                    </div>
                  </div>
                  <div className="group-row" style={{ gap: '10px', alignItems: 'flex-start' }}>
                    <span className="group-label" style={{ paddingTop: '2px' }}>备注</span>
                    <textarea className="field-input" rows={2} style={{ flex: 1, padding: '5px 9px', lineHeight: 1.5, resize: 'none' }} value={form.description ?? ''} onChange={e => handleFormChange('description', e.target.value)} />
                  </div>
                </div>
              </section>

              {/* 门禁与前台 */}
              <section>
                <div className="section-label" style={{ padding: '0 0 5px' }}>门禁与前台</div>
                <div className="group">
                  <div className="group-row" style={{ gap: '10px' }}>
                    <span className="group-label">门禁卡</span>
                    <input type="text" value={form.access_card ?? ''} onChange={e => handleFormChange('access_card', e.target.value)} className="field-input" style={{ flex: 1 }} placeholder="如：SSH 密钥名称 / 登录账号" />
                  </div>
                  <div className="group-row" style={{ gap: '10px' }}>
                    <span className="group-label">前台形象</span>
                    <input type="text" value={form.receptionist_image ?? ''} onChange={e => handleFormChange('receptionist_image', e.target.value)} className="field-input" style={{ flex: 1 }} placeholder="如：图片 URL 或描述" />
                  </div>
                </div>
              </section>

              {/* Daemon 配置 */}
              <section>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '0 0 5px' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                    <span className="section-label" style={{ padding: 0 }}>Daemon 部署配置</span>
                    {daemonHealth && (
                      <span style={{
                        fontSize: '11px', padding: '1px 7px', borderRadius: '5px', fontWeight: 500,
                        background: daemonHealth.ok ? 'rgba(52,199,89,0.15)' : 'rgba(244,63,94,0.15)',
                        color: daemonHealth.ok ? '#34c759' : '#f43f5e',
                      }}>
                        {daemonHealth.ok ? `在线 · v${daemonHealth.version ?? '?'}` : `离线: ${daemonHealth.error ?? '连接失败'}`}
                      </span>
                    )}
                  </div>
                  <div style={{ display: 'flex', gap: '6px' }}>
                    <button
                      onClick={() => setInstallModalOpen(true)}
                      style={{ padding: '3px 10px', borderRadius: '6px', fontSize: '11px', cursor: 'pointer', border: '1px solid rgba(139,92,246,0.4)', background: 'rgba(139,92,246,0.12)', color: '#c4b5fd', flexShrink: 0 }}
                    >
                      安装物业
                    </button>
                    <button
                      onClick={handleCheckDaemon}
                      disabled={healthChecking}
                      style={{ padding: '3px 10px', borderRadius: '6px', fontSize: '11px', cursor: 'pointer', border: '1px solid rgba(255,255,255,0.15)', background: 'rgba(255,255,255,0.06)', color: 'rgba(235,235,245,0.7)', flexShrink: 0, opacity: healthChecking ? 0.5 : 1 }}
                    >
                      {healthChecking ? '检测中…' : '检测连接'}
                    </button>
                  </div>
                </div>
                <div className="group">
                  <div className="group-row" style={{ gap: '10px' }}>
                    <span className="group-label" style={{ minWidth: 80 }}>Daemon URL</span>
                    <input
                      type="text"
                      value={form.daemon_url ?? ''}
                      onChange={e => handleFormChange('daemon_url', e.target.value)}
                      className="field-input"
                      style={{ flex: 1 }}
                      placeholder="如：http://127.0.0.1:8443 或 https://ec2-xxx:8443"
                    />
                  </div>
                  <div className="group-row" style={{ gap: '10px' }}>
                    <span className="group-label" style={{ minWidth: 80 }}>API Key</span>
                    <input
                      type="password"
                      value={form.daemon_api_key ?? ''}
                      onChange={e => handleFormChange('daemon_api_key', e.target.value)}
                      className="field-input"
                      style={{ flex: 1 }}
                      placeholder="来自 Daemon 启动日志或 ~/.clawpilot/daemon.key"
                    />
                  </div>
                  {daemonHealth?.ok && (
                    <div style={{ padding: '6px 10px', fontSize: '11px', color: 'rgba(52,199,89,0.8)', background: 'rgba(52,199,89,0.06)', borderTop: '1px solid rgba(52,199,89,0.12)' }}>
                      OpenClaw: {daemonHealth.openclaw_status ?? '未知'}
                      {daemonHealth.openclaw_pid != null ? ` (PID ${daemonHealth.openclaw_pid})` : ''}
                      {daemonHealth.active_tasks != null ? ` · ${daemonHealth.active_tasks} 个任务运行中` : ''}
                    </div>
                  )}
                  <div style={{ padding: '4px 8px', fontSize: '11px', color: 'rgba(235,235,245,0.4)' }}>
                    未配置时使用仿真模式（不会实际部署到服务器）
                  </div>
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
