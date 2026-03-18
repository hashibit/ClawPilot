import { useEffect, useRef, useState } from 'react'
import { getAllOpcs, getOffices, startDeployment, getDeploymentStatus, cancelDeployment, undeploy, getRecentDeployments } from '../lib/api'
import { toast } from '../components/Toast'
import type { OpcConfig, Office, DeploymentTask } from '../lib/types'

const DEPLOY_STEPS = ['准备配置文件', '写入目标目录', '重载进程', '健康检查']

function formatRelativeTime(ts: number): string {
  const diff = Math.floor(Date.now() / 1000) - ts
  const minutes = Math.floor(diff / 60)
  const hours = Math.floor(diff / 3600)
  const days = Math.floor(diff / 86400)
  if (days > 0) return `${days}天前`
  if (hours > 0) return `${hours}小时前`
  if (minutes > 0) return `${minutes}分钟前`
  return '刚刚'
}

export default function DeployPage() {
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

  useEffect(() => {
    loadData()
    return () => stopPolling()
  }, [])

  const loadData = async () => {
    try {
      const [allOpcs, allOffices] = await Promise.all([getAllOpcs(), getOffices()])
      setOpcs(allOpcs)
      setOffices(allOffices)
    } catch (e) { toast(String(e), 'error') }
  }

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
          task.status === 'SUCCESS' ? '部署成功！' : `部署失败: ${task.message ?? '未知错误'}`,
          task.status === 'SUCCESS' ? 'success' : 'error',
        )
        await loadData()
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
      toast('部署已取消', 'info')
    } catch (e) { toast(String(e), 'error') }
  }

  const handleUndeploy = async (opc: OpcConfig) => {
    try {
      await undeploy(opc.id)
      toast(`${opc.display_name} 已撤销部署`, 'success')
      await loadData()
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

  const canDeploy = selectedOpcId && selectedOfficeId && !deploying

  return (
    <main style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
      <div className="toolbar" style={{ justifyContent: 'space-between' }}>
        <span style={{ fontSize: '15px', fontWeight: 600 }}>一键部署</span>
        <div style={{ display: 'flex', gap: '6px', alignItems: 'center' }}>
          {deploying ? (
            <button className="tbtn tbtn-ghost" style={{ color: '#f43f5e' }} onClick={handleCancel}>取消部署</button>
          ) : (
            <button className="tbtn tbtn-success" onClick={handleDeploy} disabled={!canDeploy}>
              立即部署
            </button>
          )}
        </div>
      </div>

      <div style={{ flex: 1, overflowY: 'auto', padding: '14px 16px', display: 'flex', flexDirection: 'column', gap: '14px' }}>

        {/* 部署配置 */}
        <section>
          <div className="section-label" style={{ padding: '0 0 7px' }}>部署配置</div>
          <div className="group">
            <div className="group-row" style={{ gap: '10px' }}>
              <span className="group-label">选择子公司</span>
              <select
                value={selectedOpcId}
                onChange={e => handleOpcChange(e.target.value)}
                className="field-input"
                style={{ flex: 1 }}
              >
                <option value="">-- 请选择子公司 --</option>
                {opcs.map(opc => (
                  <option key={opc.id} value={opc.id}>
                    {opc.display_name}
                    {opc.is_running && opc.office_name ? ` （运行中·${opc.office_name}）` : ''}
                  </option>
                ))}
              </select>
            </div>
            <div className="group-row" style={{ gap: '10px' }}>
              <span className="group-label">选择办公室</span>
              <select
                value={selectedOfficeId}
                onChange={e => setSelectedOfficeId(e.target.value)}
                className="field-input"
                style={{ flex: 1 }}
                disabled={!selectedOpcId}
              >
                <option value="">-- 请选择空闲办公室 --</option>
                {freeOffices.map(office => (
                  <option key={office.id} value={office.id}>{office.name}</option>
                ))}
              </select>
            </div>
            {freeOffices.length === 0 && (
              <div style={{ padding: '8px 12px', fontSize: '12px', color: '#f59e0b' }}>
                暂无空闲办公室，请先在「办公室管理」中创建或撤销现有部署
              </div>
            )}
          </div>
        </section>

        {/* 部署进度 */}
        {currentTask && (
          <section>
            <div className="section-label" style={{ padding: '0 0 7px' }}>部署进度</div>
            <div style={{ height: '3px', background: 'rgba(255,255,255,0.08)', borderRadius: '2px', marginBottom: '10px', overflow: 'hidden' }}>
              <div style={{ height: '100%', width: `${progressPct}%`, background: 'linear-gradient(90deg,#8b5cf6,#06b6d4)', borderRadius: '2px', transition: 'width 0.4s ease' }}></div>
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4,1fr)', gap: '8px' }}>
              {DEPLOY_STEPS.map((label, i) => {
                const status = stepStatus(i)
                const stepLabel = taskSteps[i] ?? label
                const colorMap = {
                  done: { bg: 'rgba(52,199,89,0.15)', stroke: '#34c759', text: '#34c759', sub: '已完成' },
                  running: { bg: 'rgba(139,92,246,0.15)', stroke: '#a78bfa', text: '#a78bfa', sub: '进行中...' },
                  pending: { bg: 'rgba(255,255,255,0.06)', stroke: '#636366', text: '#636366', sub: '等待中' },
                  failed: { bg: 'rgba(244,63,94,0.15)', stroke: '#f43f5e', text: '#f43f5e', sub: '失败' },
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
                        <div style={{ fontSize: '11px', fontWeight: 500, color: colorMap.text }}>{label}</div>
                        <div style={{ fontSize: '10px', color: '#636366' }}>{colorMap.sub}</div>
                      </div>
                    </div>
                    <div style={{ fontSize: '11px', color: '#636366' }}>{stepLabel}</div>
                  </div>
                )
              })}
            </div>
          </section>
        )}

        {/* 运行中的子公司 */}
        {runningOpcs.length > 0 && (
          <section>
            <div className="section-label" style={{ padding: '0 0 7px' }}>运行中</div>
            <div className="group">
              {runningOpcs.map(opc => (
                <div key={opc.id} className="group-row" style={{ gap: '8px' }}>
                  <div style={{ width: '8px', height: '8px', borderRadius: '50%', background: '#34c759', flexShrink: 0, alignSelf: 'center' }}></div>
                  <div style={{ flex: 1 }}>
                    <div style={{ fontSize: '13px', fontWeight: 500, color: '#EBEBF5' }}>{opc.display_name}</div>
                    <div style={{ fontSize: '11px', color: '#636366' }}>
                      🏢 {opc.office_name ?? '未知办公室'}
                    </div>
                  </div>
                  <button
                    className="tbtn tbtn-ghost"
                    style={{ fontSize: '11px', color: '#f43f5e' }}
                    onClick={() => handleUndeploy(opc)}
                  >
                    撤销部署
                  </button>
                </div>
              ))}
            </div>
          </section>
        )}

        {/* 最近部署记录 */}
        {recentDeployments.length > 0 && (
          <section>
            <div className="section-label" style={{ padding: '0 0 7px' }}>最近部署</div>
            <div className="group">
              {recentDeployments.map(task => {
                const statusColorMap: Record<string, { bg: string; color: string; label: string }> = {
                  SUCCESS:  { bg: 'rgba(52,199,89,0.15)',   color: '#34c759', label: '成功' },
                  FAILED:   { bg: 'rgba(244,63,94,0.15)',   color: '#f43f5e', label: '失败' },
                  ROLLBACK: { bg: 'rgba(245,158,11,0.15)',  color: '#f59e0b', label: '已回滚' },
                  RUNNING:  { bg: 'rgba(139,92,246,0.15)',  color: '#a78bfa', label: '运行中' },
                  PENDING:  { bg: 'rgba(255,255,255,0.06)', color: '#636366', label: '等待中' },
                }
                const sc = statusColorMap[task.status] ?? statusColorMap.PENDING
                return (
                  <div key={task.id} className="group-row" style={{ gap: '8px' }}>
                    <span style={{ fontSize: '10px', padding: '1px 6px', borderRadius: '4px', background: sc.bg, color: sc.color, flexShrink: 0 }}>{sc.label}</span>
                    <div style={{ flex: 1 }}>
                      <div style={{ fontSize: '12px', color: '#EBEBF5' }}>{task.opc_name}</div>
                      {task.office_name && (
                        <div style={{ fontSize: '11px', color: '#636366' }}>🏢 {task.office_name}</div>
                      )}
                    </div>
                    <span style={{ fontSize: '11px', color: '#636366', flexShrink: 0 }}>
                      {formatRelativeTime(task.completed_at ?? task.created_at)}
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
