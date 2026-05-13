import { useEffect, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { useNavigate } from 'react-router-dom'
import { getOffices, startDeployment, getDeploymentStatus, cancelDeployment, undeploy, getRecentDeployments } from '../lib/api'
import { useApi } from '../hooks/useApi'
import { toast } from '../components/Toast'
import type { Office, DeploymentTask } from '../lib/types'
import { Icon } from '../components/Icon'
import { formatRelativeTime } from '../lib/formatting'
import { useOpc } from '../contexts/OpcContext'

const DEPLOY_STEPS = ['prepare_config', 'write_dir', 'reload_process', 'health_check']

export default function DeployPage() {
  const { t } = useTranslation()
  const navigate = useNavigate()
  const { currentOpc } = useOpc()
  const [offices, setOffices] = useState<Office[]>([])
  const [deploying, setDeploying] = useState(false)
  const [currentTask, setCurrentTask] = useState<DeploymentTask | null>(null)
  const [recentDeployments, setRecentDeployments] = useState<DeploymentTask[]>([])
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null)

  // drag & pick state
  const [dragging, setDragging] = useState(false)
  const [hoverId, setHoverId] = useState<string | null>(null)
  const [pickedId, setPickedId] = useState<string | null>(null)

  const stopPolling = () => {
    if (pollRef.current) { clearInterval(pollRef.current); pollRef.current = null }
  }

  const { reload: reloadData } = useApi(
    () => getOffices(),
    [],
    {
      onSuccess: (allOffices) => setOffices(allOffices),
      onError: (e) => toast(e.message, 'error'),
    }
  )

  useEffect(() => () => stopPolling(), [])

  useEffect(() => {
    if (currentOpc?.id) loadHistory(currentOpc.id)
  }, [currentOpc?.id])

  const loadHistory = async (opcId: string) => {
    try { setRecentDeployments(await getRecentDeployments(opcId, 5)) } catch {}
  }

  const homeOffice = offices.find(o => o.current_opc_id === currentOpc?.id) ?? null
  const agentCount = currentOpc?.agent_count ?? 0

  const pollStatus = async (taskId: string, opcId: string) => {
    try {
      const task = await getDeploymentStatus(taskId)
      setCurrentTask(task)
      if (task.status === 'SUCCESS' || task.status === 'FAILED') {
        stopPolling()
        setDeploying(false)
        toast(
          task.status === 'SUCCESS' ? t('deploy.deploy_success') : t('deploy.deploy_failed', { msg: task.message ?? '' }),
          task.status === 'SUCCESS' ? 'success' : 'error',
        )
        await reloadData()
        await loadHistory(opcId)
        setPickedId(null)
      }
    } catch (e) { stopPolling(); setDeploying(false); toast(String(e), 'error') }
  }

  const handleDeploy = async (officeId: string) => {
    if (!currentOpc?.id || !officeId || deploying) return
    const target = offices.find(o => o.id === officeId)
    if (!target?.daemon_url) { toast(t('deploy.office_no_daemon'), 'error'); return }
    setDeploying(true)
    setCurrentTask(null)
    try {
      const taskId = await startDeployment(currentOpc.id, officeId)
      const task = await getDeploymentStatus(taskId)
      setCurrentTask(task)
      pollRef.current = setInterval(() => pollStatus(taskId, currentOpc.id), 2000)
    } catch (e) { setDeploying(false); toast(String(e), 'error') }
  }

  const handleCancel = async () => {
    if (!currentTask) return
    try { await cancelDeployment(currentTask.id); stopPolling(); setDeploying(false); toast(t('deploy.deploy_cancelled'), 'info') }
    catch (e) { toast(String(e), 'error') }
  }

  const handleUndeploy = async () => {
    if (!currentOpc?.id) return
    try {
      await undeploy(currentOpc.id)
      toast(t('deploy.undeploy_success', { name: currentOpc.display_name ?? '' }), 'success')
      await reloadData()
    } catch (e) { toast(String(e), 'error') }
  }

  const handleBuildingDrop = (e: React.DragEvent, officeId: string) => {
    e.preventDefault(); setDragging(false); setHoverId(null)
    handleDeploy(officeId)
  }

  const handleBuildingClick = (office: Office) => {
    if (!currentOpc?.id) return
    const isHome = office.current_opc_id === currentOpc.id
    const isOccupied = !!office.current_opc_id && !isHome
    const isOffline = !office.daemon_url
    if (isHome || isOccupied || isOffline) return
    setPickedId(pickedId === office.id ? null : office.id)
  }

  // deploy progress for building floors
  const deployFloors = currentTask
    ? currentTask.status === 'SUCCESS' ? 4 : Math.min(4, currentTask.current_step)
    : 0

  const stepStatus = (idx: number): 'done' | 'running' | 'pending' | 'failed' => {
    if (!currentTask) return 'pending'
    if (currentTask.status === 'FAILED') {
      if (idx < currentTask.current_step) return 'done'
      if (idx === currentTask.current_step) return 'failed'
      return 'pending'
    }
    if (idx < currentTask.current_step) return 'done'
    if (idx === currentTask.current_step && currentTask.status === 'RUNNING') return 'running'
    if (currentTask.status === 'SUCCESS') return 'done'
    return 'pending'
  }

  const statusLabelMap: Record<string, string> = {
    SUCCESS: t('common.status_success'),
    FAILED: t('common.status_failed'),
    ROLLBACK: t('deploy.status_rollback'),
    RUNNING: t('common.status_running'),
    PENDING: t('common.status_waiting'),
  }

  if (!currentOpc) {
    return (
      <div className="flex-1 flex-center justify-center text-sm text-dimmer">
        {t('agents.select_company_hint')}
      </div>
    )
  }

  return (
    <div className="flex-1 flex-col" style={{ overflow: 'hidden' }} onClick={() => pickedId && setPickedId(null)}>
      <div className="page-scroll">

        {/* ── Hero: OPC card + Status ── */}
        <div className="dpv-hero">
          {/* Left: company chip */}
          <div className="dpv-hero-left">
            <div
              className="dpv-company-chip"
              draggable
              onDragStart={() => { setDragging(true); setPickedId(null) }}
              onDragEnd={() => { setDragging(false); setHoverId(null) }}
            >
              <div
                className="dpv-company-avatar"
                style={{ background: currentOpc.avatar_color || 'var(--accent)', color: 'var(--text-on-accent)', fontWeight: 700 }}
              >
                {currentOpc.avatar_initials || currentOpc.display_name.slice(0, 1)}
              </div>
              <div className="dpv-company-info">
                <div className="dpv-company-name">{currentOpc.display_name}</div>
                <div className="dpv-company-meta">
                  <Icon name="users" size={11} />
                  <span>{t('deploy.agent_count_format', { count: agentCount })}</span>
                  <span>·</span>
                  <span>v1.4.2</span>
                </div>
              </div>
              <div className="dpv-drag-hint">
                <Icon name="grid" size={14} />
                <span>{t('deploy.drag_me')}</span>
              </div>
            </div>
          </div>

          {/* Right: status */}
          <div className="dpv-hero-right">
            {homeOffice ? (
              <div className="dpv-status">
                <div className="dpv-status-line">
                  <span className="dpv-status-dot live" />
                  <span>{t('deploy.currently_living_in')}</span>
                  <b>{homeOffice.receptionist_image || '🏢'} {homeOffice.name}</b>
                </div>
                <div className="dpv-status-actions">
                  <button className="btn btn-sm" onClick={() => navigate('/logs')}>
                    <Icon name="file" size={12} /> {t('nav.logs')}
                  </button>
                  <button className="btn btn-sm" onClick={handleUndeploy} disabled={deploying}>
                    <Icon name="external-link" size={12} /> {t('deploy.move_out')}
                  </button>
                </div>
              </div>
            ) : (
              <div className="dpv-status nowhere">
                <div className="dpv-status-line">
                  <span className="dpv-status-dot idle" />
                  <span>{t('deploy.not_living_any_building')}</span>
                </div>
                <div className="dpv-status-hint">{t('deploy.click_empty_building')}</div>
              </div>
            )}
          </div>
        </div>

        {/* ── Street / Buildings ── */}
        <div className={`dpv-street${dragging ? ' is-dragging' : ''}`}>
          <div className="dpv-street-sky" />
          <div className="dpv-buildings-row">
            {offices.length === 0 ? (
              <div className="text-sm text-center muted" style={{ gridColumn: '1/-1', padding: '48px 16px' }}>
                {t('deploy.no_buildings_configured')}<span style={{ color: 'var(--accent)', cursor: 'pointer' }} onClick={() => navigate('/office')}>{t('deploy.add_office_link')}</span>
              </div>
            ) : offices.map(o => {
              const isHome = o.current_opc_id === currentOpc.id
              const isOccupied = !!o.current_opc_id && !isHome
              const isOffline = !o.daemon_url
              const isHover = hoverId === o.id
              const isPicked = pickedId === o.id
              const deployingHere = deploying && currentTask?.office_id === o.id
              const canDrop = !isOffline && !isOccupied && !isHome

              let bldgClass = 'dpv-bldg'
              if (isOffline) bldgClass += ' is-offline'
              else if (isOccupied) bldgClass += ' is-occupied'
              if (isPicked) bldgClass += ' is-picked'
              if (isHover && canDrop) bldgClass += ' is-hover'
              if (isHover && !canDrop) bldgClass += ' is-hover-blocked'
              if (dragging && canDrop) bldgClass += ' is-droppable'

              // badge
              let badgeText = t('deploy.vacant_available_move')
              let badgeClass = 'b-tag'
              if (isOffline)       { badgeText = t('deploy.offline_status'); badgeClass = 'b-tag error' }
              else if (isHome)     { badgeText = t('deploy.current_residence'); badgeClass = 'b-tag success' }
              else if (isOccupied) { badgeText = `${o.receptionist_image || '🏢'} ${o.current_opc_name || t('deploy.occupied_name')}`; badgeClass = 'b-tag muted' }

              // floor lit logic
              const litFloor = (floorIdx: number): boolean => {
                if (isHome && !deployingHere) return true
                if (isOccupied) return true
                if (deployingHere) return floorIdx < deployFloors
                return false
              }

              const floorIsOther = isOccupied && !isHome

              return (
                <div
                  key={o.id}
                  className={bldgClass}
                  onDragOver={e => { e.preventDefault(); setHoverId(o.id) }}
                  onDragLeave={() => setHoverId(null)}
                  onDrop={e => handleBuildingDrop(e, o.id)}
                  onClick={e => { e.stopPropagation(); handleBuildingClick(o) }}
                >
                  {/* Flag on roof */}
                  <div className="dpv-bldg-roof">
                    {(isHome || isOccupied) && (
                      <div
                        className={`dpv-bldg-flag${isOccupied && !isHome ? ' muted' : ''}`}
                        style={{ background: isHome ? (currentOpc.avatar_color || 'var(--accent)') : isOccupied ? 'var(--border-strong)' : 'var(--accent)' }}
                      >
                        <span style={{ fontSize: '10px' }}>
                          {isHome ? (currentOpc.avatar_initials || currentOpc.display_name.slice(0, 1)) : o.receptionist_image || '🏢'}
                        </span>
                      </div>
                    )}
                  </div>

                  {/* Building body */}
                  <div className="dpv-bldg-body">
                    {[3, 2, 1, 0].map(i => (
                      <div
                        key={i}
                        className={`dpv-bldg-floor${litFloor(i) ? ' lit' : ''}${floorIsOther ? ' other-tenant' : ''}${deployingHere && i === deployFloors ? ' current-step' : ''}`}
                      >
                        {[0, 1, 2, 3].map(w => (
                          <div key={w} className="dpv-bldg-window" />
                        ))}
                      </div>
                    ))}
                  </div>

                  {/* Door */}
                  <div className="dpv-bldg-door">
                    <span className="dpv-bldg-receptionist">
                      {o.receptionist_image || '🏠'}
                    </span>
                  </div>

                  {/* Sign */}
                  <div className="dpv-bldg-sign">
                    <div className="dpv-bldg-name">{o.name}</div>
                    <div className="dpv-bldg-host">{o.address || '127.0.0.1'}</div>
                  </div>

                  {/* Badge */}
                  <div className="dpv-bldg-badge">
                    <span className={badgeClass}>{badgeText}</span>
                  </div>

                  {/* Deploy action button */}
                  {isPicked && canDrop && !deploying && (
                    <div
                      className="dpv-bldg-preview"
                      onClick={e => { e.stopPropagation(); handleDeploy(o.id); setPickedId(null) }}
                      style={{ cursor: 'pointer' }}
                    >
                      <span className="dpv-bldg-preview-msg">{t('deploy.click_deploy_here')}</span>
                    </div>
                  )}
                </div>
              )
            })}
          </div>
        </div>

        {/* ── Deploy progress ── */}
        {currentTask && (
          <div className="section-card" style={{ padding: '16px 20px' }}>
            <div className="flex-between" style={{ marginBottom: '10px' }}>
              <span className="text-sm text-bold">
                {t('deploy.deploy_progress')}
              </span>
              <div className="flex-center gap-8">
                <span className="mono-xs text-dimmer">{currentTask.status}</span>
                {deploying && (
                  <button className="btn btn-sm btn-ghost btn-danger" onClick={handleCancel}>
                    {t('deploy.cancel_deploy')}
                  </button>
                )}
              </div>
            </div>
            <div style={{ height: '3px', background: 'var(--border-subtle)', borderRadius: '2px', marginBottom: '12px', overflow: 'hidden' }}>
              <div style={{
                height: '100%',
                width: `${currentTask.status === 'SUCCESS' ? 100 : Math.round((currentTask.current_step / DEPLOY_STEPS.length) * 100)}%`,
                background: currentTask.status === 'FAILED' ? 'var(--error)' : 'var(--accent)',
                borderRadius: '2px',
                transition: 'width 0.4s ease',
              }} />
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4,1fr)', gap: '8px' }}>
              {DEPLOY_STEPS.map((label, i) => {
                const s = stepStatus(i)
                const stepLabel = t(`deploy.step_${label}`)
                const cfg = {
                  done:    { bg: 'var(--success-muted)', c: 'var(--success)',      sub: t('common.status_done') },
                  running: { bg: 'var(--accent-muted)',  c: 'var(--accent-hover)', sub: t('common.status_running_ellipsis') },
                  pending: { bg: 'var(--border-subtle)', c: 'var(--text-dimmer)',   sub: t('common.status_waiting') },
                  failed:  { bg: 'var(--error-muted)',   c: 'var(--error)',         sub: t('common.status_failed') },
                }[s]
                return (
                  <div key={label} className={`step-card${s === 'done' ? ' done' : ''}`}>
                    <div className="flex-center gap-8" style={{ marginBottom: '4px' }}>
                      <div className="flex-shrink-0" style={{ width: 22, height: 22, borderRadius: 6, background: cfg.bg, display: 'grid', placeItems: 'center' }}>
                        {s === 'running' ? <Icon name="loading" size={11} stroke={cfg.c} strokeWidth={2.5} spin />
                          : s === 'failed' ? <Icon name="x" size={11} stroke={cfg.c} strokeWidth={2.5} />
                          : s === 'done' ? <Icon name="check" size={11} stroke={cfg.c} strokeWidth={2.5} />
                          : <Icon name="circle" size={11} stroke={cfg.c} strokeWidth={2.5} />}
                      </div>
                      <div>
                        <div className="text-xxs" style={{ fontWeight: 500, color: cfg.c }}>{stepLabel}</div>
                        <div className="text-dimmer" style={{ fontSize: '10px' }}>{cfg.sub}</div>
                      </div>
                    </div>
                  </div>
                )
              })}
            </div>
          </div>
        )}

        {/* ── Recent deployments ── */}
        <div className="dpv-history">
          <div className="dpv-history-head">
            <h3 className="text-title" style={{ margin: 0 }}>{t('deploy.recent_moves')}</h3>
            <span className="text-xs muted">
              {recentDeployments.length > 0 ? t('deploy.recent_moves_count', { count: recentDeployments.length }) : ''}
            </span>
          </div>
          <div className="dpv-history-list">
            {recentDeployments.length === 0 ? (
              <div className="text-sm text-center muted" style={{ padding: '32px 16px' }}>
                {t('deploy.no_move_history')}
              </div>
            ) : recentDeployments.map(d => (
              <div key={d.id} className="dpv-history-row">
                <span className="dpv-history-time">{formatRelativeTime(d.completed_at ?? d.created_at, t)}</span>
                <span className="dpv-history-co">{d.opc_name}</span>
                <span className="dpv-history-arrow">
                  {d.office_name && <>→ {d.office_name}</>}
                </span>
                <span className="dpv-history-who" />
                <span className={`dpv-history-status${d.status === 'SUCCESS' ? ' ok' : d.status === 'FAILED' ? ' warn' : ''}`}>
                  {d.status === 'SUCCESS' ? '✓ ' : ''}{statusLabelMap[d.status] ?? d.status}
                </span>
              </div>
            ))}
          </div>
        </div>

      </div>
    </div>
  )
}
