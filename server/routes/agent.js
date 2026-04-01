import { Router } from 'express'
import { createLogger } from '../logger.js'

const now = () => Math.floor(Date.now() / 1000)

function parseGuardrail(raw) {
  if (!raw) return { allow: [], deny: [] }
  try {
    const parsed = JSON.parse(raw)
    if (Array.isArray(parsed)) return { allow: parsed, deny: [] }
    return { allow: parsed.allow ?? [], deny: parsed.deny ?? [] }
  } catch { return { allow: [], deny: [] } }
}

function rowToAgent(row) {
  if (!row) return null
  const guardrail = parseGuardrail(row.guardrail_rules)
  return {
    ...row,
    is_default: row.is_default === 1,
    enabled_tools: JSON.parse(row.enabled_tools || '[]'),
    disabled_tools: JSON.parse(row.disabled_tools || '[]'),
    enabled_skills: JSON.parse(row.enabled_skills || '[]'),
    guardrail_rules: guardrail.allow,
    guardrail_allow: guardrail.allow,
    guardrail_deny: guardrail.deny,
    reports_to: JSON.parse(row.reports_to || '[]'),
    manages: JSON.parse(row.manages || '[]'),
  }
}

function serializeGuardrail(config) {
  const allow = config.guardrail_allow ?? config.guardrail_rules ?? []
  const deny = config.guardrail_deny ?? []
  return JSON.stringify({ allow, deny })
}

function toJsonStr(val) {
  if (val === undefined || val === null) return '[]'
  if (typeof val === 'string') return val
  return JSON.stringify(val)
}

export function createAgentRouter(db) {
  const log = createLogger('agent')
  const router = Router()

  function writeLog(level, message) {
    try {
      db.prepare('INSERT INTO log_entries (timestamp, level, component, message) VALUES (?, ?, ?, ?)')
        .run(Math.floor(Date.now() / 1000), level, 'agent', message)
    } catch (_) {}
    const lvl = level.toLowerCase()
    if (lvl === 'error') log.error(message)
    else if (lvl === 'warn') log.warn(message)
    else log.info(message)
  }

  // get_agents
  router.post('/get_agents', (req, res) => {
    try {
      const { opc_id } = req.body
      const rows = db.prepare('SELECT * FROM agents WHERE opc_id = ? ORDER BY order_index').all(opc_id)
      res.json(rows.map(rowToAgent))
    } catch (err) {
      res.status(500).json({ error: err.message })
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
      res.status(500).json({ error: err.message })
    }
  })

  // create_agent
  router.post('/create_agent', (req, res) => {
    try {
      const { config } = req.body
      if (!config.name) throw new Error('Agent name cannot be empty')
      const existing = db.prepare('SELECT COUNT(*) as cnt FROM agents WHERE opc_id = ?').get(config.opc_id)
      if (existing.cnt === 0) config.is_default = true
      db.prepare(`
        INSERT INTO agents
          (id, opc_id, name, display_name, job_title, personality, description, initials,
           gradient_start, gradient_end, is_default, order_index, model,
           enabled_tools, disabled_tools, enabled_skills, guardrail_rules, reports_to, manages,
           created_at, updated_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `).run(
        config.id, config.opc_id, config.name, config.display_name,
        config.job_title ?? null, config.personality ?? null, config.description ?? null,
        config.initials ?? null, config.gradient_start ?? null, config.gradient_end ?? null,
        config.is_default ? 1 : 0, config.order_index ?? 0,
        config.model ?? null,
        toJsonStr(config.enabled_tools), toJsonStr(config.disabled_tools),
        toJsonStr(config.enabled_skills), serializeGuardrail(config),
        toJsonStr(config.reports_to), toJsonStr(config.manages),
        config.created_at ?? now(), config.updated_at ?? now()
      )
      writeLog('INFO', `Agent 已创建: ${config.name} (${config.id}) in opc ${config.opc_id}`)
      res.json(config.id)
    } catch (err) {
      res.status(500).json({ error: err.message })
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
          model = ?,
          enabled_tools = ?, disabled_tools = ?, enabled_skills = ?,
          guardrail_rules = ?, reports_to = ?, manages = ?, updated_at = ?
        WHERE id = ?
      `).run(
        config.name, config.display_name,
        config.job_title ?? null, config.personality ?? null, config.description ?? null,
        config.initials ?? null, config.gradient_start ?? null, config.gradient_end ?? null,
        config.is_default ? 1 : 0, config.order_index ?? 0,
        config.model ?? null,
        toJsonStr(config.enabled_tools), toJsonStr(config.disabled_tools),
        toJsonStr(config.enabled_skills), serializeGuardrail(config),
        toJsonStr(config.reports_to), toJsonStr(config.manages),
        now(), id
      )
      res.json(null)
    } catch (err) {
      res.status(500).json({ error: err.message })
    }
  })

  // delete_agent
  router.post('/delete_agent', (req, res) => {
    try {
      const { id } = req.body
      const agent = db.prepare('SELECT opc_id, is_default FROM agents WHERE id = ?').get(id)
      db.prepare('DELETE FROM bindings WHERE agent_id = ?').run(id)
      db.prepare('DELETE FROM agents WHERE id = ?').run(id)
      writeLog('INFO', `Agent 已删除: ${id}`)
      // If deleted agent was the leader, promote the one with lowest order_index
      if (agent?.is_default) {
        const now = Math.floor(Date.now() / 1000)
        const next = db.prepare('SELECT id FROM agents WHERE opc_id = ? ORDER BY order_index ASC LIMIT 1').get(agent.opc_id)
        if (next) db.prepare('UPDATE agents SET is_default = 1, updated_at = ? WHERE id = ?').run(now, next.id)
      }
      res.json(null)
    } catch (err) {
      res.status(500).json({ error: err.message })
    }
  })

  // reorder_agents
  router.post('/reorder_agents', (req, res) => {
    try {
      const { opc_id, agent_ids } = req.body
      const updateOrder = db.prepare('UPDATE agents SET order_index = ?, is_default = ? WHERE id = ? AND opc_id = ?')
      const reorder = db.transaction(() => {
        for (let i = 0; i < agent_ids.length; i++) {
          updateOrder.run(i, i === 0 ? 1 : 0, agent_ids[i], opc_id)
        }
      })
      reorder()
      res.json(null)
    } catch (err) {
      res.status(500).json({ error: err.message })
    }
  })

  // set_default_agent
  router.post('/set_default_agent', (req, res) => {
    try {
      const { opc_id, agent_id } = req.body
      const now = Math.floor(Date.now() / 1000)
      db.transaction(() => {
        db.prepare('UPDATE agents SET is_default = 0, updated_at = ? WHERE opc_id = ?').run(now, opc_id)
        db.prepare('UPDATE agents SET is_default = 1, updated_at = ? WHERE id = ? AND opc_id = ?').run(now, agent_id, opc_id)
      })()
      res.json(null)
    } catch (err) {
      res.status(500).json({ error: err.message })
    }
  })

  // get_agent_documents (returns all documents for an agent)
  router.post('/get_agent_documents', (req, res) => {
    try {
      const { agent_id } = req.body
      const rows = db.prepare(
        'SELECT document_type, content FROM agent_documents WHERE agent_id = ?'
      ).all(agent_id)
      res.json(rows)
    } catch (err) {
      res.status(500).json({ error: err.message })
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
      res.status(500).json({ error: err.message })
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
      res.status(500).json({ error: err.message })
    }
  })

  return router
}

// Backward compatibility
export default createAgentRouter
