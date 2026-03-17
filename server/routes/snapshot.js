import { Router } from 'express'
import db from '../db.js'
import { randomUUID } from 'crypto'

const router = Router()
const now = () => Math.floor(Date.now() / 1000)

// create_snapshot
router.post('/create_snapshot', (req, res) => {
  try {
    const { opc_name, label, config_data } = req.body
    const id = randomUUID()
    db.prepare(`
      INSERT INTO local_snapshots (id, label, opc_name, config_data, is_auto, created_at)
      VALUES (?, ?, ?, ?, 0, ?)
    `).run(id, label, opc_name, config_data, now())
    res.json(id)
  } catch (err) {
    res.status(500).send(err.message)
  }
})

// get_snapshots
router.post('/get_snapshots', (req, res) => {
  try {
    const { opc_name } = req.body
    const rows = db.prepare(
      'SELECT * FROM local_snapshots WHERE opc_name = ? ORDER BY created_at DESC'
    ).all(opc_name)
    res.json(rows)
  } catch (err) {
    res.status(500).send(err.message)
  }
})

// get_snapshot
router.post('/get_snapshot', (req, res) => {
  try {
    const { id } = req.body
    const row = db.prepare('SELECT * FROM local_snapshots WHERE id = ?').get(id)
    if (!row) throw new Error(`Not found: ${id}`)
    res.json(row)
  } catch (err) {
    res.status(500).send(err.message)
  }
})

// restore_snapshot
router.post('/restore_snapshot', (req, res) => {
  try {
    const { id } = req.body
    const snap = db.prepare('SELECT * FROM local_snapshots WHERE id = ?').get(id)
    if (!snap) throw new Error(`Not found: ${id}`)

    const data = JSON.parse(snap.config_data)
    const { opc, agents = [], agent_documents = [], channels = [], bindings = [] } = data

    const t = now()
    const restore = db.transaction(() => {
      db.prepare(`INSERT OR REPLACE INTO opc_config
        (id, name, display_name, description, avatar_color, avatar_initials,
         is_active, is_running, agent_count, channel_count, group_count, dm_count,
         message_count_today, message_growth, created_at, updated_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `).run(
        opc.id, opc.name, opc.display_name, opc.description ?? null,
        opc.avatar_color ?? null, opc.avatar_initials ?? null,
        opc.is_active ? 1 : 0, opc.is_running ? 1 : 0,
        opc.agent_count ?? 0, opc.channel_count ?? 0, opc.group_count ?? 0,
        opc.dm_count ?? 0, opc.message_count_today ?? 0, opc.message_growth ?? 0.0,
        opc.created_at ?? t, t
      )

      for (const agent of agents) {
        const toStr = (v) => (v === undefined || v === null) ? '[]' : (typeof v === 'string' ? v : JSON.stringify(v))
        db.prepare(`INSERT OR REPLACE INTO agents
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

      for (const doc of agent_documents) {
        db.prepare(`INSERT OR REPLACE INTO agent_documents (agent_id, document_type, content) VALUES (?, ?, ?)`)
          .run(doc.agent_id, doc.document_type, doc.content)
      }

      for (const ch of channels) {
        const feishuStr = ch.feishu_config
          ? (typeof ch.feishu_config === 'string' ? ch.feishu_config : JSON.stringify(ch.feishu_config))
          : null
        db.prepare(`INSERT OR REPLACE INTO channels
          (id, opc_id, channel_type, is_enabled, feishu_config, is_connected, last_connected, created_at, updated_at)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
        `).run(
          ch.id, ch.opc_id, ch.channel_type, ch.is_enabled ? 1 : 0, feishuStr,
          ch.is_connected ? 1 : 0, ch.last_connected ?? null, ch.created_at ?? t, t
        )
      }

      for (const b of bindings) {
        db.prepare(`INSERT OR REPLACE INTO bindings
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

    db.prepare(`INSERT INTO log_entries (timestamp, level, component, message) VALUES (?, 'INFO', 'snapshot', ?)`)
      .run(t, `Restored snapshot '${snap.label}' for opc ${opc.name}`)

    res.json(opc.id)
  } catch (err) {
    res.status(500).send(err.message)
  }
})

// delete_snapshot
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
