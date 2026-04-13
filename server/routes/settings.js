// routes/settings.js
import { Router } from 'express'

// ── License Keys ─────────────────────────────────────────────
// Hardcoded valid license keys. Replace with API validation later.
const VALID_LICENSE_KEYS = [
  'CLAW-PILOT-2026-ALPHA-001',
  'CLAW-PILOT-2026-ALPHA-002',
  'CLAW-PILOT-2026-ALPHA-003',
  'CLAW-PILOT-2026-BETA-001',
  'CLAW-PILOT-2026-BETA-002',
  'CLAW-PILOT-2026-BETA-003',
]

function isValidKey(key) {
  return VALID_LICENSE_KEYS.includes(key.trim().toUpperCase())
}

function maskKey(key) {
  const parts = key.split('-')
  if (parts.length >= 3) {
    const first = parts[0]
    const last = parts[parts.length - 1]
    const masked = parts.slice(1, -1).map(() => '****').join('-')
    return `${first}-${masked}-${last}`
  }
  return key.slice(0, 4) + '****'
}

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

  // ── License Routes ───────────────────────────────────────

  router.post('/activate_license', (req, res) => {
    try {
      const { license_key } = req.body
      if (!license_key) return res.status(400).json({ error: 'license_key is required' })

      const key = license_key.trim().toUpperCase()
      if (!isValidKey(key)) {
        return res.status(400).json({ error: '无效的许可证密钥' })
      }

      db.prepare(`
        INSERT INTO settings (key, value) VALUES ('license_key', ?)
        ON CONFLICT(key) DO UPDATE SET value = excluded.value
      `).run(key)

      res.json(true)
    } catch (err) {
      res.status(500).json({ error: err.message })
    }
  })

  router.post('/deactivate_license', (_req, res) => {
    try {
      db.prepare("DELETE FROM settings WHERE key = 'license_key'").run()
      res.json({ ok: true })
    } catch (err) {
      res.status(500).json({ error: err.message })
    }
  })

  router.post('/get_license_status', (_req, res) => {
    try {
      const row = db.prepare('SELECT value FROM settings WHERE key = ?').get('license_key')
      if (row?.value && isValidKey(row.value)) {
        res.json({ activated: true, license_key: maskKey(row.value) })
      } else {
        res.json({ activated: false, license_key: null })
      }
    } catch (err) {
      res.status(500).json({ error: err.message })
    }
  })

  // ── Settings Routes ──────────────────────────────────────

  router.post('/get_opc_root', (req, res) => {
    try {
      const row = db.prepare('SELECT value FROM settings WHERE key = ?').get('opc_root')
      const defaultValue = '~/.openclaw/OPC'
      res.json(row?.value || defaultValue)
    } catch (err) {
      res.status(500).json({ error: err.message })
    }
  })

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
