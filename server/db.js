import Database from 'better-sqlite3'
import { fileURLToPath } from 'url'
import { dirname, join } from 'path'
import { homedir } from 'os'
import { mkdirSync, existsSync } from 'fs'

const __dirname = dirname(fileURLToPath(import.meta.url))

// Default to ~/.clawpilot/clawpilot.db (same as Tauri app)
// Falls back to ./dev.db if CLAWPILOT_DB_PATH is not set and home dir is unavailable
function getDefaultDbPath() {
  const home = homedir()
  if (home) {
    return join(home, '.clawpilot', 'clawpilot.db')
  }
  // Fallback for dev environment
  return join(__dirname, 'dev.db')
}

export const DB_PATH = process.env.CLAWPILOT_DB_PATH || getDefaultDbPath()

// Ensure parent directory exists before creating the database
function ensureParentDir(path) {
  const parent = dirname(path)
  if (!existsSync(parent)) {
    mkdirSync(parent, { recursive: true })
  }
}

// ── Schema & Migrations ────────────────────────────────────

export function applySchema(db) {
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
}

// ── Migration helper ───────────────────────────────────────
// Silently skips "column already exists" (idempotent migrations),
// but throws on any real database error so failures are visible.

// Whitelist of valid table names to prevent SQL injection
const VALID_TABLES = new Set([
  'openclaw_config', 'opc_config', 'agents', 'agent_documents',
  'model_providers', 'model_providers_v2', 'model_info', 'model_info_v2',
  'channels', 'bindings', 'local_snapshots', 'deployment_tasks',
  'log_entries', 'tools', 'skills', 'offices', 'office_deployments'
])

function safeAddColumn(db, table, colDef) {
  // Validate table name against whitelist
  if (!VALID_TABLES.has(table)) {
    throw new Error(`[db] Invalid table name: ${table}`)
  }
  const colName = colDef.trim().split(/\s+/)[0]
  const cols = db.prepare(`PRAGMA table_info("${table.replace(/"/g, '""')}")`).all()
  if (cols.some(c => c.name === colName)) return
  db.exec(`ALTER TABLE "${table.replace(/"/g, '""')}" ADD COLUMN ${colDef}`)
}

export function runMigrations(db) {
  // Migrations for model_providers - SQLite doesn't support DEFAULT in ALTER TABLE ADD COLUMN
  ;['base_url TEXT DEFAULT \'\'', 'is_coding_plan INTEGER DEFAULT 0'].forEach(col => {
    safeAddColumn(db, 'model_providers', col)
  })

  // Tools & Skills tables
  db.exec(`
    CREATE TABLE IF NOT EXISTS tools (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        name TEXT NOT NULL UNIQUE,
        display_name TEXT NOT NULL,
        description TEXT,
        category TEXT DEFAULT 'general',
        is_local INTEGER NOT NULL DEFAULT 1,
        created_at INTEGER NOT NULL
    );

    CREATE TABLE IF NOT EXISTS skills (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        name TEXT NOT NULL UNIQUE,
        display_name TEXT NOT NULL,
        description TEXT,
        category TEXT DEFAULT 'general',
        is_local INTEGER NOT NULL DEFAULT 1,
        created_at INTEGER NOT NULL
    );
  `)

  // Multi-channel support
  ;['dingtalk_config TEXT', 'slack_config TEXT'].forEach(col => {
    safeAddColumn(db, 'channels', col)
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
  safeAddColumn(db, 'opc_config', 'office_id TEXT')

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
  ;['opc_id TEXT', 'office_id TEXT', 'daemon_task_id TEXT', 'updated_at INTEGER'].forEach(col => {
    safeAddColumn(db, 'deployment_tasks', col)
  })

  // Daemon fields for offices - SQLite doesn't support DEFAULT in ALTER TABLE ADD COLUMN
  ;[
    'daemon_url TEXT', 'daemon_api_key TEXT',
    "access_auth_type TEXT DEFAULT 'password'",
    'access_user TEXT', 'access_password TEXT', 'ssh_key_path TEXT',
    'initial_openclaw_config TEXT',
    'opc_root TEXT',  // 可配置的部署目录
  ].forEach(col => safeAddColumn(db, 'offices', col))

  // Skills table extended fields
  ;['slug TEXT', 'author TEXT', 'version TEXT', 'url TEXT', 'download_url TEXT',
    'tags TEXT', 'installed_at INTEGER', 'is_installed INTEGER DEFAULT 0', 'install_path TEXT',
  ].forEach(col => safeAddColumn(db, 'skills', col))

  // Migration: add model field to agents table (replaces model_provider + model_name)
  safeAddColumn(db, 'agents', 'model TEXT')

  // Migration: add timestamps to agent_documents
  safeAddColumn(db, 'agent_documents', 'created_at INTEGER')
  safeAddColumn(db, 'agent_documents', 'updated_at INTEGER')

  // Migration: rebuild model_providers with new schema (name-based, not provider_type-based)
  // 新表用 _v2 后缀先建，再重命名
  db.exec(`
    CREATE TABLE IF NOT EXISTS model_providers_v2 (
      id          TEXT NOT NULL PRIMARY KEY,
      name        TEXT NOT NULL,
      api         TEXT NOT NULL DEFAULT 'openai-completions',
      base_url    TEXT NOT NULL DEFAULT '',
      api_key     TEXT NOT NULL DEFAULT '',
      is_enabled  INTEGER NOT NULL DEFAULT 1,
      is_available INTEGER NOT NULL DEFAULT 0,
      last_tested INTEGER,
      created_at  INTEGER NOT NULL,
      updated_at  INTEGER NOT NULL,
      UNIQUE(name)
    );

    CREATE TABLE IF NOT EXISTS model_info_v2 (
      id                        TEXT NOT NULL PRIMARY KEY,
      provider_name             TEXT NOT NULL,
      model_id                  TEXT NOT NULL,
      display_name              TEXT NOT NULL DEFAULT '',
      context_window            INTEGER NOT NULL DEFAULT 0,
      max_tokens                INTEGER NOT NULL DEFAULT 0,
      input_types               TEXT NOT NULL DEFAULT '["text"]',
      cost_input                REAL NOT NULL DEFAULT 0,
      cost_output               REAL NOT NULL DEFAULT 0,
      supports_vision           INTEGER NOT NULL DEFAULT 0,
      supports_function_calling INTEGER NOT NULL DEFAULT 0,
      supports_streaming        INTEGER NOT NULL DEFAULT 1,
      is_custom                 INTEGER NOT NULL DEFAULT 0,
      sort_order                INTEGER NOT NULL DEFAULT 0,
      updated_at                INTEGER NOT NULL,
      UNIQUE(provider_name, model_id),
      FOREIGN KEY (provider_name) REFERENCES model_providers_v2(name) ON DELETE CASCADE
    );
  `)

  // Indexes for high-frequency foreign key lookups
  db.exec(`
    CREATE INDEX IF NOT EXISTS idx_agents_opc_id           ON agents(opc_id);
    CREATE INDEX IF NOT EXISTS idx_channels_opc_id         ON channels(opc_id);
    CREATE INDEX IF NOT EXISTS idx_bindings_opc_id         ON bindings(opc_id);
    CREATE INDEX IF NOT EXISTS idx_bindings_agent_id       ON bindings(agent_id);
    CREATE INDEX IF NOT EXISTS idx_agent_documents_agent   ON agent_documents(agent_id);
    CREATE INDEX IF NOT EXISTS idx_office_deployments_opc  ON office_deployments(opc_id);
    CREATE INDEX IF NOT EXISTS idx_office_deployments_off  ON office_deployments(office_id);
    CREATE INDEX IF NOT EXISTS idx_deployment_tasks_opc    ON deployment_tasks(opc_id);
    CREATE INDEX IF NOT EXISTS idx_log_entries_timestamp   ON log_entries(timestamp);
    CREATE INDEX IF NOT EXISTS idx_model_info_provider     ON model_info_v2(provider_name);
  `)
}

export function seedBaseData(db) {
  const now = Math.floor(Date.now() / 1000)

  // Seed openclaw_config
  db.prepare(`
    INSERT OR IGNORE INTO openclaw_config (id, current_opc, version, last_updated)
    VALUES (1, '', '1.0.0', ?)
  `).run(now)

  // Seed model_providers_v2 - 初始化为空，让用户自己配置
  // Seed model_info_v2 - 初始化为空，让用户自己配置

  // Seed offices - 添加本地 office 占位符，方便用户配置 daemon
  const localOfficeExists = db.prepare("SELECT id FROM offices WHERE address = 'localhost'").get()
  if (!localOfficeExists) {
    db.prepare(`
      INSERT OR IGNORE INTO offices (id, name, address, ownership, decoration_grade, created_at, updated_at)
      VALUES ('local-dev', '本机办公室', 'localhost', 'OWNED', 'MEDIUM', ?, ?)
    `).run(now, now)
  }
}

// ── Factory Function ───────────────────────────────────────

export function createDb(path = DB_PATH) {
  ensureParentDir(path)
  const db = new Database(path)
  db.pragma('foreign_keys = ON')
  db.pragma('journal_mode = WAL')
  return db
}

// ── Default Export (Production) ────────────────────────────

const db = createDb(DB_PATH)
applySchema(db)
runMigrations(db)
seedBaseData(db)

export default db
