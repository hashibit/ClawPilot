/// 単一フラットスキーマ：すべてのテーブルと列を一度に定義する。
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
/// Pro 機能表（users, auth_tokens, subscriptions, orders,
/// templates, cloud_snapshots, selector_configs）は含まない。
pub const SCHEMA: &str = r#"
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
    office_id TEXT,
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
    model TEXT,
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
    created_at INTEGER,
    updated_at INTEGER,
    UNIQUE(agent_id, document_type),
    FOREIGN KEY (agent_id) REFERENCES agents(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_agent_documents_agent_id ON agent_documents(agent_id);
CREATE INDEX IF NOT EXISTS idx_agent_documents_type ON agent_documents(document_type);

-- ─────────────────────────────────────────────
-- 3. 模型配置表
-- ─────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS model_providers_v2 (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL UNIQUE,
    api TEXT NOT NULL,
    base_url TEXT NOT NULL DEFAULT '',
    api_key TEXT NOT NULL DEFAULT '',
    is_enabled INTEGER NOT NULL DEFAULT 1,
    is_available INTEGER NOT NULL DEFAULT 0,
    last_tested INTEGER,
    created_at INTEGER NOT NULL,
    updated_at INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS model_info_v2 (
    id TEXT PRIMARY KEY,
    provider_name TEXT NOT NULL,
    model_id TEXT NOT NULL,
    display_name TEXT NOT NULL,
    context_window INTEGER NOT NULL DEFAULT 0,
    max_tokens INTEGER NOT NULL DEFAULT 0,
    input_types TEXT NOT NULL DEFAULT '["text"]',
    cost_input REAL NOT NULL DEFAULT 0,
    cost_output REAL NOT NULL DEFAULT 0,
    supports_vision INTEGER NOT NULL DEFAULT 0,
    supports_function_calling INTEGER NOT NULL DEFAULT 0,
    supports_streaming INTEGER NOT NULL DEFAULT 1,
    is_custom INTEGER NOT NULL DEFAULT 0,
    sort_order INTEGER NOT NULL DEFAULT 0,
    updated_at INTEGER NOT NULL,
    UNIQUE(provider_name, model_id)
);

CREATE INDEX IF NOT EXISTS idx_model_providers_v2_name ON model_providers_v2(name);
CREATE INDEX IF NOT EXISTS idx_model_info_v2_provider ON model_info_v2(provider_name);

-- ─────────────────────────────────────────────
-- 4. 渠道配置表
-- ─────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS channels (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    opc_id TEXT NOT NULL,
    channel_type TEXT NOT NULL,
    is_enabled INTEGER DEFAULT 1,
    feishu_config TEXT,
    dingtalk_config TEXT,
    slack_config TEXT,
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

-- ─────────────────────────────────────────────
-- 6. 工具和技能库表
-- ─────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS tools (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL UNIQUE,
    display_name TEXT NOT NULL,
    description TEXT,
    category TEXT DEFAULT 'general',
    is_local INTEGER NOT NULL DEFAULT 1,
    created_at INTEGER NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_tools_category ON tools(category);

CREATE TABLE IF NOT EXISTS skills (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL UNIQUE,
    display_name TEXT NOT NULL DEFAULT '',
    description TEXT,
    category TEXT DEFAULT 'general',
    slug TEXT UNIQUE,
    version TEXT,
    author TEXT,
    tags TEXT,
    url TEXT,
    download_url TEXT,
    is_local INTEGER NOT NULL DEFAULT 1,
    is_installed INTEGER NOT NULL DEFAULT 0,
    install_path TEXT,
    installed_at INTEGER,
    created_at INTEGER NOT NULL,
    last_synced INTEGER
);

CREATE INDEX IF NOT EXISTS idx_skills_category ON skills(category);

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
    access_auth_type TEXT,
    access_user TEXT,
    access_password TEXT,
    ssh_key_path TEXT,
    opc_root TEXT,
    initial_openclaw_config TEXT,
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

CREATE TABLE IF NOT EXISTS deployment_tasks (
    id TEXT PRIMARY KEY,
    opc_name TEXT NOT NULL,
    status TEXT NOT NULL,
    message TEXT,
    steps TEXT NOT NULL,
    current_step INTEGER DEFAULT 0,
    created_at INTEGER NOT NULL,
    started_at INTEGER,
    completed_at INTEGER,
    opc_id TEXT,
    office_id TEXT,
    daemon_task_id TEXT,
    updated_at INTEGER
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

-- ── Global Settings ──────────────────────────────────────
CREATE TABLE IF NOT EXISTS settings (
    key TEXT PRIMARY KEY,
    value TEXT
);
"#;
