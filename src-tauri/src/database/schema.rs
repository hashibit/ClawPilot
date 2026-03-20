/// V2 migration: new tables (offices, office_deployments)
pub const MIGRATION_V2_TABLES: &str = r#"
CREATE TABLE IF NOT EXISTS offices (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    address TEXT,
    access_card TEXT,
    phone TEXT,
    receptionist_image TEXT,
    ownership TEXT NOT NULL DEFAULT 'RENTED',
    monthly_rent REAL,
    internet_speed TEXT,
    decoration_grade TEXT NOT NULL DEFAULT 'MEDIUM',
    description TEXT,
    daemon_url TEXT,
    daemon_api_key TEXT,
    created_at INTEGER NOT NULL,
    updated_at INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS office_deployments (
    id TEXT PRIMARY KEY,
    opc_id TEXT NOT NULL,
    opc_name TEXT NOT NULL,
    office_id TEXT NOT NULL,
    office_name TEXT NOT NULL,
    deployed_at INTEGER NOT NULL,
    undeployed_at INTEGER,
    is_active INTEGER NOT NULL DEFAULT 1
);

CREATE INDEX IF NOT EXISTS idx_offices_created_at ON offices(created_at);
CREATE INDEX IF NOT EXISTS idx_office_deployments_office_id ON office_deployments(office_id);
CREATE INDEX IF NOT EXISTS idx_office_deployments_opc_id ON office_deployments(opc_id);
"#;

/// V1 スキーマ：すべてのコアテーブルと索引を定義する。
///
/// 外部キー依存を考慮した作成順序:
///   1. 核心配置表
///   2. Agent 配置表
///   3. 模型配置表
///   4. 渠道配置表
///   5. 绑定配置表
///   6. 工具和技能库表
///   7. 快照和部署表
///   8. 日志表
///
/// Pro 功能表（users, auth_tokens, subscriptions, orders,
/// templates, cloud_snapshots, selector_configs）は含まない。
pub const SCHEMA_V1: &str = r#"
-- ─────────────────────────────────────────────
-- 1. 核心配置表
-- ─────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS openclaw_config (
    id INTEGER PRIMARY KEY CHECK (id = 1),
    current_opc TEXT NOT NULL,
    version TEXT DEFAULT '1.0.0',
    last_updated INTEGER NOT NULL,
    created_at INTEGER NOT NULL DEFAULT (strftime('%s', 'now'))
);

CREATE TABLE IF NOT EXISTS opc_config (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL UNIQUE,
    display_name TEXT NOT NULL,
    description TEXT,
    avatar_color TEXT,
    avatar_initials TEXT,
    is_active INTEGER DEFAULT 0,
    is_running INTEGER DEFAULT 0,
    agent_count INTEGER DEFAULT 0,
    channel_count INTEGER DEFAULT 0,
    group_count INTEGER DEFAULT 0,
    dm_count INTEGER DEFAULT 0,
    message_count_today INTEGER DEFAULT 0,
    message_growth REAL DEFAULT 0.0,
    created_at INTEGER NOT NULL,
    updated_at INTEGER NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_opc_is_active ON opc_config(is_active);
CREATE INDEX IF NOT EXISTS idx_opc_name ON opc_config(name);

-- ─────────────────────────────────────────────
-- 2. Agent 配置表
-- ─────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS agents (
    id TEXT PRIMARY KEY,
    opc_id TEXT NOT NULL,
    name TEXT NOT NULL,
    display_name TEXT NOT NULL,
    job_title TEXT,
    personality TEXT,
    description TEXT,
    initials TEXT,
    gradient_start TEXT,
    gradient_end TEXT,
    is_default INTEGER DEFAULT 0,
    order_index INTEGER DEFAULT 0,
    model_provider TEXT,
    model_name TEXT,
    enabled_tools TEXT,
    disabled_tools TEXT,
    enabled_skills TEXT,
    guardrail_rules TEXT,
    reports_to TEXT,
    manages TEXT,
    created_at INTEGER NOT NULL,
    updated_at INTEGER NOT NULL,
    FOREIGN KEY (opc_id) REFERENCES opc_config(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_agents_opc_id ON agents(opc_id);
CREATE INDEX IF NOT EXISTS idx_agents_is_default ON agents(is_default);
CREATE INDEX IF NOT EXISTS idx_agents_order_index ON agents(opc_id, order_index);

CREATE TABLE IF NOT EXISTS agent_documents (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    agent_id TEXT NOT NULL,
    document_type TEXT NOT NULL,
    content TEXT NOT NULL,
    UNIQUE(agent_id, document_type),
    FOREIGN KEY (agent_id) REFERENCES agents(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_agent_documents_agent_id ON agent_documents(agent_id);
CREATE INDEX IF NOT EXISTS idx_agent_documents_type ON agent_documents(document_type);

-- ─────────────────────────────────────────────
-- 3. 模型配置表
-- ─────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS model_providers (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    provider_type TEXT NOT NULL,
    api_key TEXT NOT NULL,
    endpoint TEXT,
    is_enabled INTEGER DEFAULT 1,
    is_available INTEGER DEFAULT 0,
    last_tested INTEGER,
    created_at INTEGER NOT NULL,
    updated_at INTEGER NOT NULL,
    UNIQUE(provider_type)
);

CREATE TABLE IF NOT EXISTS model_info (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL UNIQUE,
    display_name TEXT NOT NULL,
    provider_type TEXT NOT NULL,
    context_window INTEGER DEFAULT 0,
    input_price REAL DEFAULT 0.0,
    output_price REAL DEFAULT 0.0,
    supported_types TEXT,
    supports_vision INTEGER DEFAULT 0,
    supports_function_calling INTEGER DEFAULT 0,
    supports_streaming INTEGER DEFAULT 0,
    updated_at INTEGER NOT NULL,
    FOREIGN KEY (provider_type) REFERENCES model_providers(provider_type)
);

CREATE INDEX IF NOT EXISTS idx_model_info_provider ON model_info(provider_type);

-- ─────────────────────────────────────────────
-- 4. 渠道配置表
-- ─────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS channels (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    opc_id TEXT NOT NULL,
    channel_type TEXT NOT NULL,
    is_enabled INTEGER DEFAULT 1,
    feishu_config TEXT,
    is_connected INTEGER DEFAULT 0,
    last_connected INTEGER,
    created_at INTEGER NOT NULL,
    updated_at INTEGER NOT NULL,
    FOREIGN KEY (opc_id) REFERENCES opc_config(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_channels_opc_id ON channels(opc_id);
CREATE INDEX IF NOT EXISTS idx_channels_type ON channels(channel_type);

-- ─────────────────────────────────────────────
-- 5. 绑定配置表
-- ─────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS bindings (
    id TEXT PRIMARY KEY,
    opc_id TEXT NOT NULL,
    channel_id TEXT NOT NULL,
    channel_name TEXT NOT NULL,
    channel_type TEXT NOT NULL,
    agent_id TEXT NOT NULL,
    agent_name TEXT NOT NULL,
    trigger_mode TEXT NOT NULL,
    is_enabled INTEGER DEFAULT 1,
    created_at INTEGER NOT NULL,
    updated_at INTEGER NOT NULL,
    FOREIGN KEY (opc_id) REFERENCES opc_config(id) ON DELETE CASCADE,
    FOREIGN KEY (agent_id) REFERENCES agents(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_bindings_opc_id ON bindings(opc_id);
CREATE INDEX IF NOT EXISTS idx_bindings_channel_id ON bindings(channel_id);
CREATE INDEX IF NOT EXISTS idx_bindings_agent_id ON bindings(agent_id);

CREATE TABLE IF NOT EXISTS opc_defaults (
    opc_id TEXT PRIMARY KEY,
    default_agent TEXT,
    FOREIGN KEY (opc_id) REFERENCES opc_config(id) ON DELETE CASCADE,
    FOREIGN KEY (default_agent) REFERENCES agents(id) ON DELETE SET NULL
);

-- ─────────────────────────────────────────────
-- 6. 工具和技能库表
-- ─────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS tools (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    slug TEXT NOT NULL UNIQUE,
    description TEXT,
    author TEXT,
    size INTEGER DEFAULT 0,
    url TEXT,
    version TEXT,
    updated_at INTEGER NOT NULL,
    tags TEXT,
    category TEXT,
    downloads INTEGER DEFAULT 0,
    is_builtin INTEGER DEFAULT 0,
    last_synced INTEGER
);

CREATE INDEX IF NOT EXISTS idx_tools_category ON tools(category);
CREATE INDEX IF NOT EXISTS idx_tools_is_builtin ON tools(is_builtin);

CREATE TABLE IF NOT EXISTS skills (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    slug TEXT NOT NULL UNIQUE,
    description TEXT,
    author TEXT,
    size INTEGER DEFAULT 0,
    url TEXT,
    version TEXT,
    updated_at INTEGER NOT NULL,
    tags TEXT,
    category TEXT,
    downloads INTEGER DEFAULT 0,
    is_builtin INTEGER DEFAULT 0,
    last_synced INTEGER
);

CREATE INDEX IF NOT EXISTS idx_skills_category ON skills(category);
CREATE INDEX IF NOT EXISTS idx_skills_is_builtin ON skills(is_builtin);

-- ─────────────────────────────────────────────
-- 7. 快照和部署表
-- ─────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS local_snapshots (
    id TEXT PRIMARY KEY,
    label TEXT NOT NULL,
    opc_name TEXT NOT NULL,
    config_data TEXT NOT NULL,
    is_auto INTEGER DEFAULT 0,
    created_at INTEGER NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_snapshots_opc_name ON local_snapshots(opc_name);
CREATE INDEX IF NOT EXISTS idx_snapshots_created_at ON local_snapshots(created_at DESC);

CREATE TABLE IF NOT EXISTS deployment_tasks (
    id TEXT PRIMARY KEY,
    opc_name TEXT NOT NULL,
    status TEXT NOT NULL,
    message TEXT,
    steps TEXT NOT NULL,
    current_step INTEGER DEFAULT 0,
    created_at INTEGER NOT NULL,
    started_at INTEGER,
    completed_at INTEGER
);

CREATE INDEX IF NOT EXISTS idx_deployment_opc_name ON deployment_tasks(opc_name);
CREATE INDEX IF NOT EXISTS idx_deployment_status ON deployment_tasks(status);
CREATE INDEX IF NOT EXISTS idx_deployment_created_at ON deployment_tasks(created_at DESC);

-- ─────────────────────────────────────────────
-- 8. 日志表
-- ─────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS log_entries (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    timestamp INTEGER NOT NULL,
    level TEXT NOT NULL,
    component TEXT,
    message TEXT NOT NULL,
    agent_id TEXT,
    channel TEXT,
    metadata TEXT,
    FOREIGN KEY (agent_id) REFERENCES agents(id) ON DELETE SET NULL
);

CREATE INDEX IF NOT EXISTS idx_log_timestamp ON log_entries(timestamp DESC);
CREATE INDEX IF NOT EXISTS idx_log_level ON log_entries(level);
CREATE INDEX IF NOT EXISTS idx_log_component ON log_entries(component);
CREATE INDEX IF NOT EXISTS idx_log_agent_id ON log_entries(agent_id);
"#;
