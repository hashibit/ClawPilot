import { Router } from 'express'
import { execSync, spawn } from 'child_process'
import { existsSync, unlinkSync } from 'fs'
import { createLogger } from '../logger.js'
import http from 'http'

const OPENCLAW_BIN = process.env.OPENCLAW_BIN || 'openclaw'

// ── Helpers ───────────────────────────────────────────────────

/** Find the local office row (address = 'localhost') that has a daemon_url. */
function getLocalDaemon(db) {
  return db.prepare(
    "SELECT daemon_url, daemon_api_key FROM offices WHERE address = 'localhost' AND daemon_url IS NOT NULL LIMIT 1"
  ).get()
}

/** GET {daemon_url}/health with auth header. Throws on network/HTTP error. */
async function fetchDaemonHealth(daemonUrl, apiKey) {
  const url = new URL(daemonUrl)
  return new Promise((resolve, reject) => {
    const options = {
      hostname: url.hostname,
      port: parseInt(url.port, 10) || (url.protocol === 'https:' ? 443 : 80),
      path: '/health',
      method: 'GET',
      timeout: 3000,
      headers: { 'Authorization': `Bearer ${apiKey ?? ''}` }
    }
    const req = http.request(options, (res) => {
      let data = ''
      res.on('data', chunk => data += chunk)
      res.on('end', () => {
        try {
          if (res.statusCode !== 200) {
            return reject(new Error(`daemon health returned ${res.statusCode}`))
          }
          resolve(JSON.parse(data))
        } catch (e) {
          reject(new Error(`Failed to parse daemon response: ${e.message}`))
        }
      })
    })
    req.on('error', err => reject(err))
    req.on('timeout', () => {
      req.destroy()
      reject(new Error('Request timeout'))
    })
    req.end()
  })
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
  const daemon = getLocalDaemon(db)
  if (!daemon) return

  try {
    const health = await fetchDaemonHealth(daemon.daemon_url, daemon.daemon_api_key)
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

  // Kick off an immediate probe then schedule every 120s
  probeLocalStatus(db, log)
  setInterval(() => probeLocalStatus(db, log), PROBE_INTERVAL_MS)

  // POST /api/get_process_status — returns cached probe result
  router.post('/get_process_status', (_req, res) => {
    res.json(cachedStatus)
  })

  // POST /api/start_openclaw
  router.post('/start_openclaw', (req, res) => {
    try {
      const child = spawn(OPENCLAW_BIN, ['gateway', 'start'], {
        detached: true,
        stdio: 'ignore',
      })
      child.unref()
      log.info('start_openclaw: spawned openclaw gateway start')
      res.json({ ok: true, message: 'started' })
    } catch (err) {
      log.error(`start_openclaw: ${err.message}`)
      res.status(500).json({ ok: false, message: err.message })
    }
  })

  // POST /api/stop_openclaw
  router.post('/stop_openclaw', (_req, res) => {
    try {
      execSync(`${OPENCLAW_BIN} gateway stop`, { timeout: 5000 })
      log.info('stop_openclaw: openclaw gateway stop succeeded')
      res.json({ ok: true, message: 'stopped' })
    } catch (err) {
      log.error(`stop_openclaw: ${err.message}`)
      res.status(500).json({ ok: false, message: err.message })
    }
  })

  // POST /api/reload_openclaw
  router.post('/reload_openclaw', (_req, res) => {
    try {
      execSync(`${OPENCLAW_BIN} gateway restart`, { timeout: 10000 })
      log.info('reload_openclaw: openclaw gateway restart succeeded')
      res.json({ ok: true, message: 'reloaded' })
    } catch (err) {
      log.error(`reload_openclaw: ${err.message}`)
      res.status(500).json({ ok: false, message: err.message })
    }
  })

  return router
}

// Backward compatibility
export default createProcessRouter
