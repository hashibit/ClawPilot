import { Router } from 'express'
import db from '../db.js'

const router = Router()
const now = () => Math.floor(Date.now() / 1000)

function rowToAgent(row) {
  if (!row) return null
  return {
    ...row,
    is_default: row.is_default === 1,
    enabled_tools: JSON.parse(row.enabled_tools || '[]'),
    disabled_tools: JSON.parse(row.disabled_tools || '[]'),
    enabled_skills: JSON.parse(row.enabled_skills || '[]'),
    guardrail_rules: JSON.parse(row.guardrail_rules || '[]'),
    reports_to: JSON.parse(row.reports_to || '[]'),
    manages: JSON.parse(row.manages || '[]'),
  }
}

function toJsonStr(val) {
  if (val === undefined || val === null) return '[]'
  if (typeof val === 'string') return val
  return JSON.stringify(val)
}

// get_agents
router.post('/get_agents', (req, res) => {
  try {
    const { opc_id } = req.body
    const rows = db.prepare('SELECT * FROM agents WHERE opc_id = ? ORDER BY order_index').all(opc_id)
    res.json(rows.map(rowToAgent))
  } catch (err) {
    res.status(500).send(err.message)
  }
})

// get_agent
router.post('/get_agent', (req, res) => {
  try {
    const { id } = req.body
    const row = db.prepare('SELECT * FROM agents WHERE id = ?').get(id)
    if (!row) throw new Error(`Not found: ${id}`)
    res.json(rowToAgent(row))
  } catch (err) {
    res.status(500).send(err.message)
  }
})

// create_agent
router.post('/create_agent', (req, res) => {
  try {
    const { config } = req.body
    db.prepare(`
      INSERT INTO agents
        (id, opc_id, name, display_name, job_title, personality, description, initials,
         gradient_start, gradient_end, is_default, order_index, model_provider, model_name,
         enabled_tools, disabled_tools, enabled_skills, guardrail_rules, reports_to, manages,
         created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      config.id, config.opc_id, config.name, config.display_name,
      config.job_title ?? null, config.personality ?? null, config.description ?? null,
      config.initials ?? null, config.gradient_start ?? null, config.gradient_end ?? null,
      config.is_default ? 1 : 0, config.order_index ?? 0,
      config.model_provider ?? null, config.model_name ?? null,
      toJsonStr(config.enabled_tools), toJsonStr(config.disabled_tools),
      toJsonStr(config.enabled_skills), toJsonStr(config.guardrail_rules),
      toJsonStr(config.reports_to), toJsonStr(config.manages),
      config.created_at ?? now(), config.updated_at ?? now()
    )
    res.json(config.id)
  } catch (err) {
    res.status(500).send(err.message)
  }
})

// update_agent
router.post('/update_agent', (req, res) => {
  try {
    const { id, config } = req.body
    db.prepare(`
      UPDATE agents SET
        name = ?, display_name = ?, job_title = ?, personality = ?, description = ?,
        initials = ?, gradient_start = ?, gradient_end = ?, is_default = ?, order_index = ?,
        model_provider = ?, model_name = ?,
        enabled_tools = ?, disabled_tools = ?, enabled_skills = ?,
        guardrail_rules = ?, reports_to = ?, manages = ?, updated_at = ?
      WHERE id = ?
    `).run(
      config.name, config.display_name,
      config.job_title ?? null, config.personality ?? null, config.description ?? null,
      config.initials ?? null, config.gradient_start ?? null, config.gradient_end ?? null,
      config.is_default ? 1 : 0, config.order_index ?? 0,
      config.model_provider ?? null, config.model_name ?? null,
      toJsonStr(config.enabled_tools), toJsonStr(config.disabled_tools),
      toJsonStr(config.enabled_skills), toJsonStr(config.guardrail_rules),
      toJsonStr(config.reports_to), toJsonStr(config.manages),
      now(), id
    )
    res.json(null)
  } catch (err) {
    res.status(500).send(err.message)
  }
})

// delete_agent
router.post('/delete_agent', (req, res) => {
  try {
    const { id } = req.body
    db.prepare('DELETE FROM agents WHERE id = ?').run(id)
    res.json(null)
  } catch (err) {
    res.status(500).send(err.message)
  }
})

// reorder_agents
router.post('/reorder_agents', (req, res) => {
  try {
    const { opc_id, agent_ids } = req.body
    const update = db.prepare('UPDATE agents SET order_index = ? WHERE id = ? AND opc_id = ?')
    const reorder = db.transaction(() => {
      for (let i = 0; i < agent_ids.length; i++) {
        update.run(i, agent_ids[i], opc_id)
      }
    })
    reorder()
    res.json(null)
  } catch (err) {
    res.status(500).send(err.message)
  }
})

// get_agent_document
router.post('/get_agent_document', (req, res) => {
  try {
    const { agent_id, doc_type } = req.body
    const row = db.prepare(
      'SELECT content FROM agent_documents WHERE agent_id = ? AND document_type = ?'
    ).get(agent_id, doc_type)
    res.json(row ? row.content : '')
  } catch (err) {
    res.status(500).send(err.message)
  }
})

// update_agent_document
router.post('/update_agent_document', (req, res) => {
  try {
    const { agent_id, doc_type, content } = req.body
    db.prepare(`
      INSERT OR REPLACE INTO agent_documents (agent_id, document_type, content)
      VALUES (?, ?, ?)
    `).run(agent_id, doc_type, content)
    res.json(null)
  } catch (err) {
    res.status(500).send(err.message)
  }
})

export default router
