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

// ── Migrations ────────────────────────────────────────────
;['base_url TEXT NOT NULL DEFAULT \'\'', 'is_coding_plan INTEGER NOT NULL DEFAULT 0'].forEach(col => {
  try { db.exec(`ALTER TABLE model_providers ADD COLUMN ${col}`) } catch {}
})

// Office table
db.exec(`
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
    created_at INTEGER NOT NULL,
    updated_at INTEGER NOT NULL
);
`)

// Add office_id to opc_config
try { db.exec('ALTER TABLE opc_config ADD COLUMN office_id TEXT') } catch {}

// Office deployment history
db.exec(`CREATE TABLE IF NOT EXISTS office_deployments (
    id TEXT PRIMARY KEY,
    opc_id TEXT NOT NULL,
    opc_name TEXT NOT NULL,
    office_id TEXT NOT NULL,
    office_name TEXT NOT NULL,
    deployed_at INTEGER NOT NULL,
    undeployed_at INTEGER,
    is_active INTEGER NOT NULL DEFAULT 1
);`)

// Add opc_id/office_id to deployment_tasks
try { db.exec('ALTER TABLE deployment_tasks ADD COLUMN opc_id TEXT') } catch {}
try { db.exec('ALTER TABLE deployment_tasks ADD COLUMN office_id TEXT') } catch {}

// ── Seed Data ─────────────────────────────────────────────
const now = Math.floor(Date.now() / 1000)

db.prepare(`
  INSERT OR IGNORE INTO openclaw_config (id, current_opc, version, last_updated)
  VALUES (1, '', '1.0.0', ?)
`).run(now)

// Seed model providers (BAILIAN only; VOLCENGINE/MINIMAX kept for compat)
for (const pt of ['BAILIAN', 'VOLCENGINE', 'MINIMAX']) {
  db.prepare(`
    INSERT OR IGNORE INTO model_providers (provider_type, api_key, base_url, is_coding_plan, is_enabled, is_available, created_at, updated_at)
    VALUES (?, '', '', 0, 1, 0, ?, ?)
  `).run(pt, now, now)
}

// Seed BAILIAN Coding Plan models (replace old BAILIAN models on first run)
const newModelExists = db.prepare("SELECT id FROM model_info WHERE name = 'qwen3.5-plus'").get()
if (!newModelExists) {
  db.prepare("DELETE FROM model_info WHERE provider_type = 'BAILIAN'").run()
  const bailianModels = [
    { name: 'qwen3.5-plus',          display_name: 'Qwen3.5 Plus',          context_window: 1000000, supports_vision: 1 },
    { name: 'qwen3-max-2026-01-23',  display_name: 'Qwen3 Max (0123)',       context_window: 262144,  supports_vision: 0 },
    { name: 'qwen3-coder-next',       display_name: 'Qwen3 Coder Next',       context_window: 262144,  supports_vision: 0 },
    { name: 'qwen3-coder-plus',       display_name: 'Qwen3 Coder Plus',       context_window: 1000000, supports_vision: 0 },
    { name: 'MiniMax-M2.5',           display_name: 'MiniMax M2.5',           context_window: 196608,  supports_vision: 0 },
    { name: 'glm-5',                  display_name: 'GLM-5',                  context_window: 202752,  supports_vision: 0 },
    { name: 'glm-4.7',               display_name: 'GLM-4.7',                context_window: 202752,  supports_vision: 0 },
    { name: 'kimi-k2.5',             display_name: 'Kimi K2.5',              context_window: 262144,  supports_vision: 1 },
  ]
  for (const m of bailianModels) {
    db.prepare(`
      INSERT OR IGNORE INTO model_info
        (name, display_name, provider_type, context_window, input_price, output_price,
         supports_vision, supports_function_calling, supports_streaming, updated_at)
      VALUES (?, ?, 'BAILIAN', ?, 0, 0, ?, 0, 1, ?)
    `).run(m.name, m.display_name, m.context_window, m.supports_vision, now)
  }
}

export default db
