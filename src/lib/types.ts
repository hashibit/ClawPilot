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
  office_id?: string | null
  office_name?: string | null
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
  model?: string           // 'provider_name/model_id' e.g. 'bailian/qwen3.5-plus'
  /** @deprecated use model */
  model_provider?: string
  /** @deprecated use model */
  model_name?: string
  enabled_tools: string[]
  disabled_tools: string[]
  enabled_skills: string[]
  guardrail_rules: string[]    // legacy compat — same as guardrail_allow
  guardrail_allow: string[]    // 允许规则
  guardrail_deny: string[]     // 禁止规则
  reports_to: string[]
  manages: string[]
  created_at: number
  updated_at: number
}

// ── Model / Provider ──────────────────────────────────────
export type ProviderApi = 'openai-completions' | 'anthropic-messages' | 'gemini'

export interface ProviderConfig {
  id: string
  name: string          // user-defined, unique key in openclaw.json
  api: ProviderApi
  base_url: string
  api_key: string
  is_enabled: boolean
  is_available: boolean
  last_tested?: number
  created_at: number
  updated_at: number
}

export interface ModelInfo {
  id: string
  provider_name: string
  model_id: string
  display_name: string
  context_window: number
  max_tokens: number
  input_types: string   // JSON string: '["text","image"]'
  cost_input: number
  cost_output: number
  supports_vision: boolean
  supports_function_calling: boolean
  supports_streaming: boolean
  is_custom: boolean
  sort_order: number
  updated_at: number
}

export interface KnownProvider {
  suggestName: string
  api: ProviderApi
  matchUrls: string[]
  models: Partial<ModelInfo>[]
}

export interface SuggestProviderResult {
  name: string
  api: ProviderApi
  models: Partial<ModelInfo>[]
}

// ── Channel ───────────────────────────────────────────────
export type ChannelType = 'FEISHU' | 'DINGTALK' | 'WECHAT' | 'SLACK'

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
  opc_id?: string
  opc_name: string
  office_id?: string
  office_name?: string
  status: DeploymentStatus
  message?: string
  steps: string  // JSON array of step descriptions
  current_step: number
  created_at: number
  started_at?: number
  completed_at?: number
}

export interface OfficeDeployment {
  id: string
  opc_id: string
  opc_name: string
  office_id: string
  office_name: string
  deployed_at: number
  undeployed_at?: number
  is_active: boolean
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

// ── Office ────────────────────────────────────────────────
export type OfficeOwnership = 'RENTED' | 'OWNED'
export type OfficeGrade = 'HIGH' | 'MEDIUM' | 'LOW'
export type AccessAuthType = 'password' | 'ssh_key'

export interface Office {
  id: string
  name: string
  address?: string
  access_auth_type?: AccessAuthType  // 远程认证方式
  access_user?: string               // 用户名
  access_password?: string           // 密码（password 模式）
  ssh_key_path?: string              // SSH 私钥路径（ssh_key 模式）
  phone?: string
  receptionist_image?: string
  ownership: OfficeOwnership
  monthly_rent?: number
  internet_speed?: string
  decoration_grade: OfficeGrade
  description?: string
  daemon_url?: string        // Daemon HTTP endpoint
  daemon_api_key?: string    // Daemon API Key (plain text, stored server-side)
  current_opc_id?: string | null
  current_opc_name?: string | null
  created_at: number
  updated_at: number
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
