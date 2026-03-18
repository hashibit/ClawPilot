import { Router } from 'express'
import db from '../db.js'
import { randomUUID } from 'crypto'

const router = Router()
const now = () => Math.floor(Date.now() / 1000)

const STEPS = ['准备配置文件', '写入目标目录', '重载进程', '健康检查']

function writeLog(level, component, message) {
  try {
    db.prepare(`
      INSERT INTO log_entries (timestamp, level, component, message)
      VALUES (?, ?, ?, ?)
    `).run(now(), level, component, message)
  } catch (_) {}
}

// start_deployment — opc_id + office_id required
router.post('/start_deployment', (req, res) => {
  try {
    const { opc_id, office_id } = req.body
    if (!opc_id || !office_id) return res.status(400).send('opc_id and office_id are required')

    const opc = db.prepare('SELECT * FROM opc_config WHERE id = ?').get(opc_id)
    if (!opc) return res.status(400).send('OPC not found')

    const office = db.prepare('SELECT * FROM offices WHERE id = ?').get(office_id)
    if (!office) return res.status(400).send('Office not found')

    // Check office not already occupied
    const occupied = db.prepare(
      "SELECT id FROM office_deployments WHERE office_id = ? AND is_active = 1"
    ).get(office_id)
    if (occupied) return res.status(400).send('该办公室已被占用')

    const id = randomUUID()
    const createdAt = now()

    db.prepare(`
      INSERT INTO deployment_tasks (id, opc_id, office_id, opc_name, status, steps, current_step, created_at)
      VALUES (?, ?, ?, ?, 'PENDING', ?, 0, ?)
    `).run(id, opc_id, office_id, opc.name, JSON.stringify(STEPS), createdAt)

    writeLog('INFO', 'deployment', `Deployment started: ${opc.name} → ${office.name} (task: ${id})`)

    setTimeout(() => {
      try {
        db.prepare(`UPDATE deployment_tasks SET status = 'RUNNING', current_step = 1, started_at = ? WHERE id = ?`)
          .run(now(), id)
        writeLog('INFO', 'deployment', `Step 1: ${STEPS[0]}`)
      } catch (_) {}
    }, 500)

    setTimeout(() => {
      try {
        db.prepare(`UPDATE deployment_tasks SET current_step = 2 WHERE id = ?`).run(id)
        writeLog('INFO', 'deployment', `Step 2: ${STEPS[1]}`)
      } catch (_) {}
    }, 1000)

    setTimeout(() => {
      try {
        db.prepare(`UPDATE deployment_tasks SET current_step = 3 WHERE id = ?`).run(id)
        writeLog('INFO', 'deployment', `Step 3: ${STEPS[2]}`)
      } catch (_) {}
    }, 1500)

    setTimeout(() => {
      try {
        db.prepare(`UPDATE deployment_tasks SET status = 'SUCCESS', current_step = 4, completed_at = ? WHERE id = ?`)
          .run(now(), id)
        writeLog('INFO', 'deployment', `Step 4: ${STEPS[3]} - Deployment SUCCESS`)

        // Deactivate any previous deployments for this OPC
        db.prepare(`UPDATE office_deployments SET is_active = 0, undeployed_at = ? WHERE opc_id = ? AND is_active = 1`)
          .run(now(), opc_id)

        // Record new active deployment
        const deployId = randomUUID()
        db.prepare(`
          INSERT INTO office_deployments (id, opc_id, opc_name, office_id, office_name, deployed_at, is_active)
          VALUES (?, ?, ?, ?, ?, ?, 1)
        `).run(deployId, opc_id, opc.name, office_id, office.name, now())

        // Mark OPC as running, linked to office
        db.prepare(`UPDATE opc_config SET is_running = 1, office_id = ? WHERE id = ?`)
          .run(office_id, opc_id)
      } catch (e) { writeLog('ERROR', 'deployment', e.message) }
    }, 2000)

    res.json(id)
  } catch (err) {
    res.status(500).send(err.message)
  }
})

// get_deployment_status
router.post('/get_deployment_status', (req, res) => {
  try {
    const { task_id } = req.body
    const row = db.prepare('SELECT * FROM deployment_tasks WHERE id = ?').get(task_id)
    if (!row) throw new Error(`Not found: ${task_id}`)
    res.json(row)
  } catch (err) {
    res.status(500).send(err.message)
  }
})

// cancel_deployment
router.post('/cancel_deployment', (req, res) => {
  try {
    const { task_id } = req.body
    db.prepare(`
      UPDATE deployment_tasks SET status = 'FAILED', message = 'Cancelled', completed_at = ?
      WHERE id = ?
    `).run(now(), task_id)
    res.json(null)
  } catch (err) {
    res.status(500).send(err.message)
  }
})

// undeploy — stop a running OPC
router.post('/undeploy', (req, res) => {
  try {
    const { opc_id } = req.body
    const ts = now()
    db.prepare(`UPDATE office_deployments SET is_active = 0, undeployed_at = ? WHERE opc_id = ? AND is_active = 1`)
      .run(ts, opc_id)
    db.prepare(`UPDATE opc_config SET is_running = 0, office_id = NULL WHERE id = ?`)
      .run(opc_id)
    writeLog('INFO', 'deployment', `Undeployed opc_id=${opc_id}`)
    res.json(null)
  } catch (err) {
    res.status(500).send(err.message)
  }
})

// get_recent_deployments — by opc_id (preferred) or opc_name (compat)
router.post('/get_recent_deployments', (req, res) => {
  try {
    const { opc_id, opc_name, limit = 10 } = req.body
    let rows
    if (opc_id) {
      rows = db.prepare(`
        SELECT dt.*, off.name as office_name FROM deployment_tasks dt
        LEFT JOIN offices off ON dt.office_id = off.id
        WHERE dt.opc_id = ? ORDER BY dt.created_at DESC LIMIT ?
      `).all(opc_id, limit)
    } else {
      rows = db.prepare(`
        SELECT dt.*, off.name as office_name FROM deployment_tasks dt
        LEFT JOIN offices off ON dt.office_id = off.id
        WHERE dt.opc_name = ? ORDER BY dt.created_at DESC LIMIT ?
      `).all(opc_name, limit)
    }
    res.json(rows)
  } catch (err) {
    res.status(500).send(err.message)
  }
})

// get_office_deployments — deployment history for a specific office
router.post('/get_office_deployments', (req, res) => {
  try {
    const { office_id, limit = 20 } = req.body
    const rows = db.prepare(`
      SELECT * FROM office_deployments WHERE office_id = ? ORDER BY deployed_at DESC LIMIT ?
    `).all(office_id, limit)
    res.json(rows)
  } catch (err) {
    res.status(500).send(err.message)
  }
})

export default router
