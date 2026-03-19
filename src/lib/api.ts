import { invoke } from '@tauri-apps/api/core'
import type {
  OpcConfig, OpcStats,
  AgentConfig,
  ProviderConfig, ModelInfo, TestProviderResult,
  ChannelConfig,
  BindingRule,
  DeploymentTask, OfficeDeployment,
  LogEntry,
  LocalSnapshot,
  Office,
} from './types'

// ── Transport ──────────────────────────────────────────────
// In Tauri context: use invoke(). In browser dev mode: use HTTP.
const USE_HTTP = !('__TAURI_INTERNALS__' in window)
const DEV_BASE = 'http://localhost:3001/api'

async function call<T>(cmd: string, args: Record<string, unknown> = {}): Promise<T> {
  if (USE_HTTP) {
    const res = await fetch(`${DEV_BASE}/${cmd}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(args),
    })
    if (!res.ok) throw new Error(await res.text())
    return res.json() as Promise<T>
  }
  return invoke<T>(cmd, args)
}

// ── OPC ───────────────────────────────────────────────────
export const getAllOpcs = () => call<OpcConfig[]>('get_all_opcs')
export const getOpc = (id: string) => call<OpcConfig>('get_opc', { id })
export const createOpc = (config: OpcConfig) => call<string>('create_opc', { config })
export const updateOpc = (id: string, config: OpcConfig) => call<void>('update_opc', { id, config })
export const deleteOpc = (id: string) => call<void>('delete_opc', { id })
export const setCurrentOpc = (id: string) => call<void>('set_current_opc', { id })
export const getCurrentOpc = () => call<OpcConfig>('get_current_opc')
export const getOpcStats = (opcId: string) => call<OpcStats>('get_opc_stats', { opc_id: opcId })
export const exportOpc = (opcId: string) => call<string>('export_opc', { opc_id: opcId })
export const importOpc = (json: string) => call<string>('import_opc', { json })

// ── Agent ─────────────────────────────────────────────────
export const getAgents = (opcId: string) => call<AgentConfig[]>('get_agents', { opc_id: opcId })
export const getAgent = (id: string) => call<AgentConfig>('get_agent', { id })
export const createAgent = (config: AgentConfig) => call<string>('create_agent', { config })
export const updateAgent = (id: string, config: AgentConfig) => call<void>('update_agent', { id, config })
export const deleteAgent = (id: string) => call<void>('delete_agent', { id })
export const reorderAgents = (opcId: string, agentIds: string[]) =>
  call<void>('reorder_agents', { opc_id: opcId, agent_ids: agentIds })
export const getAgentDocument = (agentId: string, docType: string) =>
  call<string>('get_agent_document', { agent_id: agentId, doc_type: docType })
export const updateAgentDocument = (agentId: string, docType: string, content: string) =>
  call<void>('update_agent_document', { agent_id: agentId, doc_type: docType, content })

// ── Model / Provider ──────────────────────────────────────
export const getProviders = () => call<ProviderConfig[]>('get_providers')
export const getProvider = (providerType: string) =>
  call<ProviderConfig>('get_provider', { provider_type: providerType })
export const updateProvider = (config: ProviderConfig) => call<void>('update_provider', { config })
export const getModels = () => call<ModelInfo[]>('get_models')
export const testProvider = (providerType: string) =>
  call<TestProviderResult>('test_provider', { provider_type: providerType })

// ── Channel ───────────────────────────────────────────────
export const getChannels = (opcId: string) => call<ChannelConfig[]>('get_channels', { opc_id: opcId })
export const getChannel = (id: number) => call<ChannelConfig>('get_channel', { id })
export const upsertChannel = (config: ChannelConfig) => call<number>('upsert_channel', { config })
export const deleteChannel = (id: number) => call<void>('delete_channel', { id })
export const testFeishuConnection = (appId: string, appSecret: string) =>
  call<boolean>('test_feishu_connection', { app_id: appId, app_secret: appSecret })

// ── Binding ───────────────────────────────────────────────
export const getBindings = (opcId: string) => call<BindingRule[]>('get_bindings', { opc_id: opcId })
export const getBinding = (id: string) => call<BindingRule>('get_binding', { id })
export const createBinding = (binding: BindingRule) => call<string>('create_binding', { binding })
export const updateBinding = (id: string, binding: BindingRule) =>
  call<void>('update_binding', { id, binding })
export const deleteBinding = (id: string) => call<void>('delete_binding', { id })
export const toggleBinding = (id: string, isEnabled: boolean) =>
  call<void>('toggle_binding', { id, is_enabled: isEnabled })
export const getFeishuChannels = () => call<unknown[]>('get_feishu_channels')

// ── Deployment ────────────────────────────────────────────
export const startDeployment = (opcId: string, officeId: string) =>
  call<string>('start_deployment', { opc_id: opcId, office_id: officeId })
export const getDeploymentStatus = (taskId: string) =>
  call<DeploymentTask>('get_deployment_status', { task_id: taskId })
export const cancelDeployment = (taskId: string) =>
  call<void>('cancel_deployment', { task_id: taskId })
export const undeploy = (opcId: string) =>
  call<void>('undeploy', { opc_id: opcId })
export const getRecentDeployments = (opcId: string, limit: number) =>
  call<DeploymentTask[]>('get_recent_deployments', { opc_id: opcId, limit })
export const getOfficeDeployments = (officeId: string, limit?: number) =>
  call<OfficeDeployment[]>('get_office_deployments', { office_id: officeId, limit: limit ?? 20 })

// ── Log ───────────────────────────────────────────────────
export const getLogs = (level?: string, component?: string, limit = 200) =>
  call<LogEntry[]>('get_logs', { level: level ?? null, component: component ?? null, limit })
export const writeLog = (
  level: string,
  message: string,
  component?: string,
  agentId?: string,
  channel?: string,
) =>
  call<number>('write_log', {
    level,
    component: component ?? null,
    message,
    agent_id: agentId ?? null,
    channel: channel ?? null,
  })

// ── AI ────────────────────────────────────────────────────
export interface AgentGenerateResult {
  display_name: string
  name: string
  job_title: string
  description: string
  personality: string
  soul: string
  identity: string
  agents: string
  user: string
  memory: string
  heartbeat: string
  tools: string
}
export const aiGenerateAgent = (prompt: string) =>
  call<AgentGenerateResult>('ai_generate_agent', { prompt })

// ── Daemon Health ──────────────────────────────────────────
export interface DaemonHealthResult {
  ok: boolean
  error?: string
  status?: string
  version?: string
  openclaw_status?: string
  openclaw_pid?: number | null
  active_tasks?: number
}
export const checkDaemonHealth = (daemon_url: string, daemon_api_key: string) =>
  call<DaemonHealthResult>('check_daemon_health', { daemon_url, daemon_api_key })

// ── Office ────────────────────────────────────────────────
export const getOffices = () => call<Office[]>('get_offices')
export const getOffice = (id: string) => call<Office>('get_office', { id })
export const createOffice = (office: Office) => call<string>('create_office', { office })
export const updateOffice = (id: string, office: Office) => call<void>('update_office', { id, office })
export const deleteOffice = (id: string) => call<void>('delete_office', { id })
export const assignOffice = (opcId: string, officeId: string | null) =>
  call<void>('assign_office', { opc_id: opcId, office_id: officeId })
export const getOpcOffice = (opcId: string) => call<Office | null>('get_opc_office', { opc_id: opcId })

// ── Snapshot ──────────────────────────────────────────────
// create_snapshot: server assembles the payload from opc_id — no config_data needed
export const createSnapshot = (opcId: string, label: string, isAuto = false) =>
  call<string>('create_snapshot', { opc_id: opcId, label, is_auto: isAuto })
export const getSnapshots = (opcId: string) =>
  call<LocalSnapshot[]>('get_snapshots', { opc_id: opcId })
export const getSnapshot = (id: string) => call<LocalSnapshot & { summary?: SnapshotSummary }>('get_snapshot', { id })
export const restoreSnapshot = (id: string) => call<string>('restore_snapshot', { id })
export const deleteSnapshot = (id: string) => call<void>('delete_snapshot', { id })

export interface SnapshotSummary {
  agent_count: number
  channel_count: number
  binding_count: number
  doc_count: number
}

// ── Process ────────────────────────────────────────────────
export interface ProcessStatus {
  is_running: boolean
  pid: number | null
  uptime_seconds: number | null
}
export const getProcessStatus = () => call<ProcessStatus>('get_process_status')
export const startOpenclaw = () => call<{ ok: boolean; message: string; pid?: number }>('start_openclaw')
export const stopOpenclaw = () => call<{ ok: boolean; message: string }>('stop_openclaw')
export const reloadOpenclaw = () => call<{ ok: boolean; message: string }>('reload_openclaw')

// ── Tools / Skills (local) ────────────────────────────────
export interface LocalTool {
  id: number
  name: string
  display_name: string
  description: string
  category: string
  is_local: number
  created_at: number
}
export interface LocalSkill {
  id: number
  name: string
  display_name: string
  description: string
  category: string
  slug?: string
  version?: string
  author?: string
  tags?: string[]
  url?: string
  download_url?: string
  is_local: boolean
  is_installed: boolean
  install_path?: string | null
  installed_at?: number | null
  created_at: number
}
export const getTools = () => call<LocalTool[]>('get_tools')
export const createTool = (tool: Omit<LocalTool, 'id' | 'created_at'>) => call<number>('create_tool', { tool })
export const deleteTool = (id: number) => call<void>('delete_tool', { id })
export const getSkills = () => call<LocalSkill[]>('get_skills')
export const createSkill = (skill: Omit<LocalSkill, 'id' | 'created_at'>) => call<number>('create_skill', { skill })
export const deleteSkill = (id: number) => call<void>('delete_skill', { id })
export const syncSkills = () => call<{ ok: boolean; count: number }>('sync_skills')
export const installSkill = (slug: string) => call<LocalSkill>('install_skill', { slug })
export const uninstallSkill = (slug: string) => call<{ ok: boolean }>('uninstall_skill', { slug })

// ── Agent Chat ─────────────────────────────────────────────
export const chatWithAgent = (agentId: string, messages: { role: string; content: string }[]) =>
  call<{ reply: string }>('chat_with_agent', { agent_id: agentId, messages })
