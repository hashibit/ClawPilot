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
export const createSnapshot = (opcName: string, label: string, configData: string) =>
  call<string>('create_snapshot', { opc_name: opcName, label, config_data: configData })
export const getSnapshots = (opcName: string) =>
  call<LocalSnapshot[]>('get_snapshots', { opc_name: opcName })
export const getSnapshot = (id: string) => call<LocalSnapshot>('get_snapshot', { id })
export const restoreSnapshot = (id: string) => call<string>('restore_snapshot', { id })
export const deleteSnapshot = (id: string) => call<void>('delete_snapshot', { id })
