import { useEffect, useState, useCallback, useRef } from 'react'
import { useTranslation } from 'react-i18next'
import { getOffices, createOffice, updateOffice, deleteOffice, getOfficeDeployments, checkDaemonHealth, checkSshConnection, checkSshAuth, installDaemon, installOpenclaw, probeLocalDaemon, probeRemoteDaemon, getLocalDaemonVersion } from '../lib/api'
import type { DaemonHealthResult } from '../lib/api'
import { toast } from '../components/Toast'
import type { Office, OfficeGrade, OfficeDeployment, AccessAuthType } from '../lib/types'

function fmtDate(ts: number) {
    return new Date(ts * 1000).toLocaleString(undefined, { month: 'numeric', day: 'numeric', hour: '2-digit', minute: '2-digit' })
}

export default function OfficePage() {
    const { t } = useTranslation()

    const GRADE_LABELS: Record<OfficeGrade, string> = {
        HIGH: t('office.grade_high'),
        MEDIUM: t('office.grade_medium'),
        LOW: t('office.grade_low'),
    }

    const [offices, setOffices] = useState<Office[]>([])
    const [selected, setSelected] = useState<Office | null>(null)
    const [form, setForm] = useState<Partial<Office>>({})
    const [editing, setEditing] = useState(false)
    const [isNewOffice, setIsNewOffice] = useState(false)
    const [saving, setSaving] = useState(false)
    const [confirmDelete, setConfirmDelete] = useState<Office | null>(null)
    const [deployHistory, setDeployHistory] = useState<OfficeDeployment[]>([])
    const [daemonHealth, setDaemonHealth] = useState<DaemonHealthResult | null>(null)
    const [healthChecking, setHealthChecking] = useState(false)
    const [installLogs, setInstallLogs] = useState<string[]>([])
    const [installStep, setInstallStep] = useState<'idle' | 'openclaw' | 'daemon' | 'done' | 'error'>('idle')
    const installAbortRef = useRef<boolean>(false)
    const [sshChecking, setSshChecking] = useState(false)
    const [sshResult, setSshResult] = useState<{ ok: boolean; latency_ms?: number; error?: string } | null>(null)
    const [latestDaemonVersion, setLatestDaemonVersion] = useState<string | null>(null)

    // Derived from form.address: true = remote, false = localhost, null = unset
    const addressMode = (form.address === null || form.address === undefined) ? null : form.address === 'localhost' ? false : true

    useEffect(() => {
        loadOffices()
        getLocalDaemonVersion().then(r => { if (r.ok && r.version) setLatestDaemonVersion(r.version) }).catch(() => {})
    }, [])

    const loadOffices = async () => {
        try {
            const list = await getOffices()
            setOffices(list)
            if (list.length > 0 && !selected) {
                const first = list[0]
                setSelected(first); setForm(first)
                getOfficeDeployments(first.id).then(setDeployHistory).catch(() => setDeployHistory([]))
                if (first.daemon_url) {
                    checkDaemon(first.daemon_url, first.daemon_api_key ?? '')
                } else {
                    silentProbeLocalDaemon(first)
                }
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

    const silentProbeDaemon = useCallback(async (office: Office) => {
        if (office.daemon_url) return
        try {
            let r: { ok: boolean; daemon_url?: string; api_key?: string }
            if (!office.address || office.address === 'localhost') {
                r = await probeLocalDaemon(office.id)
            } else if (office.access_user && (office.access_password || office.ssh_key_path)) {
                r = await probeRemoteDaemon(office.id)
            } else {
                return
            }
            if (r.ok && r.daemon_url && r.api_key) {
                const updates = { daemon_url: r.daemon_url, daemon_api_key: r.api_key }
                setOffices(prev => prev.map(o => o.id === office.id ? { ...o, ...updates } : o))
                setSelected(prev => prev?.id === office.id ? { ...prev, ...updates } : prev)
                setForm(prev => ({ ...prev, ...updates }))
                checkDaemon(r.daemon_url, r.api_key)
            }
        } catch { /* silent */ }
    }, [checkDaemon])

    const handleSelect = useCallback((office: Office) => {
        if (isNewOffice) setIsNewOffice(false)
        setSelected(office); setForm(office)
        setEditing(false)
        setDaemonHealth(null)
        setSshResult(null)
        getOfficeDeployments(office.id).then(setDeployHistory).catch(() => setDeployHistory([]))
        if (office.daemon_url) {
            checkDaemon(office.daemon_url, office.daemon_api_key ?? '')
        } else {
            silentProbeDaemon(office)
        }
    }, [checkDaemon, silentProbeDaemon, isNewOffice])

    const handleFormChange = (field: keyof Office, value: unknown) => {
        setForm(prev => ({ ...prev, [field]: value }))
    }

    const handleSave = async () => {
        if (!selected) return
        const isLocalhost = form.address === 'localhost'
        if (isLocalhost) {
            const conflict = offices.find(o => o.id !== selected.id && (!o.address || o.address === 'localhost'))
            if (conflict) {
                toast(t('office.save_conflict', { name: conflict.name }), 'error')
                return
            }
        }
        setSaving(true)
        try {
            if (isNewOffice) {
                const now = Math.floor(Date.now() / 1000)
                const newOffice: Office = { ...selected, ...form, created_at: now, updated_at: now } as Office
                await createOffice(newOffice)
                await loadOffices()
                setSelected(newOffice)
                setIsNewOffice(false)
                setEditing(false)
                toast('办公室已创建', 'success')
            } else {
                const addressChanged = form.address !== selected.address
                const daemonFields = addressChanged ? { daemon_url: undefined, daemon_api_key: undefined } : {}
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
            }
        } catch (e) { toast(String(e), 'error') }
        finally { setSaving(false) }
    }

    const handleCancel = () => {
        if (isNewOffice) {
            setIsNewOffice(false)
            setEditing(false)
            const prev = offices[0] ?? null
            setSelected(prev); setForm(prev ?? {})
            if (prev) getOfficeDeployments(prev.id).then(setDeployHistory).catch(() => setDeployHistory([]))
        } else {
            setEditing(false)
            if (selected) setForm(selected)
        }
    }

    const handleAdd = () => {
        if (isNewOffice) return
        const now = Math.floor(Date.now() / 1000)
        const tempOffice: Office = {
            id: crypto.randomUUID(),
            name: t('office.new_office_name', { index: offices.length + 1 }),
            address: undefined,
            ownership: 'RENTED',
            decoration_grade: 'MEDIUM',
            created_at: now,
            updated_at: now,
        }
        setIsNewOffice(true)
        setEditing(true)
        setSelected(tempOffice)
        setForm(tempOffice)
        setDeployHistory([])
        setDaemonHealth(null)
    }

    const handleDelete = async (office: Office) => {
        try {
            await deleteOffice(office.id)
            const list = offices.filter(o => o.id !== office.id)
            setOffices(list)
            if (selected?.id === office.id) {
                const next = list[0] ?? null
                setSelected(next); setForm(next ?? {})
                if (next) getOfficeDeployments(next.id).then(setDeployHistory).catch(() => setDeployHistory([]))
                else setDeployHistory([])
            }
            setConfirmDelete(null)
            toast(t('common.deleted'), 'success')
        } catch (e) { toast(String(e), 'error') }
    }

    // Parse "host" or "host:port" → { host, port }
    const parseAddress = (addr: string): { host: string; port: number } => {
        const m = addr.match(/^(.+):(\d+)$/)
        return m ? { host: m[1], port: Number(m[2]) } : { host: addr, port: 22 }
    }

    const isValidAddress = (addr: string | undefined | null) => {
        if (!addr || !addr.trim()) return false
        if (addr === 'localhost') return true
        const { host } = parseAddress(addr)
        // IP: four octets 0-255
        const ipRe = /^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/
        const m = host.match(ipRe)
        if (m) return m.slice(1).every(n => Number(n) <= 255)
        // hostname
        return /^[a-zA-Z0-9]([a-zA-Z0-9\-\.]*[a-zA-Z0-9])?$/.test(host)
    }

    const handleCheckSsh = async () => {
        const addr = form.address?.trim()
        if (!addr || addr === 'localhost') {
            toast('地址必须是 IP 或 IP:端口格式', 'error')
            return
        }
        // Validate IP/IP:port format
        const ipPortRe = /^(\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3})(?::\d+)?$/
        if (!ipPortRe.test(addr)) {
            toast('地址格式无效，请填写 IP 或 IP:端口', 'error')
            return
        }
        setSshChecking(true)
        setSshResult(null)
        try {
            const r = await checkSshAuth({
                address: addr,
                auth_type: form.access_auth_type ?? 'password',
                user: form.access_user ?? 'root',
                password: form.access_password,
                key_path: form.ssh_key_path,
            })
            setSshResult(r)
        } catch (e: any) {
            setSshResult({ ok: false, error: e?.message ?? '检测失败' })
        } finally {
            setSshChecking(false)
        }
    }

    const handleInstallLatest = async () => {
        if (!selected) return
        if (isNewOffice) { toast('请先保存办公室后再安装物业', 'error'); return }
        if (installStep === 'openclaw' || installStep === 'daemon') return

        // Address validation
        if (!isValidAddress(selected.address)) {
            toast('请先设置有效的办公室地址（本机或合法 IP/主机名）', 'error'); return
        }
        const isRemoteAddr = selected.address !== 'localhost'
        if (isRemoteAddr) {
            setSshChecking(true)
            setSshResult(null)
            let connOk = false
            try {
                const { host: chkHost, port: chkPort } = parseAddress(selected.address!)
                const r = await checkSshConnection(chkHost, chkPort)
                setSshResult(r)
                connOk = r.ok
            } catch {
                setSshResult({ ok: false, error: '网络检测失败' })
            } finally {
                setSshChecking(false)
            }
            if (!connOk) { toast('无法连通远程主机，请检查地址和网络后重试', 'error'); return }
        }
        installAbortRef.current = false
        setInstallLogs([])
        setInstallStep('openclaw')
        const lg = (line: string) => setInstallLogs(prev => [...prev, line])
        const saved = selected
        const isRemote = !(!saved.address || saved.address === 'localhost')
        const { host: sshHost, port: sshPort } = isRemote ? parseAddress(saved.address!) : { host: '', port: 22 }
        const sshBase = isRemote ? {
            ssh_host: sshHost,
            ssh_port: sshPort,
            ...(saved.access_auth_type === 'ssh_key'
                ? { ssh_key_path: saved.ssh_key_path }
                : { ssh_user: saved.access_user ?? 'root', ssh_password: saved.access_password }),
        } : {}
        const mode = isRemote ? 'ssh' : 'local'
        // Step 1: install openclaw
        try {
            lg(t('office.install_openclaw_start'))
            const r1 = await installOpenclaw({ office_id: selected.id, mode, ...sshBase })
            r1.logs?.forEach(l => lg(l))
            if (!r1.ok) { lg(`❌ ${r1.error ?? t('office.install_failed')}`); setInstallStep('error'); return }
            lg(t('office.install_openclaw_done'))
        } catch (e) { lg(`❌ ${String(e)}`); setInstallStep('error'); return }
        if (installAbortRef.current) { setInstallStep('idle'); return }
        // Step 2: install daemon
        setInstallStep('daemon')
        try {
            lg(t('office.install_daemon_start'))
            const r2 = await installDaemon({ office_id: selected.id, mode, ...sshBase })
            r2.logs?.forEach(l => lg(l))
            if (!r2.ok) { lg(`❌ ${r2.error ?? t('office.install_failed')}`); setInstallStep('error'); return }
            lg(t('office.install_daemon_done'))
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
                    <span style={{ fontSize: '15px', fontWeight: 600, color: '#FFFFFF' }}>{t('office.section_title')}</span>
                </div>
                <div style={{ flex: 1, overflowY: 'auto' }}>
                    {offices.length === 0 && (
                        <div style={{ padding: '20px 12px', textAlign: 'center', fontSize: '12px', color: '#8E8E93' }}>
                            {t('office.no_offices')}
                        </div>
                    )}
                    {offices.map(office => (
                        <div
                            key={office.id}
                            className={`list-row${selected?.id === office.id && !isNewOffice ? ' selected' : ''}`}
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
                                <div style={{ display: 'flex', alignItems: 'baseline', gap: '5px', overflow: 'hidden' }}>
                                    <span style={{ fontSize: '13px', fontWeight: 500, color: selected?.id === office.id && !isNewOffice ? '#FFFFFF' : 'rgba(255,255,255,0.8)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                                        {office.name}
                                    </span>
                                    {selected?.id === office.id && editing && !isNewOffice && (
                                        <span style={{ fontSize: '10px', color: '#f59e0b', flexShrink: 0 }}>[未保存]</span>
                                    )}
                                </div>
                                <div style={{ fontSize: '11px', color: 'rgba(255,255,255,0.65)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                                    {GRADE_LABELS[office.decoration_grade]}{office.address ? ` · ${office.address}` : ''}
                                </div>
                            </div>
                        </div>
                    ))}
                    {isNewOffice && (
                        <div className="list-row selected">
                            <div style={{ width: '30px', height: '30px', borderRadius: '8px', background: 'rgba(255,255,255,0.08)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '14px', flexShrink: 0 }}>🏢</div>
                            <div style={{ flex: 1, minWidth: 0 }}>
                                <div style={{ display: 'flex', alignItems: 'baseline', gap: '5px' }}>
                                    <span style={{ fontSize: '13px', fontWeight: 500, color: '#FFFFFF', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{form.name || '新办公室'}</span>
                                    <span style={{ fontSize: '10px', color: '#f59e0b', flexShrink: 0 }}>[未保存]</span>
                                </div>
                            </div>
                        </div>
                    )}
                </div>
                <div style={{ padding: '8px', borderTop: '1px solid rgba(255,255,255,0.06)', flexShrink: 0 }}>
                    <button
                        className="tbtn tbtn-ghost"
                        style={{ width: '100%', fontSize: '12px', justifyContent: 'center' }}
                        onClick={handleAdd}
                    >
                        + {t('office.add_office')}
                    </button>
                </div>
            </div>

            {/* COL3 - detail/edit */}
            <main className="detail-pane">
                {!selected ? (
                    <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#8E8E93', fontSize: '13px' }}>
                        {t('office.select_hint')}
                    </div>
                ) : (
                    <>
                        <div className="toolbar" style={{ justifyContent: 'space-between' }}>
                            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                                <span style={{ fontSize: '18px' }}>🏢</span>
                                <span style={{ fontSize: '15px', fontWeight: 600, color: '#FFFFFF' }}>{isNewOffice ? (form.name || '新办公室') : selected.name}</span>
                                {(editing || isNewOffice) && <span style={{ fontSize: '11px', color: 'rgba(255,255,255,0.35)', fontWeight: 400 }}>未保存</span>}
                            </div>
                            <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                                {(editing || isNewOffice) ? (
                                    <>
                                        <button className="tbtn tbtn-ghost" onClick={handleCancel}>{t('common.button_cancel')}</button>
                                        <button className="tbtn tbtn-accent" onClick={handleSave} disabled={saving}>{saving ? t('common.saving') : t('common.button_save')}</button>
                                    </>
                                ) : (
                                    <>
                                        <button className="tbtn tbtn-ghost" onClick={() => setEditing(true)}>{t('common.button_edit')}</button>
                                        <button className="tbtn tbtn-ghost" style={{ color: '#f43f5e' }} onClick={() => setConfirmDelete(selected)}>{t('common.button_delete')}</button>
                                    </>
                                )
                                }
                            </div >
                        </div >

                        <div style={{ flex: 1, overflowY: 'auto', padding: '12px 16px', display: 'flex', flexDirection: 'column', gap: '18px' }}>

                            {/* 基本信息 */}
                            <section>
                                <div className="section-label" style={{ padding: '0 0 5px' }}>{t('office.section_basic')}</div>
                                <div className="group">
                                    <div className="group-row" style={{ gap: '10px' }}>
                                        <span className="group-label">{t('office.label_name')}</span>
                                        <input type="text" value={form.name ?? ''} onChange={e => handleFormChange('name', e.target.value)} className="field-input" style={{ flex: 1 }} disabled={!editing} />
                                    </div>
                                    <div className="group-row" style={{ gap: '10px' }}>
                                        <span className="group-label">{t('office.label_address')}</span>
                                        <div style={{ display: 'flex', gap: '6px', flex: 1, alignItems: 'center' }}>
                                            {(['local', 'remote'] as const).map(addrType => {
                                                const active = addrType === 'local' ? addressMode === false : addressMode === true
                                                return (
                                                    <button key={addrType} onClick={() => {
                                                        if (!editing) return
                                                        if (addrType === 'local') handleFormChange('address', 'localhost')
                                                        else if (addressMode !== true) handleFormChange('address', '')
                                                    }} style={{
                                                        padding: '4px 10px', borderRadius: '6px', fontSize: '12px', cursor: editing ? 'pointer' : 'default', flexShrink: 0,
                                                        border: active ? '1px solid rgba(139,92,246,0.6)' : '1px solid rgba(255,255,255,0.1)',
                                                        background: active ? 'rgba(139,92,246,0.25)' : 'rgba(255,255,255,0.04)',
                                                        color: active ? '#c4b5fd' : 'rgba(235,235,245,0.45)',
                                                        fontWeight: active ? 500 : 400,
                                                        opacity: editing ? 1 : 0.7,
                                                    }}>
                                                        {addrType === 'local' ? t('office.local') : t('office.remote')}
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
                                                <span className="group-label">{t('office.label_auth')}</span>
                                                <div style={{ display: 'flex', gap: '6px' }}>
                                                    {(['password', 'ssh_key'] as AccessAuthType[]).map(authType => {
                                                        const active = (form.access_auth_type ?? 'password') === authType
                                                        return (
                                                            <button key={authType} onClick={() => { if (editing) handleFormChange('access_auth_type', authType) }} style={{
                                                                padding: '4px 10px', borderRadius: '6px', fontSize: '12px', cursor: editing ? 'pointer' : 'default', flexShrink: 0,
                                                                border: active ? '1px solid rgba(139,92,246,0.6)' : '1px solid rgba(255,255,255,0.1)',
                                                                background: active ? 'rgba(139,92,246,0.25)' : 'rgba(255,255,255,0.04)',
                                                                color: active ? '#c4b5fd' : 'rgba(235,235,245,0.45)',
                                                                fontWeight: active ? 500 : 400,
                                                                opacity: editing ? 1 : 0.7,
                                                            }}>
                                                                {authType === 'password' ? t('office.auth_password') : t('office.auth_ssh_key')}
                                                            </button>
                                                        )
                                                    })}
                                                </div>
                                            </div>
                                            {(form.access_auth_type ?? 'password') === 'password' ? (
                                                <div style={{ display: 'flex', gap: '6px', width: '100%', paddingLeft: '82px' }}>
                                                    <input type="text" value={form.access_user ?? ''} onChange={e => handleFormChange('access_user', e.target.value)} className="field-input" style={{ flex: 1 }} placeholder={t('office.placeholder_username')} disabled={!editing} />
                                                    <input type="password" value={form.access_password ?? ''} onChange={e => handleFormChange('access_password', e.target.value)} className="field-input" style={{ flex: 1 }} placeholder={t('office.placeholder_password')} disabled={!editing} />
                                                </div>
                                            ) : (
                                                <div style={{ display: 'flex', width: '100%', paddingLeft: '82px' }}>
                                                    <input type="text" value={form.ssh_key_path ?? ''} onChange={e => handleFormChange('ssh_key_path', e.target.value)} className="field-input" style={{ flex: 1 }} placeholder={t('office.placeholder_ssh_key')} disabled={!editing} />
                                                </div>
                                            )}
                                            <div style={{ display: 'flex', alignItems: 'center', gap: '8px', paddingLeft: '82px' }}>
                                                <button onClick={handleCheckSsh} disabled={sshChecking} className="tbtn tbtn-ghost" style={{ fontSize: '12px' }}>
                                                    {sshChecking ? '检测中…' : '测试连接'}
                                                </button>
                                                {sshResult && (
                                                    <span style={{ fontSize: '11px', color: sshResult.ok ? '#34c759' : '#f43f5e' }}>
                                                        {sshResult.ok ? `✓ ${sshResult.latency_ms}ms` : `✗ ${sshResult.error}`}
                                                    </span>
                                                )}
                                            </div>
                                        </div>
                                    )}
                                    <div className="group-row" style={{ gap: '10px' }}>
                                        <span className="group-label">{t('office.label_grade')}</span>
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
                                        <span className="group-label">{t('office.label_receptionist')}</span>
                                        <input type="text" value={form.receptionist_image ?? ''} onChange={e => handleFormChange('receptionist_image', e.target.value)} className="field-input" style={{ flex: 1 }} placeholder={t('office.placeholder_receptionist')} disabled={!editing} />
                                    </div>
                                    <div className="group-row" style={{ gap: '10px', alignItems: 'flex-start' }}>
                                        <span className="group-label" style={{ paddingTop: '2px' }}>{t('office.label_notes')}</span>
                                        <textarea className="field-input" rows={2} style={{ flex: 1, padding: '5px 9px', lineHeight: 1.5, resize: 'none' }} value={form.description ?? ''} onChange={e => handleFormChange('description', e.target.value)} disabled={!editing} />
                                    </div>
                                </div>
                            </section>

                            {/* 物业信息 */}
                            <section>
                                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '0 0 5px' }}>
                                    <span className="section-label" style={{ padding: 0 }}>{t('office.section_property')}</span>
                                    <div style={{ display: 'flex', gap: '6px' }}>
                                        {selected.daemon_url && (
                                            <button
                                                onClick={() => checkDaemon(selected.daemon_url!, selected.daemon_api_key ?? '')}
                                                disabled={healthChecking || installStep === 'openclaw' || installStep === 'daemon'}
                                                style={{ padding: '2px 8px', borderRadius: '5px', fontSize: '11px', cursor: 'pointer', border: '1px solid rgba(255,255,255,0.12)', background: 'rgba(255,255,255,0.05)', color: 'rgba(235,235,245,0.6)', opacity: healthChecking ? 0.5 : 1 }}
                                            >
                                                {healthChecking ? t('common.checking') : t('common.button_refresh')}
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
                                            {installStep === 'openclaw' ? t('office.installing_openclaw')
                                                : installStep === 'daemon' ? t('office.installing_daemon')
                                                : (daemonHealth?.ok && daemonHealth.version && latestDaemonVersion && daemonHealth.version !== latestDaemonVersion)
                                                    ? t('office.update_property')
                                                    : t('office.install_latest')}
                                        </button>
                                    </div>
                                </div>
                                <div className="group">
                                    <div className="group-row">
                                        <span className="group-label">{t('office.install_status')}</span>
                                        {selected.daemon_url ? (
                                            <span className="group-value" style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                                                <span style={{ width: '7px', height: '7px', borderRadius: '50%', flexShrink: 0, background: daemonHealth?.ok ? '#34c759' : healthChecking ? '#ff9f0a' : daemonHealth ? '#8E8E93' : '#34c759' }} />
                                                <span style={{ fontSize: '13px', color: daemonHealth?.ok ? '#34c759' : healthChecking ? '#ff9f0a' : daemonHealth ? '#8E8E93' : '#34c759' }}>
                                                    {healthChecking ? t('common.checking') : daemonHealth?.ok ? t('office.installed_running') : daemonHealth ? t('office.installed_offline') : t('office.installed')}
                                                </span>
                                            </span>
                                        ) : (
                                            <span className="group-value" style={{ color: '#8E8E93' }}>{t('office.not_installed')}</span>
                                        )}
                                    </div>
                                    <div className="group-row">
                                        <span className="group-label">{t('office.daemon_version')}</span>
                                        <span className="group-value" style={{ color: '#EBEBF5', display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
                                            {daemonHealth?.version
                                                ? <span>物业 <span style={{ color: '#8b5cf6', fontFamily: 'monospace' }}>v{daemonHealth.version}</span></span>
                                                : <span style={{ color: '#8E8E93' }}>—</span>
                                            }
                                            {daemonHealth?.openclaw_version
                                                ? <span>OpenClaw <span style={{ color: '#34c759', fontFamily: 'monospace' }}>v{daemonHealth.openclaw_version}</span></span>
                                                : daemonHealth?.ok
                                                    ? <span style={{ color: '#8E8E93' }}>OpenClaw 版本未知</span>
                                                    : null
                                            }
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
                                                    {installStep === 'openclaw' ? t('office.installing_openclaw') : installStep === 'daemon' ? t('office.installing_daemon') : installStep === 'done' ? `✅ ${t('office.install_done')}` : `❌ ${t('office.install_failed')}`}
                                                </span>
                                                {(installStep === 'done' || installStep === 'error') && (
                                                    <button onClick={() => { setInstallLogs([]); setInstallStep('idle') }} style={{ fontSize: '10px', background: 'none', border: 'none', color: 'rgba(235,235,245,0.35)', cursor: 'pointer', padding: 0 }}>{t('common.collapse')}</button>
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
                                <div className="section-label" style={{ padding: '0 0 5px' }}>{t('office.section_current_deploy')}</div>
                                <div className="group">
                                    <div className="group-row">
                                        <span className="group-label">{t('office.deploy_company')}</span>
                                        {selected.current_opc_id ? (
                                            <span className="group-value flex-center gap-5">
                                                <span style={{ width: '7px', height: '7px', borderRadius: '50%', background: '#34c759', flexShrink: 0 }}></span>
                                                <a href="#/opc" style={{ color: '#a78bfa', fontSize: '13px', textDecoration: 'none' }}>
                                                    {selected.current_opc_name}
                                                </a>
                                            </span>
                                        ) : (
                                            <span className="group-value" style={{ color: '#8E8E93' }}>{t('office.not_deployed')}</span>
                                        )}
                                    </div>
                                </div>
                            </section>

                            {deployHistory.length > 0 && (
                                <section>
                                    <div className="section-label" style={{ padding: '0 0 5px' }}>{t('office.deploy_history')}</div>
                                    <div className="group">
                                        {deployHistory.map(d => (
                                            <div key={d.id} className="group-row" style={{ gap: '8px' }}>
                                                <span style={{
                                                    fontSize: '10px', padding: '1px 6px', borderRadius: '4px', flexShrink: 0,
                                                    background: d.is_active ? 'rgba(52,199,89,0.15)' : 'rgba(255,255,255,0.06)',
                                                    color: d.is_active ? '#34c759' : '#8E8E93',
                                                }}>
                                                    {d.is_active ? t('common.status_running') : t('office.status_revoked')}
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
            </main >

            {confirmDelete && (
                <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.6)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 200 }}>
                    <div style={{ background: '#1c1c1e', border: '1px solid rgba(255,255,255,0.12)', borderRadius: '14px', padding: '24px', width: '360px', display: 'flex', flexDirection: 'column', gap: '16px' }}>
                        <div style={{ fontSize: '15px', fontWeight: 600, color: '#FFFFFF' }}>删除办公室</div>
                        <div style={{ fontSize: '13px', color: 'rgba(255,255,255,0.6)', lineHeight: 1.5 }}>
                            确定要删除「<span style={{ color: '#FFFFFF' }}>{confirmDelete.name}</span>」吗？此操作不可撤销。
                        </div>
                        <div style={{ display: 'flex', gap: '8px', justifyContent: 'flex-end' }}>
                            <button className="tbtn tbtn-ghost" onClick={() => setConfirmDelete(null)}>取消</button>
                            <button className="tbtn" style={{ background: '#f43f5e', color: '#fff', border: 'none' }} onClick={() => handleDelete(confirmDelete)}>确认删除</button>
                        </div>
                    </div>
                </div>
            )}
        </>
    )
}
