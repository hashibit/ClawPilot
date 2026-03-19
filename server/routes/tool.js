import { Router } from 'express'
import db from '../db.js'

const router = Router()
const now = () => Math.floor(Date.now() / 1000)

// GET /api/get_tools
router.post('/get_tools', (_req, res) => {
  try {
    const rows = db.prepare('SELECT * FROM tools ORDER BY created_at DESC').all()
    res.json(rows)
  } catch (err) {
    res.status(500).send(err.message)
  }
})

// POST /api/create_tool  { tool: { name, display_name, description, category } }
router.post('/create_tool', (req, res) => {
  try {
    const { tool } = req.body
    if (!tool?.name?.trim()) return res.status(400).send('name is required')
    if (!tool?.display_name?.trim()) return res.status(400).send('display_name is required')

    const ts = now()
    const result = db.prepare(`
      INSERT INTO tools (name, display_name, description, category, is_local, created_at)
      VALUES (?, ?, ?, ?, 1, ?)
    `).run(
      tool.name.trim(),
      tool.display_name.trim(),
      tool.description?.trim() ?? '',
      tool.category?.trim() ?? 'general',
      ts,
    )
    res.json(result.lastInsertRowid)
  } catch (err) {
    if (err.message.includes('UNIQUE')) return res.status(400).send('工具名称已存在')
    res.status(500).send(err.message)
  }
})

// POST /api/delete_tool  { id }
router.post('/delete_tool', (req, res) => {
  try {
    const { id } = req.body
    db.prepare('DELETE FROM tools WHERE id = ? AND is_local = 1').run(Number(id))
    res.json({ ok: true })
  } catch (err) {
    res.status(500).send(err.message)
  }
})

export default router
