import { useEffect, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { getAllOpcs, getOffices, startDeployment, getDeploymentStatus, cancelDeployment, undeploy, getRecentDeployments } from '../lib/api'
import { useApi } from '../hooks/useApi'
import { toast } from '../components/Toast'
import type { OpcConfig, Office, DeploymentTask } from '../lib/types'

const DEPLOY_STEPS = ['prepare_config', 'write_dir', 'reload_process', 'health_check']

function formatRelativeTime(ts: number, t: (key: string, opts?: any) => string): string {
  const diff = Math.floor(Date.now() / 1000) - ts
  const minutes = Math.floor(diff / 60)
  const hours = Math.floor(diff / 3600)
  const days = Math.floor(diff / 86400)
  if (days > 0) return t('common.time_days_ago', { count: days })
  if (hours > 0) return t('common.time_hours_ago', { count: hours })
  if (minutes > 0) return t('common.time_minutes_ago', { count: minutes })
  return t('common.time_just_now')
}

export default function DeployPage() {
  const { t } = useTranslation()
  const [opcs, setOpcs] = useState<OpcConfig[]>([])
  const [offices, setOffices] = useState<Office[]>([])
  const [selectedOpcId, setSelectedOpcId] = useState('')
  const [selectedOfficeId, setSelectedOfficeId] = useState('')
  const [deploying, setDeploying] = useState(false)
  const [currentTask, setCurrentTask] = useState<DeploymentTask | null>(null)
  const [recentDeployments, setRecentDeployments] = useState<DeploymentTask[]>([])
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null)

  const stopPolling = () => {
    if (pollRef.current) { clearInterval(pollRef.current); pollRef.current = null }
  }

  const { reload: reloadData } = useApi(
    () => Promise.all([getAllOpcs(), getOffices()]),
    [],
    {
      onSuccess: ([allOpcs, allOffices]) => { setOpcs(allOpcs); setOffices(allOffices) },
      onError: (e) => toast(e.message, 'error'),
    }
  )

  useEffect(() => () => stopPolling(), [])

  const loadHistory = async (opcId: string) => {
    try {
      const deployments = await getRecentDeployments(opcId, 5)
      setRecentDeployments(deployments)
    } catch (_) {}
  }

  const handleOpcChange = (opcId: string) => {
    setSelectedOpcId(opcId)
    setSelectedOfficeId('')
    if (opcId) loadHistory(opcId)
    else setRecentDeployments([])
  }

  // Free offices: not currently occupied (no current_opc_id)
  const freeOffices = offices.filter(o => !o.current_opc_id)
  const selectedOffice = freeOffices.find(o => o.id === selectedOfficeId)
  // Running OPCs
  const runningOpcs = opcs.filter(o => o.is_running && o.office_id)

  const pollStatus = async (taskId: string, opcId: string) => {
    try {
      const task = await getDeploymentStatus(taskId)
      setCurrentTask(task)
      if (task.status === 'SUCCESS' || task.status === 'FAILED') {
        stopPolling()
        setDeploying(false)
        toast(
          task.status === 'SUCCESS' ? t('deploy.deploy_success') : t('deploy.deploy_failed', { msg: task.message ?? t('common.unknown_error') }),
          task.status === 'SUCCESS' ? 'success' : 'error',
        )
        await reloadData()
        await loadHistory(opcId)
      }
    } catch (e) {
      stopPolling(); setDeploying(false); toast(String(e), 'error')
    }
  }

  const handleDeploy = async () => {
    if (!selectedOpcId || !selectedOfficeId || deploying) return
    setDeploying(true)
    setCurrentTask(null)
    try {
      const taskId = await startDeployment(selectedOpcId, selectedOfficeId)
      const task = await getDeploymentStatus(taskId)
      setCurrentTask(task)
      pollRef.current = setInterval(() => pollStatus(taskId, selectedOpcId), 2000)
    } catch (e) {
      setDeploying(false)
      toast(String(e), 'error')
    }
  }

  const handleCancel = async () => {
    if (!currentTask) return
    try {
      await cancelDeployment(currentTask.id)
      stopPolling(); setDeploying(false)
      toast(t('deploy.deploy_cancelled'), 'info')
    } catch (e) { toast(String(e), 'error') }
  }

  const handleUndeploy = async (opc: OpcConfig) => {
    try {
      await undeploy(opc.id)
      toast(t('deploy.undeploy_success', { name: opc.display_name }), 'success')
      await reloadData()
    } catch (e) { toast(String(e), 'error') }
  }

  const taskSteps: string[] = (() => {
    if (!currentTask) return []
    try { return JSON.parse(currentTask.steps) } catch { return [] }
  })()

  const stepStatus = (stepIndex: number): 'done' | 'running' | 'pending' | 'failed' => {
    if (!currentTask) return 'pending'
    if (currentTask.status === 'FAILED') {
      if (stepIndex < currentTask.current_step) return 'done'
      if (stepIndex === currentTask.current_step) return 'failed'
      return 'pending'
    }
    if (stepIndex < currentTask.current_step) return 'done'
    if (stepIndex === currentTask.current_step && currentTask.status === 'RUNNING') return 'running'
    if (currentTask.status === 'SUCCESS') return 'done'
    return 'pending'
  }

  const progressPct = currentTask
    ? currentTask.status === 'SUCCESS' ? 100
      : Math.round((currentTask.current_step / DEPLOY_STEPS.length) * 100)
    : 0

  const canDeploy = selectedOpcId && selectedOfficeId && selectedOffice?.daemon_url && !deploying

  return (
    <main style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
      <div className="toolbar" style={{ justifyContent: 'space-between' }}>
        <span style={{ fontSize: '15px', fontWeight: 600 }}>{t('deploy.section_title')}</span>
        <div style={{ display: 'flex', gap: '6px', alignItems: 'center' }}>
          {deploying ? (
            <button className="tbtn tbtn-ghost" style={{ color: '#f43f5e' }} onClick={handleCancel}>{t('deploy.cancel_deploy')}</button>
          ) : (
            <button className="tbtn tbtn-success" onClick={handleDeploy} disabled={!canDeploy}>
              {t('deploy.deploy_now')}
            </button>
          )}
        </div>
      </div>

      <div style={{ flex: 1, overflowY: 'auto', padding: '14px 16px', display: 'flex', flexDirection: 'column', gap: '14px' }}>

        {/* 部署配置 */}
        <section>
          <div className="section-label" style={{ padding: '0 0 7px' }}>{t('deploy.deploy_config')}</div>
          <div className="group">
            <div className="group-row" style={{ gap: '10px' }}>
              <span className="group-label">{t('deploy.select_opc')}</span>
              <select
                value={selectedOpcId}
                onChange={e => handleOpcChange(e.target.value)}
                className="field-input"
                style={{ flex: 1 }}
              >
                <option value="">{t('deploy.placeholder_select_opc')}</option>
                {opcs.map(opc => (
                  <option key={opc.id} value={opc.id}>
                    {opc.display_name}
                    {opc.is_running && opc.office_name ? ` (${t('common.status_running')}·${opc.office_name})` : ''}
                  </option>
                ))}
              </select>
            </div>
            <div className="group-row" style={{ gap: '10px' }}>
              <span className="group-label">{t('deploy.select_office')}</span>
              <select
                value={selectedOfficeId}
                onChange={e => setSelectedOfficeId(e.target.value)}
                className="field-input"
                style={{ flex: 1 }}
                disabled={!selectedOpcId}
              >
                <option value="">{t('deploy.placeholder_select_office')}</option>
                {freeOffices.map(office => (
                  <option key={office.id} value={office.id} disabled={!office.daemon_url}>
                    {office.daemon_url ? '✅ ' : '⚠️ '}{office.name}{!office.daemon_url ? ` · ${t('deploy.no_daemon')}` : ''}
                  </option>
                ))}
              </select>
            </div>
            {selectedOfficeId && !selectedOffice?.daemon_url && (
              <div style={{ padding: '8px 12px', fontSize: '12px', color: '#f59e0b' }}>
                {t('deploy.office_no_daemon')}
              </div>
            )}
            {freeOffices.length === 0 && (
              <div style={{ padding: '8px 12px', fontSize: '12px', color: '#f59e0b' }}>
                {t('deploy.no_free_offices')}
              </div>
            )}
          </div>
        </section>

        {/* 部署进度 */}
        {currentTask && (
          <section>
            <div className="section-label" style={{ padding: '0 0 7px' }}>{t('deploy.deploy_progress')}</div>
            <div style={{ height: '3px', background: 'rgba(255,255,255,0.08)', borderRadius: '2px', marginBottom: '10px', overflow: 'hidden' }}>
              <div style={{ height: '100%', width: `${progressPct}%`, background: 'linear-gradient(90deg,#8b5cf6,#06b6d4)', borderRadius: '2px', transition: 'width 0.4s ease' }}></div>
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4,1fr)', gap: '8px' }}>
              {DEPLOY_STEPS.map((label, i) => {
                const status = stepStatus(i)
                const stepLabel = taskSteps[i] ?? label
                const stepLabelI18n = t(`deploy.step_${DEPLOY_STEPS[i]}`)
                const colorMap = {
                  done: { bg: 'rgba(52,199,89,0.15)', stroke: '#34c759', text: '#34c759', sub: t('common.status_done') },
                  running: { bg: 'rgba(139,92,246,0.15)', stroke: '#a78bfa', text: '#a78bfa', sub: t('common.status_running_ellipsis') },
                  pending: { bg: 'rgba(255,255,255,0.06)', stroke: '#8E8E93', text: '#8E8E93', sub: t('common.status_waiting') },
                  failed: { bg: 'rgba(244,63,94,0.15)', stroke: '#f43f5e', text: '#f43f5e', sub: t('common.status_failed') },
                }[status]
                return (
                  <div key={label} className={`step-card${status === 'done' ? ' done' : ''}`}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '7px', marginBottom: '5px' }}>
                      <div style={{ width: '24px', height: '24px', borderRadius: '6px', background: colorMap.bg, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                        {status === 'running' ? (
                          <svg fill="none" stroke={colorMap.stroke} strokeWidth="2.5" viewBox="0 0 24 24" width="12" height="12" style={{ animation: 'spin 1s linear infinite' }}>
                            <path strokeLinecap="round" strokeLinejoin="round" d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15"/>
                          </svg>
                        ) : status === 'failed' ? (
                          <svg fill="none" stroke={colorMap.stroke} strokeWidth="2.5" viewBox="0 0 24 24" width="12" height="12"><path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12"/></svg>
                        ) : status === 'done' ? (
                          <svg fill="none" stroke={colorMap.stroke} strokeWidth="2.5" viewBox="0 0 24 24" width="12" height="12"><path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7"/></svg>
                        ) : (
                          <svg fill="none" stroke={colorMap.stroke} strokeWidth="2.5" viewBox="0 0 24 24" width="12" height="12"><circle cx="12" cy="12" r="4"/></svg>
                        )}
                      </div>
                      <div>
                        <div style={{ fontSize: '11px', fontWeight: 500, color: colorMap.text }}>{stepLabelI18n}</div>
                        <div style={{ fontSize: '10px', color: '#8E8E93' }}>{colorMap.sub}</div>
                      </div>
                    </div>
                    <div style={{ fontSize: '11px', color: '#8E8E93' }}>{stepLabel}</div>
                  </div>
                )
              })}
            </div>
          </section>
        )}

        {/* 运行中的子公司 */}
        {runningOpcs.length > 0 && (
          <section>
            <div className="section-label" style={{ padding: '0 0 7px' }}>{t('common.status_running')}</div>
            <div className="group">
              {runningOpcs.map(opc => (
                <div key={opc.id} className="group-row" style={{ gap: '8px' }}>
                  <div style={{ width: '8px', height: '8px', borderRadius: '50%', background: '#34c759', flexShrink: 0, alignSelf: 'center' }}></div>
                  <div style={{ flex: 1 }}>
                    <div style={{ fontSize: '13px', fontWeight: 500, color: '#EBEBF5' }}>{opc.display_name}</div>
                    <div style={{ fontSize: '11px', color: '#8E8E93' }}>
                      🏢 {opc.office_name ?? t('deploy.unknown_office')}
                    </div>
                  </div>
                  <button
                    className="tbtn tbtn-ghost"
                    style={{ fontSize: '11px', color: '#f43f5e' }}
                    onClick={() => handleUndeploy(opc)}
                  >
                    {t('deploy.undeploy')}
                  </button>
                </div>
              ))}
            </div>
          </section>
        )}

        {/* 最近部署记录 */}
        {recentDeployments.length > 0 && (
          <section>
            <div className="section-label" style={{ padding: '0 0 7px' }}>{t('deploy.recent_deployments')}</div>
            <div className="group">
              {recentDeployments.map(task => {
                const statusColorMap: Record<string, { bg: string; color: string; label: string }> = {
                  SUCCESS:  { bg: 'rgba(52,199,89,0.15)',   color: '#34c759', label: t('common.status_success') },
                  FAILED:   { bg: 'rgba(244,63,94,0.15)',   color: '#f43f5e', label: t('common.status_failed') },
                  ROLLBACK: { bg: 'rgba(245,158,11,0.15)',  color: '#f59e0b', label: t('deploy.status_rollback') },
                  RUNNING:  { bg: 'rgba(139,92,246,0.15)',  color: '#a78bfa', label: t('common.status_running') },
                  PENDING:  { bg: 'rgba(255,255,255,0.06)', color: '#8E8E93', label: t('common.status_waiting') },
                }
                const sc = statusColorMap[task.status] ?? statusColorMap.PENDING
                return (
                  <div key={task.id} className="group-row" style={{ gap: '8px' }}>
                    <span style={{ fontSize: '10px', padding: '1px 6px', borderRadius: '4px', background: sc.bg, color: sc.color, flexShrink: 0 }}>{sc.label}</span>
                    <div style={{ flex: 1 }}>
                      <div style={{ fontSize: '12px', color: '#EBEBF5' }}>{task.opc_name}</div>
                      {task.office_name && (
                        <div style={{ fontSize: '11px', color: '#8E8E93' }}>🏢 {task.office_name}</div>
                      )}
                    </div>
                    <span style={{ fontSize: '11px', color: '#8E8E93', flexShrink: 0 }}>
                      {formatRelativeTime(task.completed_at ?? task.created_at, t)}
                    </span>
                  </div>
                )
              })}
            </div>
          </section>
        )}

      </div>
    </main>
  )
}
