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
  } catch (_) {
    // ignore logging errors
  }
}

// start_deployment
router.post('/start_deployment', (req, res) => {
  try {
    const { opc_name } = req.body
    const id = randomUUID()
    const createdAt = now()

    db.prepare(`
      INSERT INTO deployment_tasks (id, opc_name, status, steps, current_step, created_at)
      VALUES (?, ?, 'PENDING', ?, 0, ?)
    `).run(id, opc_name, JSON.stringify(STEPS), createdAt)

    writeLog('INFO', 'deployment', `Deployment started for ${opc_name} (task: ${id})`)

    // Async simulation (fire and forget)
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
      } catch (_) {}
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

// get_recent_deployments
router.post('/get_recent_deployments', (req, res) => {
  try {
    const { opc_name, limit = 10 } = req.body
    const rows = db.prepare(`
      SELECT * FROM deployment_tasks WHERE opc_name = ? ORDER BY created_at DESC LIMIT ?
    `).all(opc_name, limit)
    res.json(rows)
  } catch (err) {
    res.status(500).send(err.message)
  }
})

export default router
