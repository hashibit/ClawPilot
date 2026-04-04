// routes/settings.js
import { Router } from 'express'

export function createSettingsRouter(db) {
  const router = Router()

  // Ensure settings table exists
  try {
    db.exec(`
      CREATE TABLE IF NOT EXISTS settings (
        key TEXT PRIMARY KEY,
        value TEXT
      )
    `)
  } catch (err) {
    // Ignore if table already exists
  }

  // GET /api/get_opc_root
  router.post('/get_opc_root', (req, res) => {
    try {
      const row = db.prepare('SELECT value FROM settings WHERE key = ?').get('opc_root')
      const defaultValue = '~/.openclaw/OPC'
      res.json(row?.value || defaultValue)
    } catch (err) {
      res.status(500).json({ error: err.message })
    }
  })

  // SET /api/set_opc_root
  router.post('/set_opc_root', (req, res) => {
    try {
      const { opc_root } = req.body
      if (!opc_root) {
        return res.status(400).json({ error: 'opc_root is required' })
      }

      db.prepare(`
        INSERT INTO settings (key, value) VALUES ('opc_root', ?)
        ON CONFLICT(key) DO UPDATE SET value = excluded.value
      `).run(opc_root)

      res.json({ ok: true })
    } catch (err) {
      res.status(500).json({ error: err.message })
    }
  })

  return router
}
