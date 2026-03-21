import Database from 'better-sqlite3'
import { applySchema, runMigrations, seedBaseData } from '../../db.js'

/**
 * 创建隔离的内存数据库实例，含完整 schema 和基础种子数据
 */
export function createTestDb() {
  const db = new Database(':memory:')
  db.pragma('foreign_keys = ON')
  db.pragma('journal_mode = WAL')
  applySchema(db)
  runMigrations(db)
  seedBaseData(db)
  return db
}

// --- 数据工厂函数 ---

let counter = 0
const now = () => Math.floor(Date.now() / 1000)
const uniqueId = (prefix) => `${prefix}-${now()}-${++counter}`

export function makeOpc(db, overrides = {}) {
  const id = uniqueId('opc')
  const data = {
    id,
    name: `Test OPC ${id}`,
    display_name: 'Test OPC',
    description: '',
    avatar_color: null,
    avatar_initials: null,
    is_active: 0,
    is_running: 0,
    agent_count: 0,
    channel_count: 0,
    group_count: 0,
    dm_count: 0,
    message_count_today: 0,
    message_growth: 0.0,
    created_at: now(),
    updated_at: now(),
    ...overrides
  }
  db.prepare(`
    INSERT INTO opc_config (id, name, display_name, description, avatar_color, avatar_initials,
      is_active, is_running, agent_count, channel_count, group_count, dm_count,
      message_count_today, message_growth, created_at, updated_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(
    data.id, data.name, data.display_name, data.description,
    data.avatar_color, data.avatar_initials, data.is_active, data.is_running,
    data.agent_count, data.channel_count, data.group_count, data.dm_count,
    data.message_count_today, data.message_growth, data.created_at, data.updated_at
  )
  return data
}

export function makeAgent(db, opcId, overrides = {}) {
  const id = uniqueId('agent')
  const data = {
    id,
    opc_id: opcId,
    name: `test_agent_${id}`,
    display_name: 'Test Agent',
    job_title: null,
    personality: null,
    description: null,
    initials: null,
    gradient_start: null,
    gradient_end: null,
    is_default: 0,
    order_index: 0,
    model_provider: null,
    model_name: null,
    enabled_tools: '[]',
    disabled_tools: '[]',
    enabled_skills: '[]',
    guardrail_rules: '[]',
    reports_to: '[]',
    manages: '[]',
    created_at: now(),
    updated_at: now(),
    ...overrides
  }
  db.prepare(`
    INSERT INTO agents (id, opc_id, name, display_name, job_title, personality, description,
      initials, gradient_start, gradient_end, is_default, order_index, model_provider, model_name,
      enabled_tools, disabled_tools, enabled_skills, guardrail_rules, reports_to, manages,
      created_at, updated_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(
    data.id, data.opc_id, data.name, data.display_name, data.job_title,
    data.personality, data.description, data.initials, data.gradient_start,
    data.gradient_end, data.is_default, data.order_index, data.model_provider,
    data.model_name, data.enabled_tools, data.disabled_tools, data.enabled_skills,
    data.guardrail_rules, data.reports_to, data.manages, data.created_at, data.updated_at
  )
  // 初始化 7 种文档
  const docTypes = ['SOUL', 'IDENTITY', 'AGENTS', 'USER', 'MEMORY', 'HEARTBEAT', 'TOOLS']
  for (const type of docTypes) {
    db.prepare(`
      INSERT INTO agent_documents (agent_id, document_type, content) VALUES (?, ?, '')
    `).run(data.id, type)
  }
  return data
}

let channelCounter = 0

export function makeChannel(db, opcId, overrides = {}) {
  const id = ++channelCounter  // INTEGER ID
  const data = {
    id,
    opc_id: opcId,
    channel_type: 'FEISHU',
    is_enabled: 1,
    feishu_config: null,
    dingtalk_config: null,
    slack_config: null,
    is_connected: 0,
    last_connected: null,
    created_at: now(),
    updated_at: now(),
    ...overrides
  }
  db.prepare(`
    INSERT INTO channels (id, opc_id, channel_type, is_enabled, feishu_config,
      dingtalk_config, slack_config, is_connected, last_connected, created_at, updated_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(
    data.id, data.opc_id, data.channel_type, data.is_enabled, data.feishu_config,
    data.dingtalk_config, data.slack_config, data.is_connected, data.last_connected,
    data.created_at, data.updated_at
  )
  return data
}

export function makeBinding(db, opcId, agentId, channelId, overrides = {}) {
  const id = uniqueId('binding')
  const data = {
    id,
    opc_id: opcId,
    channel_id: channelId,
    channel_name: 'Test Channel',
    channel_type: 'FEISHU',
    agent_id: agentId,
    agent_name: 'Test Agent',
    trigger_mode: 'MENTION',
    is_enabled: 1,
    created_at: now(),
    updated_at: now(),
    ...overrides
  }
  db.prepare(`
    INSERT INTO bindings (id, opc_id, channel_id, channel_name, channel_type,
      agent_id, agent_name, trigger_mode, is_enabled, created_at, updated_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(
    data.id, data.opc_id, data.channel_id, data.channel_name, data.channel_type,
    data.agent_id, data.agent_name, data.trigger_mode, data.is_enabled,
    data.created_at, data.updated_at
  )
  return data
}

export function makeOffice(db, overrides = {}) {
  const id = uniqueId('office')
  const data = {
    id,
    name: `Test Office ${id}`,
    address: null,
    access_card: null,
    phone: null,
    receptionist_image: null,
    ownership: 'RENTED',
    monthly_rent: null,
    internet_speed: null,
    decoration_grade: 'MEDIUM',
    description: null,
    daemon_url: null,
    daemon_api_key: null,
    created_at: now(),
    updated_at: now(),
    ...overrides
  }
  db.prepare(`
    INSERT INTO offices (id, name, address, access_card, phone, receptionist_image,
      ownership, monthly_rent, internet_speed, decoration_grade, description,
      daemon_url, daemon_api_key, created_at, updated_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(
    data.id, data.name, data.address, data.access_card, data.phone,
    data.receptionist_image, data.ownership, data.monthly_rent,
    data.internet_speed, data.decoration_grade, data.description,
    data.daemon_url, data.daemon_api_key, data.created_at, data.updated_at
  )
  return data
}

export function makeSnapshot(db, opcName, overrides = {}) {
  const id = uniqueId('snapshot')
  const data = {
    id,
    label: `Test Snapshot ${id}`,
    opc_name: opcName,
    config_data: '{}',
    is_auto: 0,
    created_at: now(),
    ...overrides
  }
  db.prepare(`
    INSERT INTO local_snapshots (id, label, opc_name, config_data, is_auto, created_at)
    VALUES (?, ?, ?, ?, ?, ?)
  `).run(data.id, data.label, data.opc_name, data.config_data, data.is_auto, data.created_at)
  return data
}

export function makeSkill(db, overrides = {}) {
  const id = uniqueId('skill')
  const data = {
    name: `skill-${id}`,
    display_name: 'Test Skill',
    description: '',
    category: 'general',
    is_local: 1,
    created_at: now(),
    ...overrides
  }
  const result = db.prepare(`
    INSERT INTO skills (name, display_name, description, category, is_local, created_at)
    VALUES (?, ?, ?, ?, ?, ?)
  `).run(data.name, data.display_name, data.description, data.category, data.is_local, data.created_at)
  return { ...data, id: result.lastInsertRowid }
}

export function makeTool(db, overrides = {}) {
  const id = uniqueId('tool')
  const data = {
    name: `tool-${id}`,
    display_name: 'Test Tool',
    description: '',
    category: 'general',
    is_local: 1,
    created_at: now(),
    ...overrides
  }
  const result = db.prepare(`
    INSERT INTO tools (name, display_name, description, category, is_local, created_at)
    VALUES (?, ?, ?, ?, ?, ?)
  `).run(data.name, data.display_name, data.description, data.category, data.is_local, data.created_at)
  return { ...data, id: result.lastInsertRowid }
}
