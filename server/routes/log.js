import { Router } from 'express'
import db from '../db.js'

const router = Router()
const now = () => Math.floor(Date.now() / 1000)

// get_logs
router.post('/get_logs', (req, res) => {
  try {
    const { level, component, limit = 200 } = req.body
    const conditions = []
    const params = []

    if (level) {
      conditions.push('level = ?')
      params.push(level)
    }
    if (component) {
      conditions.push('component = ?')
      params.push(component)
    }

    const where = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : ''
    params.push(limit)

    const rows = db.prepare(
      `SELECT * FROM log_entries ${where} ORDER BY timestamp DESC LIMIT ?`
    ).all(...params)

    res.json(rows)
  } catch (err) {
    res.status(500).send(err.message)
  }
})

// write_log
router.post('/write_log', (req, res) => {
  try {
    const { level, component, message, agent_id, channel } = req.body
    const result = db.prepare(`
      INSERT INTO log_entries (timestamp, level, component, message, agent_id, channel)
      VALUES (?, ?, ?, ?, ?, ?)
    `).run(now(), level, component ?? null, message, agent_id ?? null, channel ?? null)
    res.json(Number(result.lastInsertRowid))
  } catch (err) {
    res.status(500).send(err.message)
  }
})

export default router
