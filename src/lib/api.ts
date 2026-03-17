import { invoke } from '@tauri-apps/api/core'
import type {
  OpcConfig, OpcStats,
  AgentConfig,
  ProviderConfig, ModelInfo,
  ChannelConfig,
  BindingRule,
  DeploymentTask,
  LogEntry,
  LocalSnapshot,
} from './types'

// ── OPC ───────────────────────────────────────────────────
export const getAllOpcs = () => invoke<OpcConfig[]>('get_all_opcs')
export const getOpc = (id: string) => invoke<OpcConfig>('get_opc', { id })
export const createOpc = (config: OpcConfig) => invoke<string>('create_opc', { config })
export const updateOpc = (id: string, config: OpcConfig) => invoke<void>('update_opc', { id, config })
export const deleteOpc = (id: string) => invoke<void>('delete_opc', { id })
export const setCurrentOpc = (id: string) => invoke<void>('set_current_opc', { id })
export const getCurrentOpc = () => invoke<OpcConfig>('get_current_opc')
export const getOpcStats = (opcId: string) => invoke<OpcStats>('get_opc_stats', { opc_id: opcId })
export const exportOpc = (opcId: string) => invoke<string>('export_opc', { opc_id: opcId })
export const importOpc = (json: string) => invoke<string>('import_opc', { json })

// ── Agent ─────────────────────────────────────────────────
export const getAgents = (opcId: string) => invoke<AgentConfig[]>('get_agents', { opc_id: opcId })
export const getAgent = (id: string) => invoke<AgentConfig>('get_agent', { id })
export const createAgent = (config: AgentConfig) => invoke<string>('create_agent', { config })
export const updateAgent = (id: string, config: AgentConfig) => invoke<void>('update_agent', { id, config })
export const deleteAgent = (id: string) => invoke<void>('delete_agent', { id })
export const reorderAgents = (opcId: string, agentIds: string[]) =>
  invoke<void>('reorder_agents', { opc_id: opcId, agent_ids: agentIds })
export const getAgentDocument = (agentId: string, docType: string) =>
  invoke<string>('get_agent_document', { agent_id: agentId, doc_type: docType })
export const updateAgentDocument = (agentId: string, docType: string, content: string) =>
  invoke<void>('update_agent_document', { agent_id: agentId, doc_type: docType, content })

// ── Model / Provider ──────────────────────────────────────
export const getProviders = () => invoke<ProviderConfig[]>('get_providers')
export const getProvider = (providerType: string) =>
  invoke<ProviderConfig>('get_provider', { provider_type: providerType })
export const updateProvider = (config: ProviderConfig) => invoke<void>('update_provider', { config })
export const getModels = () => invoke<ModelInfo[]>('get_models')
export const testProvider = (providerType: string) =>
  invoke<boolean>('test_provider', { provider_type: providerType })

// ── Channel ───────────────────────────────────────────────
export const getChannels = (opcId: string) => invoke<ChannelConfig[]>('get_channels', { opc_id: opcId })
export const getChannel = (id: number) => invoke<ChannelConfig>('get_channel', { id })
export const upsertChannel = (config: ChannelConfig) => invoke<number>('upsert_channel', { config })
export const deleteChannel = (id: number) => invoke<void>('delete_channel', { id })
export const testFeishuConnection = (appId: string, appSecret: string) =>
  invoke<boolean>('test_feishu_connection', { app_id: appId, app_secret: appSecret })

// ── Binding ───────────────────────────────────────────────
export const getBindings = (opcId: string) => invoke<BindingRule[]>('get_bindings', { opc_id: opcId })
export const getBinding = (id: string) => invoke<BindingRule>('get_binding', { id })
export const createBinding = (binding: BindingRule) => invoke<string>('create_binding', { binding })
export const updateBinding = (id: string, binding: BindingRule) =>
  invoke<void>('update_binding', { id, binding })
export const deleteBinding = (id: string) => invoke<void>('delete_binding', { id })
export const toggleBinding = (id: string, isEnabled: boolean) =>
  invoke<void>('toggle_binding', { id, is_enabled: isEnabled })
export const getFeishuChannels = () => invoke<unknown[]>('get_feishu_channels')

// ── Deployment ────────────────────────────────────────────
export const startDeployment = (opcName: string) =>
  invoke<string>('start_deployment', { opc_name: opcName })
export const getDeploymentStatus = (taskId: string) =>
  invoke<DeploymentTask>('get_deployment_status', { task_id: taskId })
export const cancelDeployment = (taskId: string) =>
  invoke<void>('cancel_deployment', { task_id: taskId })
export const getRecentDeployments = (opcName: string, limit: number) =>
  invoke<DeploymentTask[]>('get_recent_deployments', { opc_name: opcName, limit })

// ── Log ───────────────────────────────────────────────────
export const getLogs = (level?: string, component?: string, limit = 200) =>
  invoke<LogEntry[]>('get_logs', { level: level ?? null, component: component ?? null, limit })
export const writeLog = (
  level: string,
  message: string,
  component?: string,
  agentId?: string,
  channel?: string,
) =>
  invoke<number>('write_log', {
    level,
    component: component ?? null,
    message,
    agent_id: agentId ?? null,
    channel: channel ?? null,
  })

// ── Snapshot ──────────────────────────────────────────────
export const createSnapshot = (opcName: string, label: string, configData: string) =>
  invoke<string>('create_snapshot', { opc_name: opcName, label, config_data: configData })
export const getSnapshots = (opcName: string) =>
  invoke<LocalSnapshot[]>('get_snapshots', { opc_name: opcName })
export const getSnapshot = (id: string) => invoke<LocalSnapshot>('get_snapshot', { id })
export const restoreSnapshot = (id: string) => invoke<string>('restore_snapshot', { id })
export const deleteSnapshot = (id: string) => invoke<void>('delete_snapshot', { id })
