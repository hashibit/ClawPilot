import { Router } from 'express'
import { createLogger } from '../logger.js'

const now = () => Math.floor(Date.now() / 1000)

function rowToOpc(row) {
  if (!row) return null
  return {
    ...row,
    is_active: row.is_active === 1,
    is_running: row.is_running === 1,
    office_id: row.office_id ?? null,
    office_name: row.office_name ?? null,
  }
}

export function createOpcRouter(db) {
  const log = createLogger('opc')
  const router = Router()

  function writeLog(level, message) {
    try {
      db.prepare('INSERT INTO log_entries (timestamp, level, component, message) VALUES (?, ?, ?, ?)')
        .run(Math.floor(Date.now() / 1000), level, 'opc', message)
    } catch (_) {}
    const lvl = level.toLowerCase()
    if (lvl === 'error') log.error(message)
    else if (lvl === 'warn') log.warn(message)
    else log.info(message)
  }

  // get_all_opcs
  router.post('/get_all_opcs', (req, res) => {
    try {
      const rows = db.prepare(`
        SELECT o.*,
          off.name as office_name,
          (SELECT COUNT(*) FROM agents WHERE opc_id = o.id) as agent_count,
          (SELECT COUNT(*) FROM channels WHERE opc_id = o.id) as channel_count
        FROM opc_config o
        LEFT JOIN offices off ON o.office_id = off.id
        ORDER BY o.created_at
      `).all()
      res.json(rows.map(rowToOpc))
    } catch (err) {
      res.status(500).json({ error: err.message })
    }
  })

  // get_opc
  router.post('/get_opc', (req, res) => {
    try {
      const { id } = req.body
      const row = db.prepare(`
        SELECT o.*,
          off.name as office_name,
          (SELECT COUNT(*) FROM agents WHERE opc_id = o.id) as agent_count,
          (SELECT COUNT(*) FROM channels WHERE opc_id = o.id) as channel_count
        FROM opc_config o
        LEFT JOIN offices off ON o.office_id = off.id WHERE o.id = ?
      `).get(id)
      if (!row) throw new Error(`Not found: ${id}`)
      res.json(rowToOpc(row))
    } catch (err) {
      res.status(500).json({ error: err.message })
    }
  })

  // create_opc
  router.post('/create_opc', (req, res) => {
    try {
      const { config } = req.body
      if (!config.name) throw new Error('OPC name cannot be empty')
      config.name = config.name.replace(/<[^>]*>/g, '')
      db.prepare(`
        INSERT INTO opc_config
          (id, name, display_name, description, avatar_color, avatar_initials,
           is_active, is_running, agent_count, channel_count, group_count, dm_count,
           message_count_today, message_growth, created_at, updated_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `).run(
        config.id, config.name, config.display_name,
        config.description ?? null, config.avatar_color ?? null, config.avatar_initials ?? null,
        config.is_active ? 1 : 0, config.is_running ? 1 : 0,
        config.agent_count ?? 0, config.channel_count ?? 0, config.group_count ?? 0,
        config.dm_count ?? 0, config.message_count_today ?? 0, config.message_growth ?? 0.0,
        config.created_at ?? now(), config.updated_at ?? now()
      )
      writeLog('INFO', `OPC 已创建: ${config.name} (${config.id})`)
      res.json(config.id)
    } catch (err) {
      res.status(500).json({ error: err.message })
    }
  })

  // update_opc
  router.post('/update_opc', (req, res) => {
    try {
      const { id, config } = req.body
      db.prepare(`
        UPDATE opc_config SET
          name = ?, display_name = ?, description = ?, avatar_color = ?, avatar_initials = ?,
          is_active = ?, is_running = ?, agent_count = ?, channel_count = ?, group_count = ?,
          dm_count = ?, message_count_today = ?, message_growth = ?, updated_at = ?
        WHERE id = ?
      `).run(
        config.name, config.display_name, config.description ?? null,
        config.avatar_color ?? null, config.avatar_initials ?? null,
        config.is_active ? 1 : 0, config.is_running ? 1 : 0,
        config.agent_count ?? 0, config.channel_count ?? 0, config.group_count ?? 0,
        config.dm_count ?? 0, config.message_count_today ?? 0, config.message_growth ?? 0.0,
        now(), id
      )
      res.json(null)
    } catch (err) {
      res.status(500).json({ error: err.message })
    }
  })

  // delete_opc
  router.post('/delete_opc', (req, res) => {
    try {
      const { id } = req.body
      db.prepare('DELETE FROM opc_config WHERE id = ?').run(id)
      writeLog('INFO', `OPC 已删除: ${id}`)
      res.json(null)
    } catch (err) {
      res.status(500).json({ error: err.message })
    }
  })

  // set_current_opc
  router.post('/set_current_opc', (req, res) => {
    try {
      const { id } = req.body
      const row = db.prepare('SELECT name FROM opc_config WHERE id = ?').get(id)
      if (!row) return res.status(404).json({ error: `OPC not found: ${id}` })
      db.transaction(() => {
        db.prepare('UPDATE opc_config SET is_active = 0').run()
        db.prepare('UPDATE opc_config SET is_active = 1 WHERE id = ?').run(id)
        db.prepare('UPDATE openclaw_config SET current_opc = ?, last_updated = ? WHERE id = 1').run(row.name, now())
      })()
      writeLog('INFO', `当前 OPC 切换为: ${row.name} (${id})`)
      res.json({ ok: true })
    } catch (err) {
      res.status(500).json({ error: err.message })
    }
  })

  // get_current_opc
  router.post('/get_current_opc', (req, res) => {
    try {
      const liveQuery = `
        SELECT o.*,
          off.name as office_name,
          (SELECT COUNT(*) FROM agents WHERE opc_id = o.id) as agent_count,
          (SELECT COUNT(*) FROM channels WHERE opc_id = o.id) as channel_count
        FROM opc_config o
        LEFT JOIN offices off ON o.office_id = off.id`
      let row = db.prepare(liveQuery + ' WHERE o.is_active = 1').get()
      if (!row) row = db.prepare(liveQuery + ' ORDER BY o.created_at').get()
      if (!row) return res.json({})
      res.json(rowToOpc(row))
    } catch (err) {
      res.status(500).json({ error: err.message })
    }
  })

  // get_opc_stats
  router.post('/get_opc_stats', (req, res) => {
    try {
      const { opc_id } = req.body
      const base = db.prepare(
        'SELECT message_count_today, message_growth FROM opc_config WHERE id = ?'
      ).get(opc_id)
      if (!base) throw new Error(`Not found: ${opc_id}`)
      const agent_count = db.prepare('SELECT COUNT(*) as cnt FROM agents WHERE opc_id = ?').get(opc_id).cnt
      const channel_count = db.prepare('SELECT COUNT(*) as cnt FROM channels WHERE opc_id = ?').get(opc_id).cnt
      const group_count = db.prepare("SELECT COUNT(*) as cnt FROM bindings WHERE opc_id = ? AND channel_type = 'GROUP'").get(opc_id).cnt
      const dm_count = db.prepare("SELECT COUNT(*) as cnt FROM bindings WHERE opc_id = ? AND channel_type = 'DM'").get(opc_id).cnt
      res.json({ agent_count, channel_count, group_count, dm_count, message_count_today: base.message_count_today, message_growth: base.message_growth })
    } catch (err) {
      res.status(500).json({ error: err.message })
    }
  })

  // update_opc_stats - recalculate and persist agent/channel counts
  router.post('/update_opc_stats', (req, res) => {
    try {
      const { id } = req.body
      const agentCount = db.prepare('SELECT COUNT(*) as cnt FROM agents WHERE opc_id = ?').get(id).cnt
      const channelCount = db.prepare('SELECT COUNT(*) as cnt FROM channels WHERE opc_id = ?').get(id).cnt
      db.prepare('UPDATE opc_config SET agent_count = ?, channel_count = ?, updated_at = ? WHERE id = ?')
        .run(agentCount, channelCount, now(), id)
      res.json(null)
    } catch (err) {
      res.status(500).json({ error: err.message })
    }
  })

  // export_opc
  router.post('/export_opc', (req, res) => {
    try {
      const { opc_id } = req.body
      const opc = db.prepare('SELECT * FROM opc_config WHERE id = ?').get(opc_id)
      if (!opc) throw new Error(`Not found: ${opc_id}`)
      const agents = db.prepare('SELECT * FROM agents WHERE opc_id = ?').all(opc_id)
      const agentDocs = []
      for (const agent of agents) {
        const docs = db.prepare('SELECT * FROM agent_documents WHERE agent_id = ?').all(agent.id)
        agentDocs.push(...docs)
      }
      const channels = db.prepare('SELECT * FROM channels WHERE opc_id = ?').all(opc_id)
      const bindings = db.prepare('SELECT * FROM bindings WHERE opc_id = ?').all(opc_id)
      writeLog('INFO', `OPC 已导出: ${opc.name} (${opc_id})`)
      res.json(JSON.stringify({ opc, agents, agent_documents: agentDocs, channels, bindings }))
    } catch (err) {
      res.status(500).json({ error: err.message })
    }
  })

  // import_opc
  router.post('/import_opc', (req, res) => {
    try {
      const { json } = req.body
      const data = JSON.parse(json)
      const { opc, agents = [], agent_documents = [], channels = [], bindings = [] } = data

      const insertOpc = db.transaction(() => {
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
          opc.created_at ?? now(), opc.updated_at ?? now()
        )
        for (const agent of agents) {
          db.prepare(`INSERT OR REPLACE INTO agents
            (id, opc_id, name, display_name, job_title, personality, description, initials,
             gradient_start, gradient_end, is_default, order_index, model_provider, model_name, model,
             enabled_tools, disabled_tools, enabled_skills, guardrail_rules, reports_to, manages,
             created_at, updated_at)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
          `).run(
            agent.id, agent.opc_id, agent.name, agent.display_name,
            agent.job_title ?? null, agent.personality ?? null, agent.description ?? null,
            agent.initials ?? null, agent.gradient_start ?? null, agent.gradient_end ?? null,
            agent.is_default ? 1 : 0, agent.order_index ?? 0,
            agent.model_provider ?? null, agent.model_name ?? null, agent.model ?? null,
            typeof agent.enabled_tools === 'string' ? agent.enabled_tools : JSON.stringify(agent.enabled_tools ?? []),
            typeof agent.disabled_tools === 'string' ? agent.disabled_tools : JSON.stringify(agent.disabled_tools ?? []),
            typeof agent.enabled_skills === 'string' ? agent.enabled_skills : JSON.stringify(agent.enabled_skills ?? []),
            typeof agent.guardrail_rules === 'string' ? agent.guardrail_rules : JSON.stringify(agent.guardrail_rules ?? []),
            typeof agent.reports_to === 'string' ? agent.reports_to : JSON.stringify(agent.reports_to ?? []),
            typeof agent.manages === 'string' ? agent.manages : JSON.stringify(agent.manages ?? []),
            agent.created_at ?? now(), agent.updated_at ?? now()
          )
        }
        for (const doc of agent_documents) {
          db.prepare(`INSERT OR REPLACE INTO agent_documents (agent_id, document_type, content)
            VALUES (?, ?, ?)
          `).run(doc.agent_id, doc.document_type, doc.content)
        }
        for (const ch of channels) {
          db.prepare(`INSERT OR REPLACE INTO channels
            (id, opc_id, channel_type, is_enabled, feishu_config, is_connected, last_connected, created_at, updated_at)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
          `).run(
            ch.id, ch.opc_id, ch.channel_type,
            ch.is_enabled ? 1 : 0,
            ch.feishu_config ? (typeof ch.feishu_config === 'string' ? ch.feishu_config : JSON.stringify(ch.feishu_config)) : null,
            ch.is_connected ? 1 : 0, ch.last_connected ?? null,
            ch.created_at ?? now(), ch.updated_at ?? now()
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
            b.is_enabled ? 1 : 0, b.created_at ?? now(), b.updated_at ?? now()
          )
        }
      })

      insertOpc()
      writeLog('INFO', `OPC 已导入: ${opc.name} (${opc.id}), agents=${agents.length}`)
      res.json(opc.id)
    } catch (err) {
      res.status(500).json({ error: err.message })
    }
  })

  return router
}

// Backward compatibility: default export
export default createOpcRouter
