/**
 * Data Access Object layer - centralized database queries
 * Eliminates duplicated SQL across route files
 */
export function createDao(db) {
  return {
    // ─── OPC ─────────────────────────────────
    getOpcById(id) {
      return db.prepare('SELECT * FROM opc_config WHERE id = ?').get(id)
    },
    getOpcByName(name) {
      return db.prepare('SELECT * FROM opc_config WHERE name = ?').get(name)
    },
    getAllOpcs() {
      return db.prepare('SELECT * FROM opc_config ORDER BY created_at DESC').all()
    },
    getOpcAgentCount(opcId) {
      return db.prepare('SELECT COUNT(*) as cnt FROM agents WHERE opc_id = ?').get(opcId)?.cnt || 0
    },
    getOpcChannelCount(opcId) {
      return db.prepare('SELECT COUNT(*) as cnt FROM channels WHERE opc_id = ?').get(opcId)?.cnt || 0
    },
    getOpcBindingCount(opcId) {
      return db.prepare('SELECT COUNT(*) as cnt FROM bindings WHERE opc_id = ?').get(opcId)?.cnt || 0
    },

    // ─── Office ──────────────────────────────
    getOfficeById(id) {
      return db.prepare('SELECT * FROM offices WHERE id = ?').get(id)
    },
    getAllOffices() {
      return db.prepare('SELECT * FROM offices ORDER BY created_at DESC').all()
    },

    // ─── Agent ───────────────────────────────
    getAgentById(id) {
      return db.prepare('SELECT * FROM agents WHERE id = ?').get(id)
    },
    getAgentsByOpcId(opcId) {
      return db.prepare('SELECT * FROM agents WHERE opc_id = ? ORDER BY order_index ASC, created_at ASC').all(opcId)
    },
    getAgentDocuments(agentId) {
      return db.prepare('SELECT * FROM agent_documents WHERE agent_id = ?').all(agentId)
    },
    getAgentDocument(agentId, docType) {
      return db.prepare('SELECT * FROM agent_documents WHERE agent_id = ? AND document_type = ?').get(agentId, docType)
    },

    // ─── Provider ────────────────────────────
    getProviderByName(name) {
      return db.prepare('SELECT * FROM model_providers_v2 WHERE name = ?').get(name)
    },
    getProviderById(id) {
      return db.prepare('SELECT * FROM model_providers_v2 WHERE id = ?').get(id)
    },
    getEnabledProviderByName(name) {
      return db.prepare('SELECT * FROM model_providers_v2 WHERE name = ? AND is_enabled = 1').get(name)
    },

    // ─── Channel ─────────────────────────────
    getChannelById(id) {
      return db.prepare('SELECT * FROM channels WHERE id = ?').get(Number(id))
    },
    getChannelsByOpcId(opcId) {
      return db.prepare('SELECT * FROM channels WHERE opc_id = ?').all(opcId)
    },

    // ─── Binding ─────────────────────────────
    getBindingById(id) {
      return db.prepare('SELECT * FROM bindings WHERE id = ?').get(id)
    },
    getBindingsByOpcId(opcId) {
      return db.prepare('SELECT * FROM bindings WHERE opc_id = ?').all(opcId)
    },

    // ─── Skill ───────────────────────────────
    getSkillBySlug(slug) {
      return db.prepare('SELECT * FROM skills WHERE slug = ?').get(slug)
    },

    // ─── Settings ────────────────────────────
    getSetting(key) {
      const row = db.prepare('SELECT value FROM settings WHERE key = ?').get(key)
      return row?.value ?? null
    },
    setSetting(key, value) {
      db.prepare('INSERT INTO settings (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value')
        .run(key, value)
    },

    // ─── Log ─────────────────────────────────
    writeLog(level, component, message, agentId, channel) {
      try {
        db.prepare('INSERT INTO log_entries (timestamp, level, component, message, agent_id, channel) VALUES (?, ?, ?, ?, ?, ?)')
          .run(Math.floor(Date.now() / 1000), level, component || null, message, agentId || null, channel || null)
      } catch (e) {
        console.error('[dao.writeLog] Failed to write log entry:', e.message)
      }
    },
  }
}
