import { Router } from 'express'
import db from '../db.js'

const router = Router()
const now = () => Math.floor(Date.now() / 1000)

function rowToChannel(row) {
  if (!row) return null
  return {
    ...row,
    id: String(row.id),
    is_enabled: row.is_enabled === 1,
    is_connected: row.is_connected === 1,
    feishu_config: row.feishu_config ? JSON.parse(row.feishu_config) : null,
  }
}

// get_channels
router.post('/get_channels', (req, res) => {
  try {
    const { opc_id } = req.body
    const rows = db.prepare('SELECT * FROM channels WHERE opc_id = ? ORDER BY id').all(opc_id)
    res.json(rows.map(rowToChannel))
  } catch (err) {
    res.status(500).send(err.message)
  }
})

// get_channel
router.post('/get_channel', (req, res) => {
  try {
    const { id } = req.body
    const row = db.prepare('SELECT * FROM channels WHERE id = ?').get(Number(id))
    if (!row) throw new Error(`Not found: ${id}`)
    res.json(rowToChannel(row))
  } catch (err) {
    res.status(500).send(err.message)
  }
})

// upsert_channel
router.post('/upsert_channel', (req, res) => {
  try {
    const { config } = req.body
    const feishuStr = config.feishu_config
      ? (typeof config.feishu_config === 'string' ? config.feishu_config : JSON.stringify(config.feishu_config))
      : null

    const hasId = config.id && String(config.id) !== '0'

    if (hasId) {
      db.prepare(`
        UPDATE channels SET
          opc_id = ?, channel_type = ?, is_enabled = ?, feishu_config = ?,
          is_connected = ?, last_connected = ?, updated_at = ?
        WHERE id = ?
      `).run(
        config.opc_id, config.channel_type,
        config.is_enabled ? 1 : 0, feishuStr,
        config.is_connected ? 1 : 0, config.last_connected ?? null,
        now(), Number(config.id)
      )
      res.json(Number(config.id))
    } else {
      const result = db.prepare(`
        INSERT INTO channels (opc_id, channel_type, is_enabled, feishu_config, is_connected, last_connected, created_at, updated_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?)
      `).run(
        config.opc_id, config.channel_type,
        config.is_enabled ? 1 : 0, feishuStr,
        config.is_connected ? 1 : 0, config.last_connected ?? null,
        now(), now()
      )
      res.json(Number(result.lastInsertRowid))
    }
  } catch (err) {
    res.status(500).send(err.message)
  }
})

// delete_channel
router.post('/delete_channel', (req, res) => {
  try {
    const { id } = req.body
    db.prepare('DELETE FROM channels WHERE id = ?').run(Number(id))
    res.json(null)
  } catch (err) {
    res.status(500).send(err.message)
  }
})

// test_feishu_connection
router.post('/test_feishu_connection', (req, res) => {
  try {
    const { app_id, app_secret } = req.body
    const ok = !!(app_id && app_secret && app_id.length > 0 && app_secret.length > 0)
    res.json(ok)
  } catch (err) {
    res.status(500).send(err.message)
  }
})

export default router
