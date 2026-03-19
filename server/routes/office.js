import { Router } from 'express'
import db from '../db.js'

const router = Router()
const now = () => Math.floor(Date.now() / 1000)

function rowToOffice(row) {
  if (!row) return null
  return { ...row }
}

// get_offices — includes current opc info if occupied
router.post('/get_offices', (req, res) => {
  try {
    const rows = db.prepare(`
      SELECT o.*, oc.id as current_opc_id, oc.display_name as current_opc_name
      FROM offices o
      LEFT JOIN opc_config oc ON oc.office_id = o.id AND oc.is_running = 1
      ORDER BY o.created_at
    `).all()
    res.json(rows.map(rowToOffice))
  } catch (err) {
    res.status(500).send(err.message)
  }
})

// get_office
router.post('/get_office', (req, res) => {
  try {
    const { id } = req.body
    const row = db.prepare(`
      SELECT o.*, oc.id as current_opc_id, oc.display_name as current_opc_name
      FROM offices o
      LEFT JOIN opc_config oc ON oc.office_id = o.id AND oc.is_running = 1
      WHERE o.id = ?
    `).get(id)
    if (!row) throw new Error(`Not found: ${id}`)
    res.json(rowToOffice(row))
  } catch (err) {
    res.status(500).send(err.message)
  }
})

// create_office
router.post('/create_office', (req, res) => {
  try {
    const { office } = req.body
    db.prepare(`
      INSERT INTO offices
        (id, name, address, access_card, phone, receptionist_image,
         ownership, monthly_rent, internet_speed, decoration_grade, description,
         daemon_url, daemon_api_key, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      office.id, office.name,
      office.address ?? null, office.access_card ?? null,
      office.phone ?? null, office.receptionist_image ?? null,
      office.ownership ?? 'RENTED', office.monthly_rent ?? null,
      office.internet_speed ?? null, office.decoration_grade ?? 'MEDIUM',
      office.description ?? null,
      office.daemon_url ?? null, office.daemon_api_key ?? null,
      office.created_at ?? now(), office.updated_at ?? now()
    )
    res.json(office.id)
  } catch (err) {
    res.status(500).send(err.message)
  }
})

// update_office
router.post('/update_office', (req, res) => {
  try {
    const { id, office } = req.body
    db.prepare(`
      UPDATE offices SET
        name = ?, address = ?, access_card = ?, phone = ?, receptionist_image = ?,
        ownership = ?, monthly_rent = ?, internet_speed = ?, decoration_grade = ?,
        description = ?, daemon_url = ?, daemon_api_key = ?, updated_at = ?
      WHERE id = ?
    `).run(
      office.name,
      office.address ?? null, office.access_card ?? null,
      office.phone ?? null, office.receptionist_image ?? null,
      office.ownership ?? 'RENTED', office.monthly_rent ?? null,
      office.internet_speed ?? null, office.decoration_grade ?? 'MEDIUM',
      office.description ?? null,
      office.daemon_url ?? null, office.daemon_api_key ?? null,
      now(), id
    )
    res.json(null)
  } catch (err) {
    res.status(500).send(err.message)
  }
})

// delete_office
router.post('/delete_office', (req, res) => {
  try {
    const { id } = req.body
    // Unlink any OPCs that reference this office
    db.prepare('UPDATE opc_config SET office_id = NULL WHERE office_id = ?').run(id)
    db.prepare('DELETE FROM offices WHERE id = ?').run(id)
    res.json(null)
  } catch (err) {
    res.status(500).send(err.message)
  }
})

// assign_office — link an OPC to an office
router.post('/assign_office', (req, res) => {
  try {
    const { opc_id, office_id } = req.body
    db.prepare('UPDATE opc_config SET office_id = ? WHERE id = ?').run(
      office_id ?? null, opc_id
    )
    res.json(null)
  } catch (err) {
    res.status(500).send(err.message)
  }
})

// check_daemon_health — ping daemon /health endpoint
router.post('/check_daemon_health', async (req, res) => {
  const { daemon_url, daemon_api_key } = req.body
  if (!daemon_url) return res.json({ ok: false, error: '未配置 Daemon URL' })
  try {
    const url = `${daemon_url.replace(/\/$/, '')}/health`
    const r = await fetch(url, {
      headers: { 'Authorization': `Bearer ${daemon_api_key ?? ''}` },
      signal: AbortSignal.timeout(5000),
    })
    if (!r.ok) return res.json({ ok: false, error: `HTTP ${r.status}` })
    const data = await r.json()
    res.json({ ok: true, ...data })
  } catch (err) {
    res.json({ ok: false, error: err.message })
  }
})

// get_opc_office — get the office assigned to an OPC
router.post('/get_opc_office', (req, res) => {
  try {
    const { opc_id } = req.body
    const opc = db.prepare('SELECT office_id FROM opc_config WHERE id = ?').get(opc_id)
    if (!opc?.office_id) return res.json(null)
    const row = db.prepare('SELECT * FROM offices WHERE id = ?').get(opc.office_id)
    res.json(row ? rowToOffice(row) : null)
  } catch (err) {
    res.status(500).send(err.message)
  }
})

export default router
