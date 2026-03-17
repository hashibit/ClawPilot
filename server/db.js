import Database from 'better-sqlite3'
import { fileURLToPath } from 'url'
import { dirname, join } from 'path'

const __dirname = dirname(fileURLToPath(import.meta.url))
export const DB_PATH = join(__dirname, 'dev.db')

const db = new Database(DB_PATH)

// Enable foreign keys
db.pragma('foreign_keys = ON')
db.pragma('journal_mode = WAL')

// ── Schema ────────────────────────────────────────────────
db.exec(`
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

CREATE TABLE IF NOT EXISTS agent_documents (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    agent_id TEXT NOT NULL,
    document_type TEXT NOT NULL,
    content TEXT NOT NULL,
    UNIQUE(agent_id, document_type),
    FOREIGN KEY (agent_id) REFERENCES agents(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS model_providers (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    provider_type TEXT NOT NULL,
    api_key TEXT NOT NULL DEFAULT '',
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
    supports_vision INTEGER DEFAULT 0,
    supports_function_calling INTEGER DEFAULT 0,
    supports_streaming INTEGER DEFAULT 0,
    updated_at INTEGER NOT NULL
);

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
    FOREIGN KEY (opc_id) REFERENCES opc_config(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS local_snapshots (
    id TEXT PRIMARY KEY,
    label TEXT NOT NULL,
    opc_name TEXT NOT NULL,
    config_data TEXT NOT NULL,
    is_auto INTEGER DEFAULT 0,
    created_at INTEGER NOT NULL
);

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

CREATE TABLE IF NOT EXISTS log_entries (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    timestamp INTEGER NOT NULL,
    level TEXT NOT NULL,
    component TEXT,
    message TEXT NOT NULL,
    agent_id TEXT,
    channel TEXT,
    metadata TEXT
);
`)

// ── Seed Data ─────────────────────────────────────────────
const now = Math.floor(Date.now() / 1000)

db.prepare(`
  INSERT OR IGNORE INTO openclaw_config (id, current_opc, version, last_updated)
  VALUES (1, '', '1.0.0', ?)
`).run(now)

// Seed model providers
const providers = [
  { provider_type: 'BAILIAN' },
  { provider_type: 'VOLCENGINE' },
  { provider_type: 'MINIMAX' },
]
for (const p of providers) {
  db.prepare(`
    INSERT OR IGNORE INTO model_providers (provider_type, api_key, is_enabled, is_available, created_at, updated_at)
    VALUES (?, '', 1, 0, ?, ?)
  `).run(p.provider_type, now, now)
}

// Seed model_info
const models = [
  { name: 'qwen-max', display_name: 'Qwen Max', provider_type: 'BAILIAN', context_window: 32768, input_price: 0.04, output_price: 0.12, supports_vision: 0, supports_function_calling: 1, supports_streaming: 1 },
  { name: 'qwen-plus', display_name: 'Qwen Plus', provider_type: 'BAILIAN', context_window: 131072, input_price: 0.004, output_price: 0.012, supports_vision: 0, supports_function_calling: 1, supports_streaming: 1 },
  { name: 'qwen-turbo', display_name: 'Qwen Turbo', provider_type: 'BAILIAN', context_window: 131072, input_price: 0.002, output_price: 0.006, supports_vision: 0, supports_function_calling: 1, supports_streaming: 1 },
  { name: 'deepseek-v3', display_name: 'DeepSeek V3', provider_type: 'VOLCENGINE', context_window: 65536, input_price: 0.002, output_price: 0.006, supports_vision: 0, supports_function_calling: 1, supports_streaming: 1 },
  { name: 'deepseek-coder', display_name: 'DeepSeek Coder', provider_type: 'VOLCENGINE', context_window: 65536, input_price: 0.002, output_price: 0.006, supports_vision: 0, supports_function_calling: 1, supports_streaming: 1 },
  { name: 'abab6.5-chat', display_name: 'ABAB 6.5 Chat', provider_type: 'MINIMAX', context_window: 245760, input_price: 0.01, output_price: 0.01, supports_vision: 0, supports_function_calling: 1, supports_streaming: 1 },
]
for (const m of models) {
  db.prepare(`
    INSERT OR IGNORE INTO model_info
      (name, display_name, provider_type, context_window, input_price, output_price,
       supports_vision, supports_function_calling, supports_streaming, updated_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(m.name, m.display_name, m.provider_type, m.context_window, m.input_price, m.output_price,
    m.supports_vision, m.supports_function_calling, m.supports_streaming, now)
}

export default db
