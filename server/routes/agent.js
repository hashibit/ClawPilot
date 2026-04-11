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
      const { config, documents } = req.body
      if (!config.name) throw new Error('Agent name cannot be empty')
      const existing = db.prepare('SELECT COUNT(*) as cnt FROM agents WHERE opc_id = ?').get(config.opc_id)
      if (existing.cnt === 0) config.is_default = true

      const insertDoc = db.prepare(`
        INSERT INTO agent_documents (agent_id, document_type, content, created_at, updated_at)
        VALUES (?, ?, ?, ?, ?)
      `)

      db.transaction(() => {
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

        // 保存文档（如果提供了 documents）
        if (documents && typeof documents === 'object') {
          const ts = config.created_at ?? now()
          for (const [docType, content] of Object.entries(documents)) {
            if (content && typeof content === 'string') {
              insertDoc.run(config.id, docType, content, ts, ts)
            }
          }
        }
      })()

      writeLog('INFO', `Agent 已创建: ${config.name} (${config.id}) in opc ${config.opc_id}${documents ? '（含文档）' : ''}`)
      res.json(config.id)
    } catch (err) {
      res.status(500).json({ error: err.message })
    }
  })

  // update_agent — 部分更新，只更新传入的字段
  router.post('/update_agent', (req, res) => {
    try {
      const { id, config } = req.body

      // 先读取现有记录，避免 NOT NULL 约束冲突
      const existing = db.prepare('SELECT * FROM agents WHERE id = ?').get(id)
      if (!existing) throw new Error(`Not found: ${id}`)

      // 合并传入的字段，只更新有值的字段
      const finalName = config.name ?? existing.name
      const finalDisplayName = config.display_name ?? existing.display_name

      db.prepare(`
        UPDATE agents SET
          name = ?, display_name = ?, job_title = ?, personality = ?, description = ?,
          initials = ?, gradient_start = ?, gradient_end = ?, is_default = ?, order_index = ?,
          model = ?,
          enabled_tools = ?, disabled_tools = ?, enabled_skills = ?,
          guardrail_rules = ?, reports_to = ?, manages = ?, updated_at = ?
        WHERE id = ?
      `).run(
        finalName, finalDisplayName,
        config.job_title ?? existing.job_title,
        config.personality ?? existing.personality,
        config.description ?? existing.description,
        config.initials ?? existing.initials,
        config.gradient_start ?? existing.gradient_start,
        config.gradient_end ?? existing.gradient_end,
        config.is_default !== undefined ? (config.is_default ? 1 : 0) : existing.is_default,
        config.order_index ?? existing.order_index,
        config.model ?? existing.model,
        toJsonStr(config.enabled_tools ?? JSON.parse(existing.enabled_tools || '[]')),
        toJsonStr(config.disabled_tools ?? JSON.parse(existing.disabled_tools || '[]')),
        toJsonStr(config.enabled_skills ?? JSON.parse(existing.enabled_skills || '[]')),
        config.guardrail_allow !== undefined || config.guardrail_deny !== undefined
          ? serializeGuardrail(config)
          : existing.guardrail_rules,
        toJsonStr(config.reports_to ?? JSON.parse(existing.reports_to || '[]')),
        toJsonStr(config.manages ?? JSON.parse(existing.manages || '[]')),
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

  // batch_create_agents — create multiple agents in a single transaction
  // 支持同时保存文档: { agents: [...], documents: { agentId: { SOUL: "...", IDENTITY: "..." } } }
  router.post('/batch_create_agents', (req, res) => {
    try {
      const { agents, documents } = req.body
      if (!Array.isArray(agents) || agents.length === 0) throw new Error('agents array required')
      const insert = db.prepare(`
        INSERT INTO agents
          (id, opc_id, name, display_name, job_title, personality, description, initials,
           gradient_start, gradient_end, is_default, order_index, model,
           enabled_tools, disabled_tools, enabled_skills, guardrail_rules, reports_to, manages,
           created_at, updated_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `)
      const insertDoc = db.prepare(`
        INSERT INTO agent_documents (agent_id, document_type, content, created_at, updated_at)
        VALUES (?, ?, ?, ?, ?)
      `)
      const ids = db.transaction(() => {
        const createdIds = agents.map((config, idx) => {
          insert.run(
            config.id, config.opc_id, config.name, config.display_name,
            config.job_title ?? null, config.personality ?? null, config.description ?? null,
            config.initials ?? null, config.gradient_start ?? null, config.gradient_end ?? null,
            config.is_default ? 1 : 0, config.order_index ?? idx,
            config.model ?? null,
            toJsonStr(config.enabled_tools), toJsonStr(config.disabled_tools),
            toJsonStr(config.enabled_skills), serializeGuardrail(config),
            toJsonStr(config.reports_to), toJsonStr(config.manages),
            config.created_at ?? now(), config.updated_at ?? now()
          )

          // 保存文档（如果提供了 documents）
          if (documents && typeof documents === 'object') {
            const agentDocs = documents[config.id]
            if (agentDocs && typeof agentDocs === 'object') {
              const ts = config.created_at ?? now()
              for (const [docType, content] of Object.entries(agentDocs)) {
                if (content && typeof content === 'string') {
                  insertDoc.run(config.id, docType, content, ts, ts)
                }
              }
            }
          }

          // 保存文档方式 2: 从每个 agent 配置对象中直接提取文档字段
          // 支持 ai_generate_agents 返回的字段：soul, identity, agents, user, memory, heartbeat, tools
          const ts2 = config.created_at ?? now()
          const docFields = {
            SOUL: config.soul,
            IDENTITY: config.identity,
            AGENTS: config.agents,
            USER: config.user,
            MEMORY: config.memory,
            HEARTBEAT: config.heartbeat,
            TOOLS: config.tools,
          }
          for (const [docType, content] of Object.entries(docFields)) {
            if (content && typeof content === 'string' && content.trim()) {
              insertDoc.run(config.id, docType, content, ts2, ts2)
            }
          }

          return config.id
        })
        return createdIds
      })()
      writeLog('INFO', `批量创建 ${agents.length} 个 Agent${documents ? '（含文档）' : ''}`)
      res.json(ids)
    } catch (err) {
      res.status(500).json({ error: err.message })
    }
  })

  // set_leader — designate an agent as the OPC leader (is_default=1)
  router.post('/set_leader', (req, res) => {
    try {
      const { opc_id, agent_id } = req.body
      if (!opc_id || !agent_id) throw new Error('opc_id and agent_id required')
      const ts = now()
      db.transaction(() => {
        db.prepare('UPDATE agents SET is_default = 0, updated_at = ? WHERE opc_id = ?').run(ts, opc_id)
        db.prepare('UPDATE agents SET is_default = 1, updated_at = ? WHERE id = ? AND opc_id = ?').run(ts, agent_id, opc_id)
      })()
      writeLog('INFO', `Agent ${agent_id} 设为 OPC ${opc_id} 领队`)
      res.json(null)
    } catch (err) {
      res.status(500).json({ error: err.message })
    }
  })

  return router
}

// Backward compatibility
export default createAgentRouter
