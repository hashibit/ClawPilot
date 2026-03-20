import { Router } from 'express'
import db from '../db.js'
import { randomUUID } from 'crypto'
import { createLogger } from '../logger.js'
const log = createLogger('snapshot')

const router = Router()
const now = () => Math.floor(Date.now() / 1000)

// ── Helper: collect all data for an OPC ─────────────────────
function collectOpcSnapshot(opcId) {
  const opc = db.prepare('SELECT * FROM opc_config WHERE id = ?').get(opcId)
  if (!opc) throw new Error(`OPC not found: ${opcId}`)

  const agents = db.prepare('SELECT * FROM agents WHERE opc_id = ? ORDER BY order_index').all(opcId)
  const agentIds = agents.map(a => a.id)

  let agentDocuments = []
  if (agentIds.length > 0) {
    const placeholders = agentIds.map(() => '?').join(',')
    agentDocuments = db.prepare(
      `SELECT * FROM agent_documents WHERE agent_id IN (${placeholders})`
    ).all(...agentIds)
  }

  const channels = db.prepare('SELECT * FROM channels WHERE opc_id = ?').all(opcId)
  const bindings = db.prepare('SELECT * FROM bindings WHERE opc_id = ?').all(opcId)

  return { opc, agents, agent_documents: agentDocuments, channels, bindings }
}

// ── POST /api/create_snapshot ────────────────────────────────
// Body: { opc_id, label, is_auto? }
// Server assembles the snapshot payload — frontend does NOT pass config_data
router.post('/create_snapshot', (req, res) => {
  try {
    const { opc_id, label, is_auto = false } = req.body
    if (!opc_id) return res.status(400).send('opc_id is required')
    if (!label?.trim()) return res.status(400).send('label is required')

    const data = collectOpcSnapshot(opc_id)
    const configData = JSON.stringify(data)
    const id = randomUUID()

    db.prepare(`
      INSERT INTO local_snapshots (id, label, opc_name, config_data, is_auto, created_at)
      VALUES (?, ?, ?, ?, ?, ?)
    `).run(id, label.trim(), data.opc.name, configData, is_auto ? 1 : 0, now())

    res.json(id)
  } catch (err) {
    res.status(500).send(err.message)
  }
})

// ── POST /api/get_snapshots ──────────────────────────────────
// Body: { opc_id }
router.post('/get_snapshots', (req, res) => {
  try {
    const { opc_id } = req.body
    if (!opc_id) return res.status(400).send('opc_id is required')

    const opc = db.prepare('SELECT name FROM opc_config WHERE id = ?').get(opc_id)
    const opcName = opc?.name ?? opc_id

    const rows = db.prepare(
      'SELECT id, label, opc_name, is_auto, created_at FROM local_snapshots WHERE opc_name = ? ORDER BY created_at DESC'
    ).all(opcName)

    res.json(rows.map(r => ({ ...r, is_auto: r.is_auto === 1 })))
  } catch (err) {
    res.status(500).send(err.message)
  }
})

// ── POST /api/get_snapshot ───────────────────────────────────
router.post('/get_snapshot', (req, res) => {
  try {
    const { id } = req.body
    const row = db.prepare('SELECT * FROM local_snapshots WHERE id = ?').get(id)
    if (!row) throw new Error(`Not found: ${id}`)

    // Parse config_data to return a summary (without large doc content)
    let summary = null
    try {
      const d = JSON.parse(row.config_data)
      summary = {
        agent_count: d.agents?.length ?? 0,
        channel_count: d.channels?.length ?? 0,
        binding_count: d.bindings?.length ?? 0,
        doc_count: d.agent_documents?.length ?? 0,
      }
    } catch {}

    res.json({ ...row, is_auto: row.is_auto === 1, summary })
  } catch (err) {
    res.status(500).send(err.message)
  }
})

// ── POST /api/restore_snapshot ───────────────────────────────
router.post('/restore_snapshot', (req, res) => {
  try {
    const { id } = req.body
    const snap = db.prepare('SELECT * FROM local_snapshots WHERE id = ?').get(id)
    if (!snap) throw new Error(`Snapshot not found: ${id}`)

    const data = JSON.parse(snap.config_data)
    const { opc, agents = [], agent_documents = [], channels = [], bindings = [] } = data

    const t = now()

    const toStr = (v) => {
      if (v === undefined || v === null) return '[]'
      if (typeof v === 'string') return v
      return JSON.stringify(v)
    }

    const toJsonOrNull = (v) => {
      if (!v) return null
      if (typeof v === 'string') return v
      return JSON.stringify(v)
    }

    const restore = db.transaction(() => {
      // Restore OPC
      db.prepare(`
        INSERT OR REPLACE INTO opc_config
          (id, name, display_name, description, avatar_color, avatar_initials,
           is_active, is_running, agent_count, channel_count, group_count, dm_count,
           message_count_today, message_growth, created_at, updated_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `).run(
        opc.id, opc.name, opc.display_name, opc.description ?? null,
        opc.avatar_color ?? null, opc.avatar_initials ?? null,
        opc.is_active ? 1 : 0,
        0, // is_running always reset to 0 after restore
        opc.agent_count ?? 0, opc.channel_count ?? 0,
        opc.group_count ?? 0, opc.dm_count ?? 0,
        opc.message_count_today ?? 0, opc.message_growth ?? 0.0,
        opc.created_at ?? t, t
      )

      // Delete existing agents (cascade deletes agent_documents via FK)
      db.prepare('DELETE FROM agents WHERE opc_id = ?').run(opc.id)

      // Restore agents
      for (const agent of agents) {
        db.prepare(`
          INSERT INTO agents
            (id, opc_id, name, display_name, job_title, personality, description, initials,
             gradient_start, gradient_end, is_default, order_index, model_provider, model_name,
             enabled_tools, disabled_tools, enabled_skills, guardrail_rules, reports_to, manages,
             created_at, updated_at)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        `).run(
          agent.id, agent.opc_id, agent.name, agent.display_name,
          agent.job_title ?? null, agent.personality ?? null, agent.description ?? null,
          agent.initials ?? null, agent.gradient_start ?? null, agent.gradient_end ?? null,
          agent.is_default ? 1 : 0, agent.order_index ?? 0,
          agent.model_provider ?? null, agent.model_name ?? null,
          toStr(agent.enabled_tools), toStr(agent.disabled_tools),
          toStr(agent.enabled_skills), toStr(agent.guardrail_rules),
          toStr(agent.reports_to), toStr(agent.manages),
          agent.created_at ?? t, t
        )
      }

      // Restore agent documents
      for (const doc of agent_documents) {
        db.prepare(`
          INSERT OR REPLACE INTO agent_documents (agent_id, document_type, content)
          VALUES (?, ?, ?)
        `).run(doc.agent_id, doc.document_type, doc.content)
      }

      // Delete existing channels & bindings for this OPC
      db.prepare('DELETE FROM channels WHERE opc_id = ?').run(opc.id)
      db.prepare('DELETE FROM bindings WHERE opc_id = ?').run(opc.id)

      // Restore channels (feishu + dingtalk + slack)
      for (const ch of channels) {
        db.prepare(`
          INSERT INTO channels
            (id, opc_id, channel_type, is_enabled, feishu_config, dingtalk_config, slack_config,
             is_connected, last_connected, created_at, updated_at)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        `).run(
          ch.id, ch.opc_id, ch.channel_type,
          ch.is_enabled ? 1 : 0,
          toJsonOrNull(ch.feishu_config),
          toJsonOrNull(ch.dingtalk_config),
          toJsonOrNull(ch.slack_config),
          0, null,
          ch.created_at ?? t, t
        )
      }

      // Restore bindings
      for (const b of bindings) {
        db.prepare(`
          INSERT INTO bindings
            (id, opc_id, channel_id, channel_name, channel_type, agent_id, agent_name,
             trigger_mode, is_enabled, created_at, updated_at)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        `).run(
          b.id, b.opc_id, b.channel_id, b.channel_name, b.channel_type,
          b.agent_id, b.agent_name, b.trigger_mode,
          b.is_enabled ? 1 : 0, b.created_at ?? t, t
        )
      }
    })

    restore()

    db.prepare(`
      INSERT INTO log_entries (timestamp, level, component, message)
      VALUES (?, 'INFO', 'snapshot', ?)
    `).run(t, `Restored snapshot '${snap.label}' → opc '${opc.name}'`)

    res.json(opc.id)
  } catch (err) {
    res.status(500).send(err.message)
  }
})

// ── POST /api/delete_snapshot ────────────────────────────────
router.post('/delete_snapshot', (req, res) => {
  try {
    const { id } = req.body
    db.prepare('DELETE FROM local_snapshots WHERE id = ?').run(id)
    res.json(null)
  } catch (err) {
    res.status(500).send(err.message)
  }
})

export default router
