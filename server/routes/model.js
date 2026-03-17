import { Router } from 'express'
import db from '../db.js'

const router = Router()
const now = () => Math.floor(Date.now() / 1000)

function rowToProvider(row) {
  if (!row) return null
  return {
    ...row,
    id: String(row.id),
    is_enabled: row.is_enabled === 1,
    is_available: row.is_available === 1,
  }
}

function rowToModel(row) {
  if (!row) return null
  return {
    ...row,
    id: String(row.id),
    supports_vision: row.supports_vision === 1,
    supports_function_calling: row.supports_function_calling === 1,
    supports_streaming: row.supports_streaming === 1,
  }
}

// get_providers
router.post('/get_providers', (req, res) => {
  try {
    const rows = db.prepare('SELECT * FROM model_providers ORDER BY id').all()
    res.json(rows.map(rowToProvider))
  } catch (err) {
    res.status(500).send(err.message)
  }
})

// get_provider
router.post('/get_provider', (req, res) => {
  try {
    const { provider_type } = req.body
    const row = db.prepare('SELECT * FROM model_providers WHERE provider_type = ?').get(provider_type)
    if (!row) throw new Error(`Not found: ${provider_type}`)
    res.json(rowToProvider(row))
  } catch (err) {
    res.status(500).send(err.message)
  }
})

// update_provider
router.post('/update_provider', (req, res) => {
  try {
    const { config } = req.body
    db.prepare(`
      INSERT INTO model_providers (provider_type, api_key, endpoint, is_enabled, is_available, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(provider_type) DO UPDATE SET
        api_key = excluded.api_key,
        endpoint = excluded.endpoint,
        is_enabled = excluded.is_enabled,
        is_available = excluded.is_available,
        updated_at = excluded.updated_at
    `).run(
      config.provider_type,
      config.api_key ?? '',
      config.endpoint ?? null,
      config.is_enabled ? 1 : 0,
      config.is_available ? 1 : 0,
      now(), now()
    )
    res.json(null)
  } catch (err) {
    res.status(500).send(err.message)
  }
})

// get_models
router.post('/get_models', (req, res) => {
  try {
    const rows = db.prepare('SELECT * FROM model_info ORDER BY provider_type, name').all()
    res.json(rows.map(rowToModel))
  } catch (err) {
    res.status(500).send(err.message)
  }
})

// test_provider
router.post('/test_provider', (req, res) => {
  try {
    const { provider_type } = req.body
    const row = db.prepare('SELECT api_key FROM model_providers WHERE provider_type = ?').get(provider_type)
    const hasKey = row && row.api_key && row.api_key.length > 0
    const isAvailable = hasKey ? 1 : 0
    db.prepare(`
      UPDATE model_providers SET is_available = ?, last_tested = ? WHERE provider_type = ?
    `).run(isAvailable, now(), provider_type)
    res.json(!!hasKey)
  } catch (err) {
    res.status(500).send(err.message)
  }
})

export default router
