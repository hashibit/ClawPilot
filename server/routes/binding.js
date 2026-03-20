import { Router } from 'express'
import db from '../db.js'
import { createLogger } from '../logger.js'
const log = createLogger('binding')

const router = Router()
const now = () => Math.floor(Date.now() / 1000)

function rowToBinding(row) {
  if (!row) return null
  return {
    ...row,
    is_enabled: row.is_enabled === 1,
  }
}

// get_bindings
router.post('/get_bindings', (req, res) => {
  try {
    const { opc_id } = req.body
    const rows = db.prepare('SELECT * FROM bindings WHERE opc_id = ? ORDER BY created_at').all(opc_id)
    res.json(rows.map(rowToBinding))
  } catch (err) {
    res.status(500).send(err.message)
  }
})

// get_binding
router.post('/get_binding', (req, res) => {
  try {
    const { id } = req.body
    const row = db.prepare('SELECT * FROM bindings WHERE id = ?').get(id)
    if (!row) throw new Error(`Not found: ${id}`)
    res.json(rowToBinding(row))
  } catch (err) {
    res.status(500).send(err.message)
  }
})

// create_binding
router.post('/create_binding', (req, res) => {
  try {
    const { binding } = req.body
    db.prepare(`
      INSERT INTO bindings
        (id, opc_id, channel_id, channel_name, channel_type, agent_id, agent_name,
         trigger_mode, is_enabled, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      binding.id, binding.opc_id, binding.channel_id, binding.channel_name, binding.channel_type,
      binding.agent_id, binding.agent_name, binding.trigger_mode,
      binding.is_enabled ? 1 : 0,
      binding.created_at ?? now(), binding.updated_at ?? now()
    )
    res.json(binding.id)
  } catch (err) {
    res.status(500).send(err.message)
  }
})

// update_binding
router.post('/update_binding', (req, res) => {
  try {
    const { id, binding } = req.body
    db.prepare(`
      UPDATE bindings SET
        channel_id = ?, channel_name = ?, channel_type = ?, agent_id = ?, agent_name = ?,
        trigger_mode = ?, is_enabled = ?, updated_at = ?
      WHERE id = ?
    `).run(
      binding.channel_id, binding.channel_name, binding.channel_type,
      binding.agent_id, binding.agent_name, binding.trigger_mode,
      binding.is_enabled ? 1 : 0, now(), id
    )
    res.json(null)
  } catch (err) {
    res.status(500).send(err.message)
  }
})

// delete_binding
router.post('/delete_binding', (req, res) => {
  try {
    const { id } = req.body
    db.prepare('DELETE FROM bindings WHERE id = ?').run(id)
    res.json(null)
  } catch (err) {
    res.status(500).send(err.message)
  }
})

// toggle_binding
router.post('/toggle_binding', (req, res) => {
  try {
    const { id, is_enabled } = req.body
    db.prepare('UPDATE bindings SET is_enabled = ?, updated_at = ? WHERE id = ?').run(
      is_enabled ? 1 : 0, now(), id
    )
    res.json(null)
  } catch (err) {
    res.status(500).send(err.message)
  }
})

// get_feishu_channels
router.post('/get_feishu_channels', (req, res) => {
  res.json([])
})

export default router
