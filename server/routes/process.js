import { Router } from 'express'
import { execSync, spawn } from 'child_process'
import { existsSync, unlinkSync, readFileSync } from 'fs'
import { createLogger } from '../logger.js'
import { join } from 'path'
import { homedir } from 'os'

const OPENCLAW_BIN = process.env.OPENCLAW_BIN || 'openclaw'

// ── Local daemon config (hardcoded for localhost mode) ───────────────────────────

const LOCAL_DAEMON = {
  daemon_url: 'http://localhost:16668',
  daemon_api_key: (() => {
    // Try to read from ~/.clawpilot/daemon.key
    const keyPath = join(homedir(), '.clawpilot', 'daemon.key')
    if (existsSync(keyPath)) {
      const key = readFileSync(keyPath, 'utf-8').trim()
      if (key) return key
    }
    return ''
  })()
}

// ── Helpers ───────────────────────────────────────────────────

/** GET local daemon health. Throws on network/HTTP error. */
async function fetchDaemonHealth() {
  if (!LOCAL_DAEMON.daemon_api_key) {
    throw new Error('daemon API key not found')
  }
  const response = await fetch(`${LOCAL_DAEMON.daemon_url}/health`, {
    headers: { 'Authorization': `Bearer ${LOCAL_DAEMON.daemon_api_key}` }
  })
  if (!response.ok) {
    throw new Error(`daemon health returned ${response.status}`)
  }
  return await response.json()
}

function getUptimeSeconds(pid) {
  try {
    // macOS/Linux: ps -o etime= -p <pid>  →  [[DD-]HH:]MM:SS
    const raw = execSync(`ps -o etime= -p ${pid}`, { timeout: 2000 }).toString().trim()
    const parts = raw.split(':').map(Number).reverse()
    let secs = (parts[0] || 0) + (parts[1] || 0) * 60 + (parts[2] || 0) * 3600
    if (parts[3] !== undefined) secs += parts[3] * 86400
    return secs
  } catch {
    return null
  }
}

// ── Scheduled probe ───────────────────────────────────────────

const PROBE_INTERVAL_MS = 120_000

/** In-memory cache of the last probe result. */
let cachedStatus = { is_running: false, pid: null, uptime_seconds: null, probed_at: null }

async function probeLocalStatus(db, log) {
  try {
    const health = await fetchDaemonHealth()
    const is_running = health.openclaw_status === 'running'
    const pid = health.openclaw_pid ?? null
    const uptime_seconds = (is_running && pid) ? getUptimeSeconds(pid) : null
    cachedStatus = { is_running, pid, uptime_seconds, probed_at: Date.now() }
    log.info(`probe: openclaw ${is_running ? 'running' : 'stopped'} pid=${pid}`)
  } catch (err) {
    cachedStatus = { is_running: false, pid: null, uptime_seconds: null, probed_at: Date.now() }
    log.warn(`probe: daemon unreachable — ${err.message}`)
  }
}

// ── Router ────────────────────────────────────────────────────

export function createProcessRouter(db) {
  const log = createLogger('process')
  const router = Router()

  function writeLog(level, message) {
    try {
      db.prepare('INSERT INTO log_entries (timestamp, level, component, message) VALUES (?, ?, ?, ?)')
        .run(Math.floor(Date.now() / 1000), level, 'process', message)
    } catch (_) {}
    const lvl = level.toLowerCase()
    if (lvl === 'error') log.error(message)
    else if (lvl === 'warn') log.warn(message)
    else log.info(message)
  }

  // Kick off an immediate probe then schedule every 120s
  probeLocalStatus(db, log)
  setInterval(() => probeLocalStatus(db, log), PROBE_INTERVAL_MS)

  // POST /api/get_process_status — 实时转发到 daemon 查询
  router.post('/get_process_status', async (_req, res) => {
    try {
      const health = await fetchDaemonHealth()
      const is_running = health.openclaw_status === 'running'
      const pid = health.openclaw_pid ?? null
      const uptime_seconds = (is_running && pid) ? getUptimeSeconds(pid) : null
      res.json({ is_running, pid, uptime_seconds, probed_at: Date.now(), daemon_available: true })
    } catch (err) {
      log.warn(`get_process_status: daemon unreachable — ${err.message}`)
      res.json({ is_running: false, pid: null, uptime_seconds: null, probed_at: Date.now(), daemon_available: false, daemon_error: err.message })
    }
  })

  // POST /api/start_openclaw
  router.post('/start_openclaw', (req, res) => {
    try {
      const child = spawn(OPENCLAW_BIN, ['gateway', 'start'], {
        detached: true,
        stdio: 'ignore',
      })
      child.unref()
      writeLog('INFO', 'openclaw gateway start 已触发')
      res.json({ ok: true, message: 'started' })
    } catch (err) {
      writeLog('ERROR', `start_openclaw 失败: ${err.message}`)
      res.status(500).json({ ok: false, message: err.message })
    }
  })

  // POST /api/stop_openclaw
  router.post('/stop_openclaw', (_req, res) => {
    try {
      execSync(`${OPENCLAW_BIN} gateway stop`, { timeout: 5000 })
      writeLog('INFO', 'openclaw gateway stop 已执行')
      res.json({ ok: true, message: 'stopped' })
    } catch (err) {
      writeLog('ERROR', `stop_openclaw 失败: ${err.message}`)
      res.status(500).json({ ok: false, message: err.message })
    }
  })

  // POST /api/reload_openclaw
  router.post('/reload_openclaw', (_req, res) => {
    try {
      execSync(`${OPENCLAW_BIN} gateway restart`, { timeout: 10000 })
      writeLog('INFO', 'openclaw gateway reload 已执行')
      res.json({ ok: true, message: 'reloaded' })
    } catch (err) {
      writeLog('ERROR', `reload_openclaw 失败: ${err.message}`)
      res.status(500).json({ ok: false, message: err.message })
    }
  })

  // POST /api/restart_openclaw — 通过 daemon 重启 openclaw gateway
  router.post('/restart_openclaw', async (_req, res) => {
    const daemon = LOCAL_DAEMON.daemon_api_key ? LOCAL_DAEMON : null
    if (!daemon) {
      return res.status(503).json({ ok: false, message: '本地 office 未配置 daemon' })
    }
    try {
      const r = await fetch(`${daemon.daemon_url}/restart_openclaw`, {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${daemon.daemon_api_key ?? ''}` },
        signal: AbortSignal.timeout(15000),
      })
      const data = await r.json()
      writeLog(data.ok ? 'INFO' : 'WARN', `openclaw gateway restart: daemon responded ok=${data.ok}`)
      res.json(data)
    } catch (err) {
      writeLog('ERROR', `restart_openclaw 失败: ${err.message}`)
      res.status(500).json({ ok: false, message: err.message })
    }
  })

  return router
}

// Backward compatibility
export default createProcessRouter
