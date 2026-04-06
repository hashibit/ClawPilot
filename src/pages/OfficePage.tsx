import { useEffect, useState, useCallback, useRef } from 'react'
import { useTranslation } from 'react-i18next'
import { getOffices, createOffice, updateOffice, deleteOffice, getOfficeDeployments, checkDaemonHealth, checkSshConnection, checkSshAuth, installDaemon, installOpenclaw, probeLocalDaemon, probeRemoteDaemon, getLocalDaemonVersion } from '../lib/api'
import type { DaemonHealthResult } from '../lib/api'
import { toast } from '../components/Toast'
import type { Office, OfficeGrade, OfficeDeployment, AccessAuthType } from '../lib/types'

function fmtDate(ts: number) {
    return new Date(ts * 1000).toLocaleString(undefined, { month: 'numeric', day: 'numeric', hour: '2-digit', minute: '2-digit' })
}

// 卡通前台头像预设（本地图片，打包进 Tauri app）
const RECEPTIONIST_PRESETS = [
    '/avatars/receptionist/half_size_beautiful-cartoon-woman-portrait.jpg',
    '/avatars/receptionist/half_size_beautiful-cartoon-woman-portrait-2.jpg',
    '/avatars/receptionist/half_size_3d-cartoon-style-character.jpg',
    '/avatars/receptionist/half_size_3d-cartoon-style-character-2.jpg',
    '/avatars/receptionist/half_size_3d-portrait-woman-1.jpg',
    '/avatars/receptionist/half_size_3d-portrait-woman-2.jpg',
    '/avatars/receptionist/half_size_portrait-3d-female-doctor.jpg',
    '/avatars/receptionist/half_size_portrait-3d-female-doctor-2.jpg',
    '/avatars/receptionist/half_size_rendering-portrait-anime-doctor.jpg',
    '/avatars/receptionist/half_size_bc110031-06a7-460a-bf9c-545e5e896824.jpg',
    '/avatars/receptionist/half_size_b2c71b70-a938-44e5-903b-f963d3bffe04.jpg',
]

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
    const [avatarPickerOpen, setAvatarPickerOpen] = useState(false)
    const [avatarHovered, setAvatarHovered] = useState(false)
    const [hoveredOfficeId, setHoveredOfficeId] = useState<string | null>(null)
    const avatarPickerRef = useRef<HTMLDivElement>(null)
    const [confirmDelete, setConfirmDelete] = useState<Office | null>(null)
    const [deployHistory, setDeployHistory] = useState<OfficeDeployment[]>([])
    const [daemonHealth, setDaemonHealth] = useState<DaemonHealthResult | null>(null)
    const [healthChecking, setHealthChecking] = useState(false)

    // Install logs with type information for styling
    type LogEntry = { message: string; type: string; timestamp: number; key?: string; params?: Record<string, unknown> }
    const [installLogs, setInstallLogs] = useState<LogEntry[]>([])
    const [installStep, setInstallStep] = useState<'idle' | 'checking' | 'openclaw' | 'daemon' | 'done' | 'error'>('idle')
    const [installModalOpen, setInstallModalOpen] = useState(false)
    const installAbortRef = useRef<boolean>(false)
    const healthCacheRef = useRef<Map<string, DaemonHealthResult>>(new Map())
    const [sshChecking, setSshChecking] = useState(false)
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
                    checkDaemon(first.daemon_url, first.daemon_api_key ?? '', { officeId: first.id, useCache: true })
                } else {
                    silentProbeDaemon(first)
                }
            } else if (selected) {
                // refresh selected with latest data (e.g. daemon_url updated after install)
                const updated = list.find(o => o.id === selected.id)
                if (updated) {
                    setSelected(updated)
                    setForm(updated)
                    // Re-check daemon health if daemon_url was just set
                    if (updated.daemon_url && !selected.daemon_url) {
                        checkDaemon(updated.daemon_url, updated.daemon_api_key ?? '', { officeId: updated.id })
                    }
                }
            }
        } catch (e) { toast(String(e), 'error') }
    }

    const checkDaemon = useCallback(async (daemonUrl: string, apiKey: string, opts?: { officeId?: string; useCache?: boolean }) => {
        const { officeId, useCache = false } = opts ?? {}
        const cacheKey = officeId ? `${officeId}:${daemonUrl}` : null

        if (useCache && cacheKey) {
            const cached = healthCacheRef.current.get(cacheKey)
            if (cached) {
                setDaemonHealth(cached)
                return
            }
        }
        if (!useCache && cacheKey) {
            healthCacheRef.current.delete(cacheKey)
        }

        setHealthChecking(true)
        setDaemonHealth(null)
        try {
            const result = await checkDaemonHealth(daemonUrl, apiKey)
            // Only update state if this office is still selected (avoid race condition)
            if (officeId && selected?.id !== officeId) return
            setDaemonHealth(result)
            if (cacheKey) healthCacheRef.current.set(cacheKey, result)
        } catch (e) {
            if (officeId && selected?.id !== officeId) return
            setDaemonHealth({ ok: false, error: String(e) })
        } finally {
            setHealthChecking(false)
        }
    }, [selected?.id])

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
            // Only update state if this office is still selected (avoid race condition)
            if (selected?.id !== office.id) return
            if (r.ok && r.daemon_url && r.api_key) {
                const updates = { daemon_url: r.daemon_url, daemon_api_key: r.api_key }
                setOffices(prev => prev.map(o => o.id === office.id ? { ...o, ...updates } : o))
                setSelected(prev => prev?.id === office.id ? { ...prev, ...updates } : prev)
                setForm(prev => ({ ...prev, ...updates }))
                checkDaemon(r.daemon_url, r.api_key, { officeId: office.id })
            }
        } catch { /* silent */ }
    }, [checkDaemon, selected?.id])

    const handleSelect = useCallback((office: Office) => {
        if (isNewOffice) setIsNewOffice(false)
        setSelected(office); setForm(office)
        setEditing(false); setAvatarPickerOpen(false)
        setDaemonHealth(null)
        setSshResult(null)
        getOfficeDeployments(office.id).then(setDeployHistory).catch(() => setDeployHistory([]))
        if (office.daemon_url) {
            checkDaemon(office.daemon_url, office.daemon_api_key ?? '', { officeId: office.id, useCache: true })
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

        // 验证门禁设置（仅远程模式）
        if (!isLocalhost && form.address) {
            if (!form.access_user || form.access_user.trim() === '') {
                toast('远程办公室必须填写用户名', 'error')
                return
            }
            const hasPassword = form.access_password && form.access_password.trim() !== ''
            const hasSshKey = form.ssh_key_path && form.ssh_key_path.trim() !== ''
            if (form.access_auth_type === 'password' && !hasPassword) {
                toast('密码认证模式下必须填写密码', 'error')
                return
            }
            if (form.access_auth_type === 'ssh_key' && !hasSshKey) {
                toast('SSH 私钥认证模式下必须填写私钥路径', 'error')
                return
            }
        }

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
                setEditing(false); setAvatarPickerOpen(false)
                toast('办公室已创建', 'success')
            } else {
                const addressChanged = form.address !== selected.address
                const daemonFields = addressChanged ? { daemon_url: undefined, daemon_api_key: undefined } : {}
                const updated: Office = { ...selected, ...form, ...daemonFields, updated_at: Math.floor(Date.now() / 1000) }
                await updateOffice(selected.id, updated)
                setOffices(prev => prev.map(o => o.id === updated.id ? updated : o))
                setSelected(updated)
                setEditing(false); setAvatarPickerOpen(false)
                setDaemonHealth(null)
                toast('办公室信息已保存', 'success')
                if (!addressChanged && updated.daemon_url) {
                    checkDaemon(updated.daemon_url, updated.daemon_api_key ?? '', { officeId: updated.id })
                }
            }
        } catch (e) { toast(String(e), 'error') }
        finally { setSaving(false) }
    }

    const handleCancel = () => {
        if (isNewOffice) {
            setIsNewOffice(false)
            setEditing(false); setAvatarPickerOpen(false)
            const prev = offices[0] ?? null
            setSelected(prev); setForm(prev ?? {})
            if (prev) getOfficeDeployments(prev.id).then(setDeployHistory).catch(() => setDeployHistory([]))
        } else {
            setEditing(false); setAvatarPickerOpen(false)
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
        // Use form data when editing, selected data when viewing
        const data = editing ? form : selected
        if (!data) return

        const addr = data.address?.trim()
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
        try {
            const r = await checkSshAuth({
                address: addr,
                auth_type: data.access_auth_type ?? 'password',
                user: data.access_user ?? 'root',
                password: data.access_password,
                key_path: data.ssh_key_path,
            })
            if (r.ok) {
                toast(`✓ SSH 连接成功（${r.latency_ms ?? '?'} ms）`, 'success')
            } else {
                toast(`✗ SSH 连接失败：${r.error ?? '未知错误'}`, 'error')
            }
        } catch (e: any) {
            toast(`✗ SSH 连接失败：${e?.message ?? '检测失败'}`, 'error')
        } finally {
            setSshChecking(false)
        }
    }

    const handleInstallLatest = () => {
        if (!selected) return
        if (isNewOffice) { toast('请先保存办公室后再安装物业', 'error'); return }
        if (installStep !== 'idle' && installStep !== 'done' && installStep !== 'error') return
        if (!isValidAddress(selected.address)) {
            toast('请先设置有效的办公室地址（本机或合法 IP/主机名）', 'error'); return
        }
        installAbortRef.current = false
        setInstallLogs([])
        setInstallStep('checking')
        setInstallModalOpen(true)
        runInstall(selected)
    }

    const runInstall = async (saved: Office) => {
        // Log helper - adds log entry with type info
        const lg = (message: string, type: string = 'info') => {
            setInstallLogs(prev => [...prev, { message, type, timestamp: Date.now() }])
        }
        const isRemote = !(!saved.address || saved.address === 'localhost')
        const { host: sshHost, port: sshPort } = isRemote ? parseAddress(saved.address!) : { host: '', port: 22 }
        const sshBase = isRemote ? {
            ssh_host: sshHost,
            ssh_port: sshPort,
            ssh_user: saved.access_user ?? 'root',
            ...(saved.access_auth_type === 'ssh_key'
                ? { ssh_key_path: saved.ssh_key_path }
                : { ssh_password: saved.access_password }),
        } : {}
        const mode = isRemote ? 'ssh' : 'local'

        // ── SSE connection for real-time install logs ───────────────────
        const SERVER_PORT = import.meta.env.VITE_SERVER_PORT ?? '16667'
        let sseConnection: EventSource | null = null
        const connectSSE = () => {
            lg(String(t('office.install.connecting_sse')), 'banner')
            sseConnection = new EventSource(`http://localhost:${SERVER_PORT}/api/install_logs/stream/${saved.id}`)
            sseConnection.onmessage = (event) => {
                try {
                    const data = JSON.parse(event.data)
                    // Support i18n key format: {key, params, type}
                    if (data.key) {
                        const translated = String(t(data.key, data.params || {}))
                        lg(translated, data.type || 'info')
                    } else if (data.message) {
                        // Plain message format
                        lg(data.message, data.type || 'info')
                    }
                } catch { /* ignore */ }
            }
            sseConnection.onerror = () => {
                lg('⚠️ 实时日志连接失败，将等待完成后显示日志', 'warning')
            }
        }
        const closeSSE = () => {
            if (sseConnection) {
                sseConnection.close()
                sseConnection = null
            }
        }

        // Step 0: SSH connectivity check (remote only)
        if (isRemote) {
            lg(`🔍 检查与 ${saved.address} 的 SSH 连通性…`, 'banner')
            try {
                const r = await checkSshConnection(sshHost, sshPort)
                if (!r.ok) {
                    lg(`❌ SSH 连通性检查失败：${r.error ?? '无法连通远程主机'}`, 'error')
                    setInstallStep('error')
                    return
                }
                lg(`✅ SSH 连通（延迟 ${r.latency_ms ?? '?'} ms）`, 'success')
            } catch (e) {
                lg(`❌ SSH 检测异常：${String(e)}`, 'error')
                setInstallStep('error')
                return
            }
            if (installAbortRef.current) { setInstallStep('idle'); return }
        }

        // Step 1: install openclaw
        setInstallStep('openclaw')
        connectSSE() // Connect to SSE for real-time logs
        try {
            lg(t('office.install_openclaw_start'))
            const r1 = await installOpenclaw({ office_id: saved.id, mode, ...sshBase })
            closeSSE()
            // SSE already pushed logs in real-time, don't add duplicates
            if (!r1.ok) { lg(`❌ ${r1.error ?? t('office.install_failed')}`); setInstallStep('error'); return }
            lg(t('office.install_openclaw_done'))
        } catch (e) { lg(`❌ ${String(e)}`); setInstallStep('error'); closeSSE(); return }
        if (installAbortRef.current) { setInstallStep('idle'); closeSSE(); return }

        // Step 2: install daemon
        setInstallStep('daemon')
        try {
            lg(t('office.install_daemon_start'))
            const r2 = await installDaemon({ office_id: saved.id, mode, ...sshBase })
            // SSE already pushed logs in real-time, don't add duplicates
            if (!r2.ok) { lg(`❌ ${r2.error ?? t('office.install_failed')}`); setInstallStep('error'); closeSSE(); return }
            lg(t('office.install_daemon_done'))
            if (r2.daemon_url && r2.api_key) {
                // Clear health cache to force fresh check
                healthCacheRef.current.delete(`${saved.id}:${r2.daemon_url}`)
                // Immediately update selected and form to reflect new daemon info
                const updatedOffice = { ...saved, daemon_url: r2.daemon_url, daemon_api_key: r2.api_key }
                setSelected(updatedOffice)
                setForm(updatedOffice)
                // Also update offices list entry
                setOffices(prev => prev.map(o => o.id === saved.id ? updatedOffice : o))
                loadOffices()
                checkDaemon(r2.daemon_url, r2.api_key, { officeId: saved.id })
            }
            setInstallStep('done')
        } catch (e) { lg(`❌ ${String(e)}`); setInstallStep('error'); }
        closeSSE()
    }

    const handleInstallStop = () => {
        installAbortRef.current = true
        setInstallStep('idle')
        setInstallModalOpen(false)
    }

    const handleInstallClose = () => {
        setInstallModalOpen(false)
        if (installStep !== 'done' && installStep !== 'error') return
        setInstallStep('idle')
        setInstallLogs([])
    }

    return (
        <>
            {/* COL2 - office list */}
            <div className="list-pane">
                <div data-tauri-drag-region className="toolbar" style={{ justifyContent: 'space-between' }}>
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
                            <div
                                style={{ position: 'relative', flexShrink: 0 }}
                                onMouseEnter={() => office.receptionist_image && setHoveredOfficeId(office.id)}
                                onMouseLeave={() => setHoveredOfficeId(null)}
                            >
                                <div style={{
                                    width: '30px', height: '30px', borderRadius: '8px',
                                    background: '#8b5cf6',
                                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                                    fontSize: '16px', overflow: 'hidden',
                                }}>
                                    {office.receptionist_image
                                        ? <img src={office.receptionist_image} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block' }} />
                                        : '💁‍♀️'}
                                </div>
                                {hoveredOfficeId === office.id && (
                                    <div style={{
                                        position: 'absolute', top: '0', left: '38px', zIndex: 300,
                                        borderRadius: '10px', overflow: 'hidden',
                                        boxShadow: '0 12px 40px rgba(0,0,0,0.6)',
                                        border: '1px solid rgba(255,255,255,0.12)',
                                        pointerEvents: 'none',
                                    }}>
                                        <img src={office.receptionist_image!} alt="" style={{ width: '160px', height: '160px', objectFit: 'cover', display: 'block' }} />
                                    </div>
                                )}
                            </div>
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
                                {/* 测试连接按钮 - 只读和编辑模式都可用，仅远程办公室显示 */}
                                {selected && selected.address && selected.address !== 'localhost' && (
                                    <button
                                        className="tbtn tbtn-ghost"
                                        onClick={handleCheckSsh}
                                        disabled={sshChecking}
                                        style={{ fontSize: '12px' }}
                                    >
                                        {sshChecking ? '测试中…' : '测试连接'}
                                    </button>
                                )}
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
                                        <span className="group-label" style={{ minWidth: '40px' }}>{t('office.label_name')}</span>
                                        <input type="text" value={form.name ?? ''} onChange={e => handleFormChange('name', e.target.value)} className="field-input" style={{ flex: 1 }} disabled={!editing} />
                                    </div>
                                    <div className="group-row" style={{ gap: '10px' }}>
                                        <span className="group-label" style={{ minWidth: '40px' }}>{t('office.label_receptionist')}</span>
                                        <div style={{ position: 'relative' }} ref={avatarPickerRef}>
                                            <div
                                                onClick={() => editing && setAvatarPickerOpen(v => !v)}
                                                onMouseEnter={() => form.receptionist_image && setAvatarHovered(true)}
                                                onMouseLeave={() => setAvatarHovered(false)}
                                                style={{
                                                    background: 'none', border: 'none',
                                                    display: 'flex', alignItems: 'center',
                                                    cursor: editing ? 'pointer' : 'default',
                                                }}
                                            >
                                                {form.receptionist_image ? (
                                                    <img src={form.receptionist_image} alt="" style={{ width: '36px', height: '36px', borderRadius: '7px', objectFit: 'cover', display: 'block' }} />
                                                ) : (
                                                    <span style={{ fontSize: '28px' }}>💁‍♀️</span>
                                                )}
                                            </div>
                                            {avatarHovered && form.receptionist_image && (
                                                <div style={{
                                                    position: 'absolute', top: '0', left: '44px', zIndex: 300,
                                                    borderRadius: '10px', overflow: 'hidden',
                                                    boxShadow: '0 12px 40px rgba(0,0,0,0.6)',
                                                    border: '1px solid rgba(255,255,255,0.12)',
                                                    pointerEvents: 'none',
                                                }}>
                                                    <img src={form.receptionist_image} alt="" style={{ width: '160px', height: '160px', objectFit: 'cover', display: 'block' }} />
                                                </div>
                                            )}
                                            {avatarPickerOpen && (
                                                <>
                                                    <div style={{ position: 'fixed', inset: 0, zIndex: 199 }} onClick={() => setAvatarPickerOpen(false)} />
                                                    <div style={{
                                                        position: 'absolute', top: '34px', left: 0, zIndex: 200,
                                                        background: '#2c2c2e', border: '1px solid rgba(255,255,255,0.12)',
                                                        borderRadius: '12px', padding: '10px',
                                                        boxShadow: '0 8px 32px rgba(0,0,0,0.5)',
                                                        display: 'grid', gridTemplateColumns: 'repeat(4, 52px)', gap: '6px',
                                                    }}>
                                                        {RECEPTIONIST_PRESETS.map(url => (
                                                            <button
                                                                key={url}
                                                                onClick={() => { handleFormChange('receptionist_image', url); setAvatarPickerOpen(false) }}
                                                                style={{
                                                                    width: '52px', height: '52px', padding: 0,
                                                                    border: form.receptionist_image === url ? '2px solid #a78bfa' : '2px solid transparent',
                                                                    borderRadius: '9px', overflow: 'hidden', cursor: 'pointer',
                                                                    background: 'rgba(255,255,255,0.05)', outline: 'none',
                                                                }}
                                                            >
                                                                <img src={url} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block' }} />
                                                            </button>
                                                        ))}
                                                    </div>
                                                </>
                                            )}
                                        </div>
                                    </div>
                                    <div className="group-row" style={{ gap: '10px' }}>
                                        <span className="group-label" style={{ minWidth: '40px' }}>{t('office.label_address')}</span>
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
                                        <>
                                            {/* 用户名 */}
                                            <div className="group-row" style={{ gap: '10px' }}>
                                                <span className="group-label" style={{ minWidth: '40px' }}>用户名</span>
                                                <input type="text" value={form.access_user ?? ''} onChange={e => handleFormChange('access_user', e.target.value)} className="field-input" style={{ flex: 1 }} placeholder="root" disabled={!editing} />
                                            </div>
                                            {/* 认证方式 + 凭证 */}
                                            <div className="group-row" style={{ gap: '10px', alignItems: 'center' }}>
                                                <span className="group-label" style={{ minWidth: '40px' }}>认证</span>
                                                <div style={{ display: 'flex', gap: '6px', flex: 1, alignItems: 'center' }}>
                                                    {(['password', 'ssh_key'] as AccessAuthType[]).map(authType => {
                                                        const active = (form.access_auth_type ?? 'password') === authType
                                                        return (
                                                            <button key={authType} onClick={() => { if (editing) handleFormChange('access_auth_type', authType) }} style={{
                                                                height: '28px', lineHeight: '28px', padding: '0 12px', borderRadius: '6px', fontSize: '12px', cursor: editing ? 'pointer' : 'default',
                                                                border: active ? '1px solid rgba(139,92,246,0.6)' : '1px solid rgba(255,255,255,0.1)',
                                                                background: active ? 'rgba(139,92,246,0.2)' : 'rgba(255,255,255,0.04)',
                                                                color: active ? '#a78bfa' : 'rgba(235,235,245,0.5)',
                                                                fontWeight: active ? 500 : 400,
                                                            }}>
                                                                {authType === 'password' ? '密码' : 'SSH 私钥'}
                                                            </button>
                                                        )
                                                    })}
                                                    {(form.access_auth_type ?? 'password') === 'password' ? (
                                                        <input type="password" value={form.access_password ?? ''} onChange={e => handleFormChange('access_password', e.target.value)} className="field-input" style={{ flex: 1 }} placeholder="登录密码" disabled={!editing} />
                                                    ) : (
                                                        <input type="text" value={form.ssh_key_path ?? ''} onChange={e => handleFormChange('ssh_key_path', e.target.value)} className="field-input" style={{ flex: 1 }} placeholder="~/.ssh/id_ed25519" disabled={!editing} />
                                                    )}
                                                </div>
                                            </div>
                                        </>
                                    )}
                                    <div className="group-row" style={{ gap: '10px' }}>
                                        <span className="group-label" style={{ minWidth: '40px' }}>{t('office.label_grade')}</span>
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
                                                onClick={() => checkDaemon(selected.daemon_url!, selected.daemon_api_key ?? '', { officeId: selected.id })}
                                                disabled={healthChecking || installStep === 'openclaw' || installStep === 'daemon'}
                                                style={{ padding: '2px 8px', borderRadius: '5px', fontSize: '11px', cursor: 'pointer', border: '1px solid rgba(255,255,255,0.12)', background: 'rgba(255,255,255,0.05)', color: 'rgba(235,235,245,0.6)', opacity: healthChecking ? 0.5 : 1 }}
                                            >
                                                {healthChecking ? t('common.checking') : t('common.button_refresh')}
                                            </button>
                                        )}
                                        <button
                                            onClick={handleInstallLatest}
                                            style={{
                                                padding: '2px 8px', borderRadius: '5px', fontSize: '11px', cursor: 'pointer',
                                                border: '1px solid rgba(139,92,246,0.4)', background: 'rgba(139,92,246,0.12)', color: '#c4b5fd',
                                            }}
                                        >
                                            {(daemonHealth?.ok && daemonHealth.version && latestDaemonVersion && daemonHealth.version !== latestDaemonVersion)
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
                                    {daemonHealth && !daemonHealth.ok && daemonHealth.error && !daemonHealth.not_installed && (
                                        <div style={{ padding: '5px 10px', fontSize: '11px', color: '#f87171', background: 'rgba(244,63,94,0.06)', borderTop: '1px solid rgba(244,63,94,0.1)' }}>
                                            {daemonHealth.error}
                                        </div>
                                    )}
                                    {daemonHealth?.not_installed && (
                                        <div style={{ padding: '5px 10px', fontSize: '11px', color: '#fbbf24', background: 'rgba(251,191,36,0.06)', borderTop: '1px solid rgba(251,191,36,0.1)' }}>
                                            Daemon 未安装，点击「安装物业」开始安装
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

            {/* 安装物业弹窗 */}
            {installModalOpen && (
                <div style={{
                    position: 'fixed', inset: 0, zIndex: 1000,
                    background: 'rgba(0,0,0,0.6)', backdropFilter: 'blur(4px)',
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                }}>
                    <div style={{
                        width: '520px', maxWidth: '90vw',
                        background: '#1c1c1e', borderRadius: '14px',
                        border: '1px solid rgba(255,255,255,0.1)',
                        boxShadow: '0 24px 60px rgba(0,0,0,0.6)',
                        display: 'flex', flexDirection: 'column', overflow: 'hidden',
                    }}>
                        {/* Header */}
                        <div style={{ padding: '16px 20px 12px', borderBottom: '1px solid rgba(255,255,255,0.07)', display: 'flex', alignItems: 'center', gap: '10px' }}>
                            <span style={{ fontSize: '15px', fontWeight: 600, color: '#fff', flex: 1 }}>
                                {installStep === 'done' ? '✅ 安装完成' : installStep === 'error' ? '❌ 安装失败' : '安装物业'}
                            </span>
                            <span style={{
                                fontSize: '11px', padding: '2px 8px', borderRadius: '4px',
                                background: installStep === 'done' ? 'rgba(52,199,89,0.15)' : installStep === 'error' ? 'rgba(248,113,113,0.15)' : 'rgba(139,92,246,0.15)',
                                color: installStep === 'done' ? '#34d399' : installStep === 'error' ? '#f87171' : '#a78bfa',
                            }}>
                                {installStep === 'checking' ? '检查连通性…'
                                    : installStep === 'openclaw' ? '安装 OpenClaw…'
                                    : installStep === 'daemon' ? '安装 Daemon…'
                                    : installStep === 'done' ? '完成'
                                    : installStep === 'error' ? '出错'
                                    : '就绪'}
                            </span>
                        </div>

                        {/* Steps indicator */}
                        <div style={{ padding: '12px 20px 8px', display: 'flex', gap: '6px', alignItems: 'center' }}>
                            {[
                                { key: 'checking', label: 'SSH 检查' },
                                { key: 'openclaw', label: 'OpenClaw' },
                                { key: 'daemon', label: 'Daemon' },
                            ].map((step, i) => {
                                const stepOrder = ['checking', 'openclaw', 'daemon']
                                const currentIdx = installStep === 'done' ? 3 : installStep === 'error' ? -1 : stepOrder.indexOf(installStep)
                                const isDone = currentIdx > i || installStep === 'done'
                                const isActive = stepOrder[i] === installStep
                                const isError = installStep === 'error' && isActive
                                const isPending = currentIdx !== -1 && currentIdx < i && installStep !== 'done'
                                return (
                                    <div key={step.key} style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                                        {i > 0 && <div style={{ width: '20px', height: '1px', background: isDone ? '#34d399' : 'rgba(255,255,255,0.12)' }} />}
                                        <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                                            <div style={{
                                                width: '7px', height: '7px', borderRadius: '50%',
                                                background: isDone ? '#34d399' : isError ? '#f87171' : isActive ? '#a78bfa' : 'rgba(255,255,255,0.15)',
                                                boxShadow: isActive && !isDone ? '0 0 6px #a78bfa' : 'none',
                                            }} />
                                            <span style={{ fontSize: '11px', color: isPending ? 'rgba(235,235,245,0.3)' : '#EBEBF5' }}>{step.label}</span>
                                        </div>
                                    </div>
                                )
                            })}
                        </div>

                        {/* Log area */}
                        <div style={{
                            margin: '0 16px 12px',
                            background: 'rgba(0,0,0,0.35)', borderRadius: '8px',
                            padding: '10px 12px',
                            fontFamily: 'monospace', fontSize: '11px', lineHeight: 1.8,
                            height: '260px', overflowY: 'auto',
                            border: '1px solid rgba(255,255,255,0.06)',
                        }}>
                            {installLogs.length === 0 ? (
                                <span style={{ color: 'rgba(235,235,245,0.25)' }}>等待开始…</span>
                            ) : installLogs.map((entry, i) => {
                                // Style based on log type
                                const getLogStyle = (type: string): React.CSSProperties => {
                                    const base: React.CSSProperties = {}
                                    switch (type) {
                                        case 'step':
                                            return { color: '#60a5fa', fontWeight: 600 }  // Blue, bold
                                        case 'success':
                                            return { color: '#34d399' }  // Green
                                        case 'detail':
                                            return { color: '#9ca3af', paddingLeft: '12px' }  // Gray, indented
                                        case 'progress':
                                            return { color: '#a78bfa', fontWeight: 500 }  // Purple
                                        case 'error':
                                            return { color: '#f87171', fontWeight: 500 }  // Red
                                        case 'warning':
                                            return { color: '#fbbf24' }  // Yellow
                                        case 'banner':
                                            return { color: '#c4b5fd', fontWeight: 600, marginTop: '4px' }  // Light purple, bold
                                        case 'keyvalue':
                                            return { color: '#d1d5db' }  // Light gray
                                        case 'empty':
                                            return { display: 'none' }
                                        default:
                                            return { color: '#EBEBF5' }  // Default white
                                    }
                                }
                                return (
                                    <div key={i} style={getLogStyle(entry.type)}>
                                        {entry.message}
                                    </div>
                                )
                            })}
                        </div>

                        {/* Footer buttons */}
                        <div style={{ padding: '0 16px 16px', display: 'flex', justifyContent: 'flex-end', gap: '8px' }}>
                            {(installStep === 'done' || installStep === 'error') ? (
                                <button
                                    onClick={handleInstallClose}
                                    style={{ padding: '6px 16px', borderRadius: '7px', fontSize: '13px', cursor: 'pointer', border: '1px solid rgba(255,255,255,0.15)', background: 'rgba(255,255,255,0.07)', color: '#EBEBF5' }}
                                >
                                    关闭
                                </button>
                            ) : (
                                <button
                                    onClick={handleInstallStop}
                                    style={{ padding: '6px 16px', borderRadius: '7px', fontSize: '13px', cursor: 'pointer', border: '1px solid rgba(248,113,113,0.3)', background: 'rgba(248,113,113,0.08)', color: '#f87171' }}
                                >
                                    停止安装
                                </button>
                            )}
                        </div>
                    </div>
                </div>
            )}
        </>
    )
}
