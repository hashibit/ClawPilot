// TypeScript types mirroring Rust models (serde-serialized)

// ── OPC ───────────────────────────────────────────────────
export interface OpcConfig {
  id: string
  name: string
  display_name: string
  description?: string
  avatar_color?: string
  avatar_initials?: string
  is_active: boolean
  is_running: boolean
  agent_count: number
  channel_count: number
  message_count_today: number
  message_growth: number
  created_at: number
  updated_at: number
}

export interface OpcStats {
  agent_count: number
  channel_count: number
  group_count: number
  dm_count: number
  message_count_today: number
  message_growth: number
}

// ── Agent ─────────────────────────────────────────────────
export type DocumentType = 'SOUL' | 'IDENTITY' | 'AGENTS' | 'USER' | 'MEMORY' | 'HEARTBEAT' | 'TOOLS'

export interface AgentConfig {
  id: string
  opc_id: string
  name: string
  display_name: string
  job_title?: string
  personality?: string
  description?: string
  initials?: string
  gradient_start?: string
  gradient_end?: string
  is_default: boolean
  order_index: number
  model_provider?: string
  model_name?: string
  enabled_tools: string[]
  disabled_tools: string[]
  enabled_skills: string[]
  guardrail_rules: string[]
  reports_to: string[]
  manages: string[]
  created_at: number
  updated_at: number
}

// ── Model / Provider ──────────────────────────────────────
export type ProviderType = 'BAILIAN' | 'VOLCENGINE' | 'MINIMAX'

export interface ProviderConfig {
  id: string
  provider_type: ProviderType
  api_key?: string
  endpoint?: string
  is_enabled: boolean
  is_available: boolean
  last_tested?: number
  created_at: number
  updated_at: number
}

export interface ModelInfo {
  id: string
  name: string
  display_name: string
  provider_type: ProviderType
  context_window: number
  input_price: number
  output_price: number
  supports_vision: boolean
  supports_function_calling: boolean
  supports_streaming: boolean
}

// ── Channel ───────────────────────────────────────────────
export type ChannelType = 'FEISHU' | 'DINGTALK' | 'WECHAT'

export interface FeishuConfig {
  app_id: string
  app_secret: string
}

export interface ChannelConfig {
  id: string
  opc_id: string
  channel_type: ChannelType
  is_enabled: boolean
  feishu_config?: FeishuConfig
  is_connected: boolean
  last_connected?: number
  created_at: number
  updated_at: number
}

// ── Binding ───────────────────────────────────────────────
export type BindingChannelType = 'GROUP' | 'DM'
export type TriggerMode = 'MENTION' | 'ALL'

export interface BindingRule {
  id: string
  opc_id: string
  channel_id: string
  channel_name: string
  channel_type: BindingChannelType
  agent_id: string
  agent_name: string
  trigger_mode: TriggerMode
  is_enabled: boolean
  created_at: number
  updated_at: number
}

// ── Deployment ────────────────────────────────────────────
export type DeploymentStatus = 'PENDING' | 'RUNNING' | 'SUCCESS' | 'FAILED' | 'ROLLBACK'

export interface DeploymentTask {
  id: string
  opc_name: string
  status: DeploymentStatus
  message?: string
  steps: string  // JSON array of step descriptions
  current_step: number
  created_at: number
  started_at?: number
  completed_at?: number
}

// ── Log ───────────────────────────────────────────────────
export interface LogEntry {
  id: number
  timestamp: number
  level: string
  component?: string
  message: string
  agent_id?: string
  channel?: string
  metadata?: string
}

// ── Snapshot ──────────────────────────────────────────────
export interface LocalSnapshot {
  id: string
  label: string
  opc_name: string
  config_data: string
  is_auto: boolean
  created_at: number
}
