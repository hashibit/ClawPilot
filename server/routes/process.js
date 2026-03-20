import { Router } from 'express'
import { execSync, spawn } from 'child_process'
import { existsSync, readFileSync, writeFileSync, unlinkSync } from 'fs'
import { join } from 'path'
import { homedir } from 'os'
import { createLogger } from '../logger.js'
const log = createLogger('process')

const router = Router()

const PID_FILE = join(homedir(), '.openclaw', 'openclaw.pid')
const OPENCLAW_BIN = process.env.OPENCLAW_BIN || 'openclaw'

function readPid() {
  try {
    if (!existsSync(PID_FILE)) return null
    const pid = parseInt(readFileSync(PID_FILE, 'utf8').trim(), 10)
    return isNaN(pid) ? null : pid
  } catch {
    return null
  }
}

function isPidAlive(pid) {
  try {
    process.kill(pid, 0)
    return true
  } catch {
    return false
  }
}

function findOpenClawPid() {
  // First try PID file
  const pid = readPid()
  if (pid && isPidAlive(pid)) return pid

  // Fallback: pgrep
  try {
    const out = execSync('pgrep -x openclaw', { timeout: 2000 }).toString().trim()
    const p = parseInt(out, 10)
    return isNaN(p) ? null : p
  } catch {
    return null
  }
}

function getUptimeSeconds(pid) {
  try {
    // macOS: ps -o etime= -p <pid>  →  [[DD-]HH:]MM:SS
    const raw = execSync(`ps -o etime= -p ${pid}`, { timeout: 2000 }).toString().trim()
    const parts = raw.split(':').map(Number).reverse()
    let secs = (parts[0] || 0) + (parts[1] || 0) * 60 + (parts[2] || 0) * 3600
    if (parts[3] !== undefined) secs += parts[3] * 86400 // days
    return secs
  } catch {
    return null
  }
}

// POST /api/get_process_status
router.post('/get_process_status', (_req, res) => {
  const pid = findOpenClawPid()
  if (!pid) {
    return res.json({ is_running: false, pid: null, uptime_seconds: null })
  }
  res.json({ is_running: true, pid, uptime_seconds: getUptimeSeconds(pid) })
})

// POST /api/start_openclaw
router.post('/start_openclaw', (req, res) => {
  const existingPid = findOpenClawPid()
  if (existingPid) {
    log.info(`start_openclaw: already running pid=${existingPid}`)
    return res.json({ ok: true, message: 'already_running', pid: existingPid })
  }

  try {
    const child = spawn(OPENCLAW_BIN, [], {
      detached: true,
      stdio: 'ignore',
    })
    child.unref()
    // Give it a moment then verify
    setTimeout(() => {
      const pid = findOpenClawPid()
      if (pid) {
        log.info(`start_openclaw: started pid=${pid}`)
        res.json({ ok: true, message: 'started', pid })
      } else {
        log.error('start_openclaw: process launched but pid not found')
        res.status(500).json({ ok: false, message: 'started_but_pid_not_found' })
      }
    }, 800)
  } catch (err) {
    log.error(`start_openclaw: ${err.message}`)
    res.status(500).json({ ok: false, message: err.message })
  }
})

// POST /api/stop_openclaw
router.post('/stop_openclaw', (_req, res) => {
  const pid = findOpenClawPid()
  if (!pid) {
    log.info('stop_openclaw: not running')
    return res.json({ ok: true, message: 'not_running' })
  }
  try {
    process.kill(pid, 'SIGTERM')
    // Clean up stale PID file
    try { if (existsSync(PID_FILE)) unlinkSync(PID_FILE) } catch {}
    log.info(`stop_openclaw: sent SIGTERM to pid=${pid}`)
    res.json({ ok: true, message: 'stopped', pid })
  } catch (err) {
    log.error(`stop_openclaw: ${err.message}`)
    res.status(500).json({ ok: false, message: err.message })
  }
})

// POST /api/reload_openclaw
router.post('/reload_openclaw', (_req, res) => {
  const pid = findOpenClawPid()
  if (!pid) {
    return res.status(400).json({ ok: false, message: 'not_running' })
  }
  try {
    process.kill(pid, 'SIGHUP')
    log.info(`reload_openclaw: sent SIGHUP to pid=${pid}`)
    res.json({ ok: true, message: 'reloaded', pid })
  } catch (err) {
    log.error(`reload_openclaw: ${err.message}`)
    res.status(500).json({ ok: false, message: err.message })
  }
})

export default router
