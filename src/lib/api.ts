import { invoke } from '@tauri-apps/api/core'
import type {
  OpcConfig, OpcStats,
  AgentConfig,
  ProviderConfig, ModelInfo, KnownProvider, SuggestProviderResult,
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
const SERVER_PORT = import.meta.env.VITE_SERVER_PORT ?? '16667'
const DEV_BASE = `http://localhost:${SERVER_PORT}/api`

async function call<T>(cmd: string, args: Record<string, unknown> = {}): Promise<T> {
  if (USE_HTTP) {
    const res = await fetch(`${DEV_BASE}/${cmd}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(args),
    })
    if (!res.ok) {
      const text = await res.text()
      let message = text
      try { message = JSON.parse(text).error ?? text } catch {}
      throw new Error(message)
    }
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
export const setDefaultAgent = (opcId: string, agentId: string) =>
  call<void>('set_default_agent', { opc_id: opcId, agent_id: agentId })
export const getAgentDocument = (agentId: string, docType: string) =>
  call<string>('get_agent_document', { agent_id: agentId, doc_type: docType })
export const updateAgentDocument = (agentId: string, docType: string, content: string) =>
  call<void>('update_agent_document', { agent_id: agentId, doc_type: docType, content })
export const getAgentDocuments = (agentId: string) =>
  call<{ document_type: string; content: string }[]>('get_agent_documents', { agent_id: agentId })

// ── Model / Provider ──────────────────────────────────────
export const getProviders = () => call<ProviderConfig[]>('get_providers', {})
export const createProvider = (data: Omit<ProviderConfig, 'id' | 'created_at' | 'updated_at'>) =>
  call<ProviderConfig>('create_provider', data)
export const updateProvider = (data: Partial<ProviderConfig> & { id: string }) =>
  call<ProviderConfig>('update_provider', data)
export const deleteProvider = (id: string) => call<null>('delete_provider', { id })
export const getModels = (provider_name?: string) => call<ModelInfo[]>('get_models', { provider_name })
export const setModels = (provider_name: string, models: Partial<ModelInfo>[]) =>
  call<ModelInfo[]>('set_models', { provider_name, models })
export const suggestProvider = (base_url: string) => call<SuggestProviderResult | null>('suggest_provider', { base_url })
export const getKnownProviders = () => call<KnownProvider[]>('get_known_providers', {})
export const testProvider = (base_url: string, api_key: string, api: string, provider_id?: string) =>
  call<{ ok: boolean; latency_ms?: number; error?: string }>('test_provider', { base_url, api_key, api, provider_id })

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
export interface FeishuChannel {
  chat_id: string
  name: string
  avatar?: string
  description?: string
}
export const getFeishuChannels = () => call<FeishuChannel[]>('get_feishu_channels')

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
  openclaw_version?: string
  openclaw_status?: string
  openclaw_pid?: number | null
  active_tasks?: number
}
export const checkDaemonHealth = (daemon_url: string, daemon_api_key: string) =>
  call<DaemonHealthResult>('check_daemon_health', { daemon_url, daemon_api_key })

export const probeLocalDaemon = (office_id: string) =>
  call<{ ok: boolean; daemon_url?: string; api_key?: string }>('probe_local_daemon', { office_id })

export const getLocalDaemonVersion = () =>
  call<{ ok: boolean; version?: string; error?: string }>('get_local_daemon_version', {})

export const checkSshConnection = (host: string, port = 22) =>
  call<{ ok: boolean; latency_ms?: number; error?: string }>('check_ssh_connection', { host, port })

export const checkSshAuth = (params: {
  address: string
  auth_type?: string
  user?: string
  password?: string
  key_path?: string
}) => call<{ ok: boolean; latency_ms?: number; error?: string }>('check_ssh_auth', params as unknown as Record<string, unknown>)

// ── Office ────────────────────────────────────────────────
export const getOffices = () => call<Office[]>('get_offices')
export const getOffice = (id: string) => call<Office>('get_office', { id })
export const createOffice = (office: Office) => call<string>('create_office', { office })
export const updateOffice = (id: string, office: Office) => call<void>('update_office', { id, office })
export const deleteOffice = (id: string) => call<void>('delete_office', { id })
export const assignOffice = (opcId: string, officeId: string | null) =>
  call<void>('assign_office', { opc_id: opcId, office_id: officeId })

export interface InstallDaemonParams {
  office_id: string
  mode: 'local' | 'ssh'
  daemon_port?: number
  ssh_host?: string
  ssh_port?: number
  ssh_user?: string
  ssh_key_path?: string
  ssh_password?: string
}
export interface InstallDaemonResult {
  ok: boolean
  daemon_url?: string
  api_key?: string
  logs: string[]
  already_running?: boolean
  error?: string
}
export const installDaemon = (params: InstallDaemonParams) =>
  call<InstallDaemonResult>('install_daemon', params as unknown as Record<string, unknown>)
export const getOpcOffice = (opcId: string) => call<Office | null>('get_opc_office', { opc_id: opcId })
export const deployToOffice = (opc_id: string, office_id: string) =>
  call<{ ok: boolean; task_id?: string; error?: string }>('deploy_to_office', { opc_id, office_id })
export const buildDeployPackage = (opc_id: string) =>
  call<{ ok: boolean; checksum?: string; size?: number }>('build_deploy_package', { opc_id })

export interface InstallOpenclawParams {
  office_id?: string
  mode: 'local' | 'ssh'
  ssh_host?: string
  ssh_port?: number
  ssh_user?: string
  ssh_key_path?: string
  ssh_password?: string
}
export const installOpenclaw = (params: InstallOpenclawParams) =>
  call<{ ok: boolean; logs: string[]; error?: string }>('install_openclaw', params as unknown as Record<string, unknown>)

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
export const restartOpenclaw = () => call<{ ok: boolean; message?: string; error?: string }>('restart_openclaw')

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

export interface RemoteSkillResult {
  slug: string
  name: string
  description: string
  description_zh?: string
  downloads: number
  stars: number
  ownerName: string
  version: string
  score?: number
}
/** source defaults to 'clawhub' (Convex). Pass 'lightmake' to use the old backend. */
export const searchSkills = (q: string, source: 'clawhub' | 'lightmake' = 'clawhub', limit = 25) =>
  call<RemoteSkillResult[]>('search_skills', { q, source, limit })

// ── Agent Chat ─────────────────────────────────────────────
export const chatWithAgent = (agentId: string | null, messages: { role: string; content: string }[], soulOverride?: string) =>
  call<{ reply: string }>('chat_with_agent', { agent_id: agentId, messages, ...(soulOverride ? { soul_override: soulOverride } : {}) })
