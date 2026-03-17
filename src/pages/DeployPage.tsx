import { useEffect, useRef, useState } from 'react'
import { useOpc } from '../contexts/OpcContext'
import {
  startDeployment, getDeploymentStatus, cancelDeployment,
  getRecentDeployments, getSnapshots, createSnapshot, restoreSnapshot, deleteSnapshot,
} from '../lib/api'
import { toast } from '../components/Toast'
import type { DeploymentTask, LocalSnapshot } from '../lib/types'

const DEPLOY_STEPS = ['备份配置', '验证配置', '写入文件', '重启服务']

function formatRelativeTime(ts: number): string {
  const diff = Date.now() - ts
  const minutes = Math.floor(diff / 60000)
  const hours = Math.floor(diff / 3600000)
  const days = Math.floor(diff / 86400000)
  if (days > 0) return `${days}天前`
  if (hours > 0) return `${hours}小时前`
  if (minutes > 0) return `${minutes}分钟前`
  return '刚刚'
}

export default function DeployPage() {
  const { currentOpc } = useOpc()
  const [deploying, setDeploying] = useState(false)
  const [currentTask, setCurrentTask] = useState<DeploymentTask | null>(null)
  const [recentDeployments, setRecentDeployments] = useState<DeploymentTask[]>([])
  const [snapshots, setSnapshots] = useState<LocalSnapshot[]>([])
  const [snapshotLabel, setSnapshotLabel] = useState('')
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null)

  const stopPolling = () => {
    if (pollRef.current) {
      clearInterval(pollRef.current)
      pollRef.current = null
    }
  }

  useEffect(() => {
    return () => stopPolling()
  }, [])

  useEffect(() => {
    if (!currentOpc) return
    loadHistory()
  }, [currentOpc?.name])

  const loadHistory = async () => {
    if (!currentOpc) return
    try {
      const [deployments, snaps] = await Promise.all([
        getRecentDeployments(currentOpc.name, 5),
        getSnapshots(currentOpc.name),
      ])
      setRecentDeployments(deployments)
      setSnapshots(snaps)
    } catch (e) {
      toast(String(e), 'error')
    }
  }

  const pollStatus = async (taskId: string) => {
    try {
      const task = await getDeploymentStatus(taskId)
      setCurrentTask(task)
      if (task.status === 'SUCCESS' || task.status === 'FAILED' || task.status === 'ROLLBACK') {
        stopPolling()
        setDeploying(false)
        toast(
          task.status === 'SUCCESS' ? '部署成功' : `部署失败: ${task.message ?? '未知错误'}`,
          task.status === 'SUCCESS' ? 'success' : 'error',
        )
        await loadHistory()
      }
    } catch (e) {
      stopPolling()
      setDeploying(false)
      toast(String(e), 'error')
    }
  }

  const handleDeploy = async () => {
    if (!currentOpc || deploying) return
    setDeploying(true)
    setCurrentTask(null)
    try {
      const taskId = await startDeployment(currentOpc.name)
      const task = await getDeploymentStatus(taskId)
      setCurrentTask(task)
      pollRef.current = setInterval(() => pollStatus(taskId), 2000)
    } catch (e) {
      setDeploying(false)
      toast(String(e), 'error')
    }
  }

  const handleCancel = async () => {
    if (!currentTask) return
    try {
      await cancelDeployment(currentTask.id)
      stopPolling()
      setDeploying(false)
      toast('部署已取消', 'info')
      await loadHistory()
    } catch (e) {
      toast(String(e), 'error')
    }
  }

  const handleCreateSnapshot = async () => {
    if (!currentOpc) return
    const label = snapshotLabel.trim() || `手动快照 · ${new Date().toLocaleString('zh-CN')}`
    try {
      await createSnapshot(currentOpc.name, label, '{}')
      setSnapshotLabel('')
      await loadHistory()
      toast('快照已创建', 'success')
    } catch (e) {
      toast(String(e), 'error')
    }
  }

  const handleRestoreSnapshot = async (id: string) => {
    try {
      await restoreSnapshot(id)
      toast('已恢复快照，请重新部署以生效', 'success')
    } catch (e) {
      toast(String(e), 'error')
    }
  }

  const handleDeleteSnapshot = async (id: string) => {
    try {
      await deleteSnapshot(id)
      setSnapshots(prev => prev.filter(s => s.id !== id))
      toast('快照已删除', 'success')
    } catch (e) {
      toast(String(e), 'error')
    }
  }

  // Parse steps from task
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
    ? currentTask.status === 'SUCCESS'
      ? 100
      : Math.round((currentTask.current_step / DEPLOY_STEPS.length) * 100)
    : 0

  const lastDeploy = recentDeployments[0]

  return (
    <main style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
      <div className="toolbar" style={{ justifyContent: 'space-between' }}>
        <span style={{ fontSize: '15px', fontWeight: 600 }}>一键部署</span>
        <div style={{ display: 'flex', gap: '6px', alignItems: 'center' }}>
          {lastDeploy && (
            <span style={{ fontSize: '11px', color: '#636366', alignSelf: 'center' }}>
              上次部署: {formatRelativeTime(lastDeploy.completed_at ?? lastDeploy.created_at)}
            </span>
          )}
          {deploying ? (
            <button className="tbtn tbtn-ghost" style={{ color: '#f43f5e' }} onClick={handleCancel}>取消部署</button>
          ) : (
            <button className="tbtn tbtn-success" onClick={handleDeploy} disabled={!currentOpc}>
              立即部署
            </button>
          )}
        </div>
      </div>
      <div style={{ flex: 1, overflowY: 'auto', padding: '14px 16px', display: 'flex', flexDirection: 'column', gap: '14px' }}>

        {/* 部署进度 */}
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
          {currentTask?.message && (
            <div style={{ marginTop: '8px', fontSize: '12px', color: currentTask.status === 'FAILED' ? '#f43f5e' : '#636366', padding: '6px 10px', background: 'rgba(255,255,255,0.04)', borderRadius: '6px' }}>
              {currentTask.message}
            </div>
          )}
        </section>

        {/* 快照管理 */}
        <section>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '7px' }}>
            <span className="section-label" style={{ padding: 0 }}>快照历史</span>
            <div style={{ display: 'flex', gap: '6px', alignItems: 'center' }}>
              <input
                type="text"
                value={snapshotLabel}
                onChange={e => setSnapshotLabel(e.target.value)}
                placeholder="快照备注（可选）"
                className="field-input"
                style={{ fontSize: '11px', padding: '3px 8px', width: '140px' }}
              />
              <button
                className="tbtn tbtn-ghost"
                style={{ fontSize: '11px' }}
                onClick={handleCreateSnapshot}
              >
                创建快照
              </button>
            </div>
          </div>
          <div className="group">
            {snapshots.length === 0 ? (
              <div style={{ padding: '12px', textAlign: 'center', fontSize: '12px', color: '#636366' }}>暂无快照</div>
            ) : (
              snapshots.map(snap => (
                <div key={snap.id} className="group-row" style={{ gap: '8px' }}>
                  <div style={{ width: '24px', height: '24px', borderRadius: '6px', background: snap.is_auto ? 'rgba(52,199,89,0.15)' : 'rgba(255,255,255,0.08)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                    <svg fill="none" stroke={snap.is_auto ? '#34c759' : '#8E8E93'} strokeWidth="2.5" viewBox="0 0 24 24" width="12" height="12"><path strokeLinecap="round" strokeLinejoin="round" d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z"/></svg>
                  </div>
                  <div style={{ flex: 1 }}>
                    <div style={{ fontSize: '12px', fontWeight: 500, color: '#EBEBF5' }}>{snap.label}</div>
                    <div style={{ fontSize: '11px', color: '#636366' }}>{snap.is_auto ? '自动快照' : '手动快照'}</div>
                  </div>
                  <span style={{ fontSize: '11px', color: '#636366' }}>{formatRelativeTime(snap.created_at)}</span>
                  <button
                    className="tbtn tbtn-ghost"
                    style={{ padding: '2px 8px', fontSize: '11px' }}
                    onClick={() => handleRestoreSnapshot(snap.id)}
                  >
                    恢复
                  </button>
                  <button
                    className="tbtn tbtn-ghost"
                    style={{ padding: '2px 8px', fontSize: '11px', color: '#f43f5e' }}
                    onClick={() => handleDeleteSnapshot(snap.id)}
                  >
                    删除
                  </button>
                </div>
              ))
            )}
          </div>
        </section>

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
                      <div style={{ fontSize: '11px', color: '#636366' }}>{task.message ?? ''}</div>
                    </div>
                    <span style={{ fontSize: '11px', color: '#636366' }}>
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
