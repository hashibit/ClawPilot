import { Router } from 'express'
import { spawn } from 'child_process'
import { exec as execCb } from 'child_process'
import { promisify } from 'util'
import { existsSync, readFileSync, statSync } from 'fs'
import { join, resolve } from 'path'
import { homedir } from 'os'
import { fileURLToPath } from 'url'
import { createLogger } from '../logger.js'
import { encrypt, decrypt } from '../utils/crypto.js'
import { sshExecRaw, checkConnection, detectArch, commandExists, readFile, uploadFile } from '../utils/ssh.js'

const log = createLogger('office')

// ── Install SSE Clients ───────────────────────────────────────
// Map of office_id -> Set of SSE clients
const installSseClients = new Map()

/**
 * Analyze a log line and determine its type for styling
 * @param {string} line - The log line to analyze
 * @returns {{ type: string, message: string }} - Type and cleaned message
 */
function classifyLogLine(line) {
  const trimmed = line.trim()
  if (!trimmed) return { type: 'empty', message: '' }

  // Step/Progress markers: [1/3], [2/3], etc.
  if (/^\[\d+\/\d+\]/.test(trimmed)) {
    return { type: 'step', message: trimmed }
  }

  // Success markers: ✓, ✔
  if (/^[✓✔]/.test(trimmed)) {
    return { type: 'success', message: trimmed }
  }

  // Detail lines: · (middle dot)
  if (/^[·•]/.test(trimmed)) {
    return { type: 'detail', message: trimmed }
  }

  // Progress percentage: 50%, 100.0%
  if (/^\d+\.?\d*%$/.test(trimmed)) {
    return { type: 'progress', message: trimmed }
  }

  // Error indicators
  if (/^[✗✘❌❗⚠]|ERROR|FAIL|error:|failed/i.test(trimmed)) {
    return { type: 'error', message: trimmed }
  }

  // Warning indicators
  if (/^⚠|WARN|warning/i.test(trimmed)) {
    return { type: 'warning', message: trimmed }
  }

  // Banner/Title: 🦞, emoji at start
  if (/^[🦞🎯🚀📦🔧🔍🔑💾📡📥📤🔐✨]/.test(trimmed)) {
    return { type: 'banner', message: trimmed }
  }

  // Key-value pairs: "OS: linux", "Install method: npm"
  if (/^(OS|Install|Requested|Onboarding|Active|Detected|Version|Path|URL|Environment|Executing|Checking):/i.test(trimmed)) {
    return { type: 'keyvalue', message: trimmed }
  }

  // Default: info
  return { type: 'info', message: trimmed }
}

/**
 * Broadcast install log to all SSE clients for a specific office
 * Supports two formats:
 *   - {key, params, type} - i18n key format, frontend will translate
 *   - {message, type} - plain message format (for raw output like script stdout)
 */
function broadcastInstallLog(officeId, payload) {
  const clients = installSseClients.get(officeId)
  if (!clients || clients.size === 0) return

  // Handle both formats
  let dataToSend
  if (typeof payload === 'string') {
    // Legacy string format
    const classified = classifyLogLine(payload)
    dataToSend = { message: classified.message, type: classified.type, timestamp: Date.now() }
  } else if (payload.key) {
    // i18n key format
    dataToSend = { key: payload.key, params: payload.params || {}, type: payload.type || 'info', timestamp: Date.now() }
  } else if (payload.message) {
    // Plain message object - preserve type if provided
    const classified = classifyLogLine(payload.message)
    dataToSend = { message: classified.message, type: payload.type || classified.type, timestamp: Date.now() }
  } else {
    return // Invalid payload
  }

  const data = `data: ${JSON.stringify(dataToSend)}\n\n`
  for (const client of clients) {
    try {
      client.write(data)
    } catch (e) {
      clients.delete(client)
    }
  }
}

/**
 * Helper to create i18n-key-based log entry
 */
function logKey(key, params = {}, type = 'info') {
  return { key, params, type }
}

const EMPTY_OPENCLAW_CONFIG = JSON.stringify({
  agents: { defaults: {}, list: [] },
  channels: {},
  models: { providers: {} },
}, null, 2)

const execAsync = promisify(execCb)
const __dirname = fileURLToPath(new URL('.', import.meta.url))

const stripAnsi = (s) => s
  .replace(/\x1b\[[0-9;:]*[mGKHFABCDEFJKSTsuhl]/g, '')
  .replace(/\x1b[()][A-Z0-9]/g, '')
  .replace(/\r\n/g, '\n').replace(/\r/g, '\n')
  .replace(/[\x00-\x08\x0b\x0c\x0e-\x1f]/g, '')

async function findDaemonBinary({ linux = false, arch = 'aarch64' } = {}) {
  if (!linux) {
    try {
      const { stdout } = await execAsync('which clawpilot-daemon')
      const p = stdout.trim()
      if (p && existsSync(p)) return p
    } catch {}
  }
  const base = join(__dirname, '..', '..', 'daemon', 'target')
  const ARCH_TO_TARGET = {
    'aarch64': ['aarch64-unknown-linux-gnu', 'aarch64-unknown-linux-musl'],
    'arm64':   ['aarch64-unknown-linux-gnu', 'aarch64-unknown-linux-musl'],
    'x86_64':  ['x86_64-unknown-linux-gnu', 'x86_64-unknown-linux-musl'],
    'x86':     ['i686-unknown-linux-gnu'],
  }
  const candidates = linux
    ? (ARCH_TO_TARGET[arch] ?? ARCH_TO_TARGET['x86_64']).flatMap(triple => [
        join(base, triple, 'release', 'clawpilot-daemon'),
        join(base, triple, 'debug', 'clawpilot-daemon'),
      ])
    : [
        join(base, 'release', 'clawpilot-daemon'),
        join(base, 'debug', 'clawpilot-daemon'),
      ]
  for (const c of candidates) {
    if (existsSync(resolve(c))) return resolve(c)
  }
  return null
}

async function isDaemonRunning(url) {
  try {
    const r = await fetch(`${url}/health`, { signal: AbortSignal.timeout(2000) })
    return r.ok
  } catch { return false }
}

function readLocalKey() {
  try {
    return readFileSync(join(homedir(), '.clawpilot', 'daemon.key'), 'utf8').trim() || null
  } catch { return null }
}

function rowToOffice(row) {
  if (!row) return null
  return {
    ...row,
    access_password: decrypt(row.access_password),
    daemon_api_key: decrypt(row.daemon_api_key),
  }
}

export function createOfficeRouter(db) {
  const router = Router()
  const now = () => Math.floor(Date.now() / 1000)

  function writeLog(level, message) {
    try {
      db.prepare('INSERT INTO log_entries (timestamp, level, component, message) VALUES (?, ?, ?, ?)')
        .run(Math.floor(Date.now() / 1000), level, 'office', message)
    } catch (_) {}
    const lvl = level.toLowerCase()
    if (lvl === 'error') log.error(message)
    else if (lvl === 'warn') log.warn(message)
    else log.info(message)
  }

  // get_offices
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
      res.status(500).json({ error: err.message })
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
      res.status(500).json({ error: err.message })
    }
  })

  // create_office
  router.post('/create_office', (req, res) => {
    try {
      const { office } = req.body
      db.prepare(`
        INSERT INTO offices
          (id, name, address,
           access_auth_type, access_user, access_password, ssh_key_path,
           phone, receptionist_image,
           ownership, monthly_rent, internet_speed, decoration_grade, description,
           daemon_url, daemon_api_key, created_at, updated_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `).run(
        office.id, office.name,
        office.address ?? null,
        office.access_auth_type ?? 'password', office.access_user ?? null,
        encrypt(office.access_password ?? null), office.ssh_key_path ?? null,
        office.phone ?? null, office.receptionist_image ?? null,
        office.ownership ?? 'RENTED', office.monthly_rent ?? null,
        office.internet_speed ?? null, office.decoration_grade ?? 'MEDIUM',
        office.description ?? null,
        office.daemon_url ?? null, encrypt(office.daemon_api_key ?? null),
        office.created_at ?? now(), office.updated_at ?? now()
      )
      writeLog('INFO', `办公室已创建: ${office.name} (${office.id})`)
      res.json(office.id)
    } catch (err) {
      res.status(500).json({ error: err.message })
    }
  })

  // update_office
  router.post('/update_office', (req, res) => {
    try {
      const { id, office } = req.body
      db.prepare(`
        UPDATE offices SET
          name = ?, address = ?,
          access_auth_type = ?, access_user = ?, access_password = ?, ssh_key_path = ?,
          phone = ?, receptionist_image = ?,
          ownership = ?, monthly_rent = ?, internet_speed = ?, decoration_grade = ?,
          description = ?, daemon_url = ?, daemon_api_key = ?, opc_root = ?, updated_at = ?
        WHERE id = ?
      `).run(
        office.name,
        office.address ?? null,
        office.access_auth_type ?? 'password', office.access_user ?? null,
        encrypt(office.access_password ?? null), office.ssh_key_path ?? null,
        office.phone ?? null, office.receptionist_image ?? null,
        office.ownership ?? 'RENTED', office.monthly_rent ?? null,
        office.internet_speed ?? null, office.decoration_grade ?? 'MEDIUM',
        office.description ?? null,
        office.daemon_url ?? null, encrypt(office.daemon_api_key ?? null),
        office.opc_root ?? null,
        now(), id
      )
      res.json(null)
    } catch (err) {
      res.status(500).json({ error: err.message })
    }
  })

  // delete_office
  router.post('/delete_office', (req, res) => {
    try {
      const { id } = req.body
      db.prepare('UPDATE opc_config SET office_id = NULL WHERE office_id = ?').run(id)
      db.prepare('DELETE FROM offices WHERE id = ?').run(id)
      writeLog('INFO', `办公室已删除: ${id}`)
      res.json(null)
    } catch (err) {
      res.status(500).json({ error: err.message })
    }
  })

  // assign_office
  router.post('/assign_office', (req, res) => {
    try {
      const { opc_id, office_id } = req.body
      db.prepare('UPDATE opc_config SET office_id = ? WHERE id = ?').run(
        office_id ?? null, opc_id
      )
      writeLog('INFO', `OPC ${opc_id} 分配到办公室 ${office_id ?? '(无)'}`)
      res.json(null)
    } catch (err) {
      res.status(500).json({ error: err.message })
    }
  })

  // check_daemon_health
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
      // Translate common errors to user-friendly messages
      const msg = err.message || ''
      if (msg.includes('abort') || msg.includes('timeout') || msg.includes('Timeout')) {
        res.json({ ok: false, error: '连接超时', not_installed: true })
      } else if (msg.includes('ECONNREFUSED') || msg.includes('connect')) {
        res.json({ ok: false, error: '无法连接', not_installed: true })
      } else {
        res.json({ ok: false, error: '连接失败' })
      }
    }
  })

  // check_ssh_connection — TCP probe to host:port (default 22)
  router.post('/check_ssh_connection', async (req, res) => {
    const { host, port = 22 } = req.body
    if (!host) return res.json({ ok: false, error: '未提供主机地址' })
    const net = await import('net')
    const start = Date.now()
    try {
      await new Promise((resolve, reject) => {
        const socket = net.default.createConnection({ host, port: Number(port) })
        socket.setTimeout(5000)
        socket.once('connect', () => { socket.destroy(); resolve() })
        socket.once('timeout', () => { socket.destroy(); reject(new Error('连接超时') ) })
        socket.once('error', reject)
      })
      res.json({ ok: true, latency_ms: Date.now() - start })
    } catch (err) {
      res.json({ ok: false, error: err.message })
    }
  })

  // check_ssh_auth — validate IP/IP:port format and test actual SSH authentication
  router.post('/check_ssh_auth', async (req, res) => {
    const { address, auth_type, user = 'root', password, key_path } = req.body
    if (!address) return res.json({ ok: false, error: '未提供地址' })

    // Validate address: must be IP or IP:port (not arbitrary hostname)
    const ipPortRe = /^(\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3})(?::(\d+))?$/
    const m = address.match(ipPortRe)
    if (!m) return res.json({ ok: false, error: '地址格式无效，请填写 IP 或 IP:端口' })
    const octets = m[1].split('.').map(Number)
    if (octets.some(n => n > 255)) return res.json({ ok: false, error: 'IP 地址无效' })
    const host = m[1]
    const port = m[2] ? Number(m[2]) : 22
    const sshUser = user || 'root'
    // Validate SSH username
    if (!/^[a-zA-Z0-9._-]+$/.test(sshUser)) {
      return res.json({ ok: false, error: 'SSH 用户名格式无效' })
    }

    // Expand key path if needed
    const expandedKeyPath = key_path ? key_path.replace(/^~/, homedir()) : null
    if (auth_type === 'ssh_key' && expandedKeyPath && !existsSync(expandedKeyPath)) {
      return res.json({ ok: false, error: 'SSH 密钥文件不存在' })
    }

    const start = Date.now()
    try {
      const sshOpts = {
        host,
        port,
        user: sshUser,
        password: auth_type === 'password' ? password : undefined,
        keyPath: auth_type === 'ssh_key' ? expandedKeyPath : undefined,
        timeout: 5000,
      }
      await sshExecRaw(sshOpts, 'exit 0', { timeout: 5000 })
      res.json({ ok: true, latency_ms: Date.now() - start })
    } catch (err) {
      const msg = err.message || ''
      if (msg.includes('Authentication') || msg.includes('permission')) {
        res.json({ ok: false, error: '认证失败，请检查用户名和密码/密钥' })
      } else if (msg.includes('ECONNREFUSED') || msg.includes('connect')) {
        res.json({ ok: false, error: '无法连接到主机，请检查地址和端口' })
      } else {
        res.json({ ok: false, error: msg.split('\n')[0] })
      }
    }
  })

  // get_opc_office
  router.post('/get_opc_office', (req, res) => {
    try {
      const { opc_id } = req.body
      const opc = db.prepare('SELECT office_id FROM opc_config WHERE id = ?').get(opc_id)
      if (!opc?.office_id) return res.json(null)
      const row = db.prepare('SELECT * FROM offices WHERE id = ?').get(opc.office_id)
      res.json(row ? rowToOffice(row) : null)
    } catch (err) {
      res.status(500).json({ error: err.message })
    }
  })

  // install_daemon
  router.post('/install_daemon', async (req, res) => {
    const {
      office_id, mode = 'local', daemon_port = 16668,
      ssh_host, ssh_port = 22, ssh_user = 'root', ssh_key_path, ssh_config_file,
      ssh_password,
      daemon_host,
    } = req.body
    const logs = []
    // step function supports both plain message and i18n key format
    const step = (msgOrKey, params = {}) => {
      const isKeyFormat = typeof msgOrKey === 'string' && msgOrKey.startsWith('office.install.')
      let displayMsg, payload
      if (isKeyFormat) {
        displayMsg = `[i18n:${msgOrKey}]`
        payload = { key: msgOrKey, params, type: 'info' }
      } else {
        displayMsg = msgOrKey
        payload = displayMsg
      }
      logs.push(displayMsg)
      log.info(`[install_daemon] ${displayMsg}`)
      if (office_id) broadcastInstallLog(office_id, payload)
    }

    try {
      if (mode === 'local') {
        const listenAddr = `127.0.0.1:${daemon_port}`
        const daemonUrl = `http://127.0.0.1:${daemon_port}`

        if (await isDaemonRunning(daemonUrl)) {
          step('✅ Daemon 已在运行')
          const apiKey = readLocalKey()
          if (office_id && apiKey) {
            const existingOffice = db.prepare('SELECT initial_openclaw_config FROM offices WHERE id=?').get(office_id)
          const initialConfig = existingOffice?.initial_openclaw_config ?? EMPTY_OPENCLAW_CONFIG
          db.prepare('UPDATE offices SET daemon_url=?, daemon_api_key=?, initial_openclaw_config=?, updated_at=? WHERE id=?')
              .run(daemonUrl, encrypt(apiKey), initialConfig, now(), office_id)
          }
          return res.json({ ok: true, daemon_url: daemonUrl, api_key: apiKey, logs, already_running: true })
        }

        step('🔍 查找 daemon 二进制...')
        const binPath = await findDaemonBinary()
        if (!binPath) {
          return res.json({ ok: false, error: '未找到 clawpilot-daemon，请先 cargo build --release', logs })
        }
        step(`✅ 找到: ${binPath}`)

        step('🚀 启动 daemon...')
        const child = spawn(binPath, ['--listen', listenAddr], { detached: true, stdio: 'ignore' })
        child.unref()

        step('⏳ 等待启动...')
        let started = false
        for (let i = 0; i < 12; i++) {
          await new Promise(r => setTimeout(r, 700))
          if (await isDaemonRunning(daemonUrl)) { started = true; break }
        }
        if (!started) return res.json({ ok: false, error: 'office.install.timeout_startup', logs })
        step('✅ Daemon 已就绪')

        const apiKey = readLocalKey()
        step('🔑 API Key 已读取')

        if (office_id && apiKey) {
          db.prepare('UPDATE offices SET daemon_url=?, daemon_api_key=?, updated_at=? WHERE id=?')
            .run(daemonUrl, encrypt(apiKey), now(), office_id)
          step('💾 配置已自动保存')
        }
        writeLog('INFO', `daemon 安装完成 (local): ${daemonUrl}`)
        return res.json({ ok: true, daemon_url: daemonUrl, api_key: apiKey, logs })

      } else if (mode === 'ssh') {
        if (!ssh_host) return res.json({ ok: false, error: '请填写远程主机地址', logs })

        // Build SSH options
        const sshOpts = {
          host: ssh_host,
          port: ssh_port,
          user: ssh_user || 'root',
          password: ssh_password || undefined,
          keyPath: ssh_key_path || undefined,
        }

        // Log SSH auth method
        if (ssh_password) {
          step('office.install.ssh_password_auth')
        } else if (ssh_key_path) {
          step('office.install.ssh_key_auth', { keyPath: ssh_key_path })
        } else {
          step('office.install.ssh_default_key')
        }

        step('🔍 检测远程系统架构...')
        const { arch: remoteArch, os: remoteOs } = await detectArch(sshOpts)
        step(`✅ 远程系统: ${remoteOs} ${remoteArch}`)

        step('🔍 查找本地 daemon 二进制（Linux）...')
        const binPath = await findDaemonBinary({ linux: true, arch: remoteArch })
        if (!binPath) {
          return res.json({ ok: false, error: `未找到 ${remoteOs}/${remoteArch} 版 clawpilot-daemon 二进制，请先编译对应目标`, logs })
        }
        step(`✅ 找到: ${binPath}`)

        step('office.install.uploading_daemon')
        await uploadFile(sshOpts, binPath, '/tmp/clawpilot-daemon')
        await sshExecRaw(sshOpts, 'chmod +x /tmp/clawpilot-daemon && sudo mv /tmp/clawpilot-daemon /usr/local/bin/clawpilot-daemon')
        step('office.install.daemon_uploaded')

        step('🔧 安装 systemd 用户服务...')
        const serviceUnit = [
          '[Unit]',
          'Description=ClawPilot Deploy Daemon',
          'After=network.target',
          '',
          '[Service]',
          'Type=simple',
          `ExecStart=/usr/local/bin/clawpilot-daemon --listen 0.0.0.0:${daemon_port}`,
          'Restart=on-failure',
          'RestartSec=5',
          `Environment="PATH=/home/${ssh_user}/.npm-global/bin:/home/${ssh_user}/.local/bin:/usr/local/bin:/usr/bin:/bin"`,
          '',
          '[Install]',
          'WantedBy=default.target',
        ].join('\n')
        const encodedUnit = Buffer.from(serviceUnit).toString('base64')
        await sshExecRaw(sshOpts, `mkdir -p ~/.config/systemd/user && echo '${encodedUnit}' | base64 -d > ~/.config/systemd/user/clawpilot-daemon.service && systemctl --user daemon-reload && systemctl --user enable clawpilot-daemon && systemctl --user start clawpilot-daemon`)
        step('✅ systemd 用户服务已启用')

        step('⏳ 等待远程 daemon 就绪...')
        const bareHost = daemon_host || ssh_host
        const daemonUrl = `http://${bareHost}:${daemon_port}`
        let started = false
        for (let i = 0; i < 15; i++) {
          await new Promise(r => setTimeout(r, 1000))
          if (await isDaemonRunning(daemonUrl)) { started = true; break }
        }
        if (!started) return res.json({ ok: false, error: 'office.install.timeout_remote_startup', logs })
        step('✅ 远程 daemon 已就绪')

        const apiKey = await readFile(sshOpts, '~/.clawpilot/daemon.key').then(s => s.trim()).catch(() => null)
        step('🔑 API Key 已读取')

        if (office_id && apiKey) {
          db.prepare('UPDATE offices SET daemon_url=?, daemon_api_key=?, updated_at=? WHERE id=?')
            .run(daemonUrl, encrypt(apiKey), now(), office_id)
          step('💾 配置已自动保存')
        }
        writeLog('INFO', `daemon 安装完成 (ssh): ${daemonUrl}`)
        return res.json({ ok: true, daemon_url: daemonUrl, api_key: apiKey, logs })
      }

      res.json({ ok: false, error: '未知安装模式', logs })
    } catch (err) {
      step(`❌ ${err.message}`)
      writeLog('ERROR', `install_daemon 失败: ${err.message}`)
      res.json({ ok: false, error: err.message, logs })
    }
  })

  // install_openclaw
  router.post('/install_openclaw', async (req, res) => {
    const {
      office_id, mode = 'local',
      ssh_host, ssh_port = 22, ssh_user = 'root', ssh_key_path, ssh_config_file,
      ssh_password,
    } = req.body
    const logs = []
    // Log to array AND broadcast to SSE clients in real-time
    // Supports two formats:
    //   - lg('message', 'type') - plain message (for raw script output)
    //   - lg('office.install.key', { params }, 'type') - i18n key with params
    const lg = (msgOrKey, paramsOrLevel = {}, levelOrUndefined = 'info') => {
      // Detect format: if first arg starts with 'office.install.', it's an i18n key
      const isKeyFormat = typeof msgOrKey === 'string' && msgOrKey.startsWith('office.install.')
      let displayMsg, level, payload

      if (isKeyFormat) {
        const key = msgOrKey
        const params = typeof paramsOrLevel === 'object' ? paramsOrLevel : {}
        level = typeof levelOrUndefined === 'string' ? levelOrUndefined : 'info'
        // For logs array, we still need a display message - use key as placeholder
        // Frontend will translate via SSE
        displayMsg = `[i18n:${key}]`
        payload = { key, params, type: level }
      } else {
        displayMsg = msgOrKey
        level = typeof paramsOrLevel === 'string' ? paramsOrLevel : 'info'
        // Include type in payload so frontend can style it
        payload = { message: displayMsg, type: level }
      }

      logs.push(displayMsg)
      log.info(`[install_openclaw] ${displayMsg}`)
      if (office_id) {
        broadcastInstallLog(office_id, payload)
      }
    }

    // Helper to install git based on OS
    const installGitLocal = async () => {
      try {
        const { stdout } = await execAsync('which git', { timeout: 5000 })
        if (stdout.trim()) {
          lg('office.install.git_installed', { path: stdout.trim() })
          return true
        }
      } catch {}

      lg('office.install.installing_git')
      const platform = process.platform

      if (platform === 'darwin') {
        // macOS: use homebrew
        try {
          const { stdout: brewCheck } = await execAsync('which brew', { timeout: 5000 })
          if (brewCheck.trim()) {
            await execAsync('brew install git', { timeout: 120000 })
            lg('office.install.git_installed_pm', { pm: 'brew' })
            return true
          }
        } catch {}
        lg('office.install.homebrew_missing', {}, 'warning')
        return false
      } else if (platform === 'linux') {
        // Linux: try apt, then yum, then dnf
        // Use -n flag to avoid hanging on password prompt
        const pmCmds = [
          'sudo -n apt-get update && sudo -n apt-get install -y git',
          'sudo -n yum install -y git',
          'sudo -n dnf install -y git',
        ]
        for (const cmd of pmCmds) {
          try {
            await execAsync(cmd, { timeout: 120000 })
            lg('office.install.git_installed')
            return true
          } catch (err) {
            // Check if it's a password-required error
            if (err.message.includes('password') || err.message.includes('sudo')) {
              continue // Try next package manager
            }
          }
        }
        lg('office.install.sudo_password_needed', {}, 'warning')
        return false
      }

      lg('office.install.unknown_platform', { platform }, 'warning')
      return false
    }

    try {
      if (mode === 'local') {
        // Install git first
        lg('office.install.checking_git')
        await installGitLocal()

        lg('office.install.checking_openclaw')
        try {
          const { stdout } = await execAsync('which openclaw', { timeout: 5000 })
          if (stdout.trim()) {
            lg('office.install.openclaw_installed', { path: stdout.trim() })
          } else {
            throw new Error('not found')
          }
        } catch {
          lg('office.install.using_bundled_script')
          try {
            // Use bundled install script instead of downloading
            const scriptPath = join(__dirname, '..', '..', 'scripts', 'openclaw-install-20260406-080000.sh')
            if (!existsSync(scriptPath)) {
              throw new Error(`安装脚本不存在: ${scriptPath}`)
            }
            const scriptContent = readFileSync(scriptPath, 'utf8')
            lg(`   脚本路径: ${scriptPath}`)

            lg('office.install.running_script')
            lg('office.install.script_note')
            const scriptOut = await new Promise((resolve, reject) => {
              const chunks = []
              const errChunks = []
              const child = spawn('bash', [], {
                shell: false,
                env: {
                  ...process.env,
                  NO_PROMPT: '1',
                  VERBOSE: '1',
                  OPENCLAW_NO_PROMPT: '1',
                  OPENCLAW_NO_ONBOARD: '1',
                  NONINTERACTIVE: '1',
                  CI: '1',
                }
              })
              child.stdin.write(scriptContent)
              child.stdin.end()

              // Filter to remove duplicate info that ClawPilot already checked
              const filterLine = (line) => {
                const trimmed = line.trim()
                if (!trimmed) return null
                // Skip duplicate info - ClawPilot already checked these
                if (/^✓ Git already installed/.test(trimmed)) return null
                if (/^✓ Node\.js/.test(trimmed)) return null
                if (/^· Active Node\.js/.test(trimmed)) return null
                if (/^· Active npm/.test(trimmed)) return null
                return trimmed
              }

              child.stdout.on('data', d => {
                const s = stripAnsi(d.toString())
                if (s.trim()) {
                  s.trim().split('\n').forEach(line => {
                    const filtered = filterLine(line)
                    if (filtered) lg(`   ${filtered}`)
                  })
                }
                chunks.push(d)
              })
              child.stderr.on('data', d => {
                const s = stripAnsi(d.toString())
                if (s.trim()) {
                  s.trim().split('\n').forEach(line => {
                    const filtered = filterLine(line)
                    if (filtered) lg(`   ${filtered}`)
                  })
                }
                errChunks.push(d)
              })
              child.on('close', code => {
                if (code === 0) resolve(Buffer.concat(chunks).toString())
                else reject(new Error(`安装脚本失败 (exit ${code}): ${Buffer.concat(errChunks).toString()}`))
              })
              child.on('error', reject)
            })
            lg('office.install.script_done')
          } catch (err) {
            lg('office.install.script_failed', { error: err.message }, 'error')
            return res.json({ ok: false, error: err.message, logs })
          }
        }

        lg('office.install.registering_service')
        lg('office.install.running_onboard')
        try {
          const onboardOut = await new Promise((resolve, reject) => {
            const chunks = []
            const errChunks = []
            const child = spawn('openclaw', [
              'onboard',
              '--non-interactive',
              '--install-daemon',
              '--skip-skills',
              '--skip-health',
              '--accept-risk'
            ], { shell: false })

            // Filter to remove noise from onboard output
            const filterOnboardLine = (line) => {
              const trimmed = line.trim()
              if (!trimmed) return null
              // Skip verbose/less important lines
              if (/^·/.test(trimmed) && /checking|verifying|found/i.test(trimmed)) return null
              return trimmed
            }

            child.stdout.on('data', d => {
              const s = stripAnsi(d.toString())
              if (s.trim()) s.trim().split('\n').forEach(line => {
                const filtered = filterOnboardLine(line)
                if (filtered) lg(`   ${filtered}`)
              })
              chunks.push(d)
            })
            child.stderr.on('data', d => {
              const s = stripAnsi(d.toString())
              if (s.trim()) s.trim().split('\n').forEach(line => {
                const filtered = filterOnboardLine(line)
                if (filtered) lg(`   ${filtered}`)
              })
              errChunks.push(d)
            })
            child.on('close', code => {
              if (code === 0) resolve(Buffer.concat(chunks).toString())
              else reject(new Error(`onboard 失败 (exit ${code}): ${Buffer.concat(errChunks).toString()}`))
            })
            child.on('error', reject)
          })
          lg('office.install.service_done')
        } catch (err) {
          lg('office.install.service_failed', { error: err.message }, 'error')
          return res.json({ ok: false, error: err.message, logs })
        }

        lg('office.install.verifying')
        try {
          const { stdout: ver } = await execAsync('openclaw --version', { timeout: 10000 })
          if (!ver.trim()) throw new Error('openclaw --version 无输出')
          lg('office.install.openclaw_ready', { version: ver.trim() })
        } catch (err) {
          lg('office.install.verify_failed', { error: err.message }, 'error')
          return res.json({ ok: false, error: err.message, logs })
        }

        writeLog('INFO', 'openclaw 安装完成 (local)')
        return res.json({ ok: true, logs })

      } else if (mode === 'ssh') {
        if (!ssh_host) return res.json({ ok: false, error: '请填写远程主机地址', logs })

        // Build SSH options
        const sshOpts = {
          host: ssh_host,
          port: ssh_port,
          user: ssh_user || 'root',
          password: ssh_password || undefined,
          keyPath: ssh_key_path || undefined,
        }

        // Log SSH auth method
        if (ssh_password) {
          lg('office.install.ssh_password_auth')
        } else if (ssh_key_path) {
          lg('office.install.ssh_key_auth', { keyPath: ssh_key_path })
        } else {
          lg('office.install.ssh_default_key')
        }

        // Helper to run remote command with PATH set
        const sshExec = async (cmd, opts = {}) => {
          const fullCmd = `export PATH="$HOME/.npm-global/bin:$HOME/.local/bin:/usr/local/bin:$PATH" && ${cmd}`
          return sshExecRaw(sshOpts, fullCmd, opts)
        }

        // ── Ensure Node.js on remote (user-level, no sudo) ───────────────────────
        lg('office.install.checking_node')
        const nodeCheck = await sshExec('node --version 2>/dev/null || true', { timeout: 5000 })
        const nodeVersion = nodeCheck.stdout.trim()
        if (nodeVersion) {
          lg('office.install.node_found', { version: nodeVersion })
        } else {
          lg('office.install.node_missing_installing')
          const nodeScriptPath = join(__dirname, '..', '..', 'scripts', 'install-node-user-latest-v22.sh')
          await uploadFile(sshOpts, nodeScriptPath, '/tmp/install-node-user.sh')
          const { exitCode } = await sshExecRaw(sshOpts, 'bash /tmp/install-node-user.sh', {
            timeout: 120000,
            onStdout: (s) => s.trim().split('\n').forEach(l => l.trim() && lg(`   ${l.trim()}`)),
            onStderr: (s) => s.trim().split('\n').forEach(l => l.trim() && lg(`   ${l.trim()}`)),
          })
          if (exitCode !== 0) {
            const errMsg = `Node.js 安装失败，请在远程主机手动安装 Node.js v22+`
            lg('office.install.node_install_failed', {}, 'error')
            return res.json({ ok: false, error: errMsg, logs })
          }
          lg('office.install.node_installed')
        }

        // ── Install git on remote ─────────────────────────────
        lg('office.install.checking_git')
        const gitCheck = await commandExists(sshOpts, 'git')
        if (gitCheck.exists) {
          lg('office.install.git_installed_path', { path: gitCheck.path })
        } else {
          lg('office.install.installing_git')
          const installGitRemote = async () => {
            const pkgManagers = [
              { name: 'apt', cmd: 'sudo -n apt-get update && sudo -n apt-get install -y git', timeout: 120000 },
              { name: 'yum', cmd: 'sudo -n yum install -y git', timeout: 120000 },
              { name: 'dnf', cmd: 'sudo -n dnf install -y git', timeout: 120000 },
              { name: 'apk', cmd: 'sudo -n apk add git 2>/dev/null || apk add git', timeout: 60000 },
              { name: 'pacman', cmd: 'sudo -n pacman -S --noconfirm git', timeout: 120000 },
            ]
            for (const pm of pkgManagers) {
              try {
                await sshExecRaw(sshOpts, pm.cmd, { timeout: pm.timeout })
                return pm.name
              } catch { /* try next */ }
            }
            return null
          }
          const pm = await installGitRemote()
          if (pm) {
            lg('office.install.git_installed_pm', { pm })
          } else {
            lg('office.install.sudo_password_needed', {}, 'warning')
            lg('   请手动安装: sudo apt-get install git')
          }
        }

        lg('office.install.checking_openclaw')
        const openclawCheck = await commandExists(sshOpts, 'openclaw')
        if (openclawCheck.exists) {
          lg('office.install.openclaw_installed', { path: openclawCheck.path })
        } else {
          lg('office.install.installing_remote', { host: ssh_host })

          try {
            // Upload bundled install script to remote host
            const scriptPath = join(__dirname, '..', '..', 'scripts', 'openclaw-install-20260406-080000.sh')
            if (!existsSync(scriptPath)) {
              throw new Error(`安装脚本不存在: ${scriptPath}`)
            }
            // Clean up stale openclaw directories that cause ENOTEMPTY on reinstall
            await sshExecRaw(sshOpts, 'rm -rf ~/.npm-global/lib/node_modules/openclaw ~/.npm-global/lib/node_modules/.openclaw-*', { timeout: 10000 })

            lg('office.install.uploading_script')
            await uploadFile(sshOpts, scriptPath, '/tmp/openclaw-install.sh')
            await sshExecRaw(sshOpts, 'chmod +x /tmp/openclaw-install.sh')
            lg('office.install.script_uploaded')

            lg('office.install.executing_remote_script')
            // Execute the uploaded script with non-interactive flags
            const installCmd = 'NO_PROMPT=1 VERBOSE=1 OPENCLAW_NO_PROMPT=1 OPENCLAW_NO_ONBOARD=1 NONINTERACTIVE=1 CI=1 bash /tmp/openclaw-install.sh'

            // Helper to filter and classify stderr output
            // Show more progress details during installation
            const filterStderr = (line) => {
              const trimmed = line.trim()
              if (!trimmed) return null
              // Skip empty progress lines
              if (trimmed === '' || trimmed === '\r') return null

              // Curl progress bar - show percentage for download progress
              const progressMatch = trimmed.match(/^(#+)\s*(\d*\.?\d*)%?$/)
              if (progressMatch) {
                const pct = progressMatch[2] || ''
                if (pct && pct !== '100') {
                  return { line: `📥 下载安装脚本... ${pct}%`, type: 'progress' }
                }
                return null // Skip 100% or empty
              }

              // Skip duplicate info - ClawPilot already checked these
              if (/^✓ Git already installed/.test(trimmed)) return null
              if (/^✓ Node\.js/.test(trimmed)) return null
              if (/^· Active Node\.js/.test(trimmed)) return null
              if (/^· Active npm/.test(trimmed)) return null

              // IMPORTANT: Always show error/failure messages
              if (/^!/.test(trimmed)) {
                return { line: trimmed, type: 'warning' }
              }
              if (/failed|error|Error|ERROR/i.test(trimmed)) {
                return { line: trimmed, type: 'error' }
              }

              // Git clone progress
              if (/Cloning into/.test(trimmed)) {
                return { line: `📥 ${trimmed}`, type: 'info' }
              }
              if (/Receiving objects:\s*(\d+)%/.test(trimmed)) {
                const match = trimmed.match(/Receiving objects:\s*(\d+)%/)
                return { line: `   下载代码: ${match[1]}%`, type: 'progress' }
              }
              if (/Resolving deltas:\s*(\d+)%/.test(trimmed)) {
                const match = trimmed.match(/Resolving deltas:\s*(\d+)%/)
                return { line: `   解析提交: ${match[1]}%`, type: 'progress' }
              }

              // npm install progress
              if (/npm WARN/.test(trimmed)) {
                return { line: `   ⚠️ ${trimmed}`, type: 'warning' }
              }
              if (/added \d+ packages/.test(trimmed)) {
                return { line: `   ${trimmed}`, type: 'success' }
              }

              // Installer normal output
              const normalPatterns = [
                /^✓/, /^·/, /^\[\d+\/\d+\]/, /^🦞/, /^Shell yeah/,
                /Install plan/, /OS:/, /Install method:/, /Requested version:/,
                /Onboarding:/, /Preparing environment/, /Installing OpenClaw/,
                /Command:/, /Installer log:/, /Existing OpenClaw/,
              ]
              for (const pattern of normalPatterns) {
                if (pattern.test(trimmed)) {
                  return { line: trimmed, type: 'info' }
                }
              }

              // Show most other lines - don't hide potential issues
              if (trimmed.length > 2) {
                return { line: trimmed, type: 'detail' }
              }
              return null
            }

            const { exitCode, stdout, stderr } = await sshExec(installCmd, {
              timeout: 300000,
              onStdout: (s) => {
                const clean = stripAnsi(s).trim()
                if (clean) clean.split('\n').forEach(line => {
                  if (line.trim()) lg(`   ${line.trim()}`)
                })
              },
              onStderr: (s) => {
                const clean = stripAnsi(s)
                clean.split('\n').forEach(line => {
                  const result = filterStderr(line)
                  if (result === null) return
                  lg(`   ${result.line}`, result.type)
                })
              },
            })
            if (exitCode !== 0) {
              throw new Error(`安装脚本失败 (exit ${exitCode})`)
            }
            lg('office.install.script_done')
          } catch (err) {
            lg('office.install.script_failed', { error: err.message }, 'error')
            return res.json({ ok: false, error: err.message, logs })
          }
        }

        lg('office.install.registering_service')
        lg('office.install.running_onboard')
        try {
          const onboardCmd = 'openclaw onboard --non-interactive --install-daemon --skip-skills --skip-health --accept-risk'

          // Helper to identify error vs normal output
          const filterStderr = (line) => {
            const trimmed = line.trim()
            if (!trimmed) return null
            // Normal output patterns
            const normalPatterns = [
              /^✓/, /^·/, /^\[?\d+\/\d+\]?/, /^Creating/, /^Writing/, /^Generated/,
              /daemon/, /service/, /config/, /onboard/,
            ]
            for (const pattern of normalPatterns) {
              if (pattern.test(trimmed)) {
                return { line: trimmed, isError: false }
              }
            }
            return { line: trimmed, isError: true }
          }

          const { exitCode } = await sshExec(onboardCmd, {
            timeout: 60000,
            onStdout: (s) => {
              const clean = stripAnsi(s).trim()
              if (clean) clean.split('\n').forEach(line => { if (line.trim()) lg(`   ${line.trim()}`) })
            },
            onStderr: (s) => {
              const clean = stripAnsi(s)
              clean.split('\n').forEach(line => {
                const result = filterStderr(line)
                if (result === null) return
                if (result.isError) {
                  lg(`   ⚠️ ${result.line}`)
                } else {
                  lg(`   ${result.line}`)
                }
              })
            },
          })
          if (exitCode !== 0) {
            throw new Error(`onboard 失败 (exit ${exitCode})`)
          }
          lg('office.install.service_done')
        } catch (err) {
          lg('office.install.service_failed', { error: err.message }, 'error')
          return res.json({ ok: false, error: err.message, logs })
        }

        lg('office.install.verifying')
        try {
          const { stdout: ver } = await sshExec('openclaw --version', { timeout: 10000 })
          if (!ver.trim()) throw new Error('openclaw --version 无输出')
          lg('office.install.openclaw_ready', { version: ver.trim() })
        } catch (err) {
          lg('office.install.verify_failed', { error: err.message }, 'error')
          return res.json({ ok: false, error: err.message, logs })
        }

        writeLog('INFO', `openclaw 安装完成 (ssh): ${ssh_host}`)
        return res.json({ ok: true, logs })
      }

      res.json({ ok: false, error: '未知安装模式', logs })
    } catch (err) {
      lg(`❌ ${err.message}`)
      writeLog('ERROR', `install_openclaw 失败: ${err.message}`)
      res.json({ ok: false, error: err.message, logs })
    }
  })

  // probe_local_daemon: silently discover a running local daemon (no install)
  router.post('/probe_local_daemon', async (req, res) => {
    const { office_id } = req.body
    const PORTS = [16668]
    for (const port of PORTS) {
      const url = `http://127.0.0.1:${port}`
      if (await isDaemonRunning(url)) {
        const apiKey = readLocalKey()
        if (office_id && apiKey) {
          const existingOffice = db.prepare('SELECT initial_openclaw_config FROM offices WHERE id=?').get(office_id)
          const initialConfig = existingOffice?.initial_openclaw_config ?? EMPTY_OPENCLAW_CONFIG
          db.prepare('UPDATE offices SET daemon_url=?, daemon_api_key=?, initial_openclaw_config=?, updated_at=? WHERE id=?')
            .run(url, encrypt(apiKey), initialConfig, now(), office_id)
        }
        return res.json({ ok: true, daemon_url: url, api_key: apiKey })
      }
    }
    return res.json({ ok: false })
  })

  // probe_remote_daemon: SSH into remote office and discover running daemon
  router.post('/probe_remote_daemon', async (req, res) => {
    const { office_id } = req.body
    if (!office_id) return res.json({ ok: false })

    const row = db.prepare('SELECT * FROM offices WHERE id = ?').get(office_id)
    if (!row) return res.json({ ok: false })
    const office = rowToOffice(row)

    if (!office.address || office.address === 'localhost') return res.json({ ok: false })

    // Parse IP or IP:port
    const m = office.address.match(/^(\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3})(?::(\d+))?$/)
    if (!m) return res.json({ ok: false })
    const host = m[1]
    const sshPort = m[2] ? Number(m[2]) : 22
    const sshUser = office.access_user || 'root'
    if (!/^[a-zA-Z0-9._-]+$/.test(sshUser)) return res.json({ ok: false })

    // Build SSH options
    const sshOpts = {
      host,
      port: sshPort,
      user: sshUser,
      password: office.access_auth_type !== 'ssh_key' ? office.access_password : undefined,
      keyPath: office.access_auth_type === 'ssh_key' ? office.ssh_key_path : undefined,
      timeout: 5000,
    }

    try {
      // Probe common daemon ports on the remote host
      let foundPort = null
      for (const port of [16668]) {
        try {
          const { stdout } = await sshExecRaw(sshOpts, `curl -sf http://127.0.0.1:${port}/health > /dev/null 2>&1 && echo ok`, { timeout: 8000 })
          if (stdout.trim() === 'ok') { foundPort = port; break }
        } catch { /* port not running */ }
      }
      if (!foundPort) return res.json({ ok: false })

      // Read daemon API key from remote
      let apiKey = null
      try {
        const keyContent = await readFile(sshOpts, '~/.clawpilot/daemon.key')
        apiKey = keyContent.trim() || null
      } catch { /* no key file */ }

      const daemonUrl = `http://${host}:${foundPort}`
      if (apiKey) {
        const existingOffice = db.prepare('SELECT initial_openclaw_config FROM offices WHERE id=?').get(office_id)
        const initialConfig = existingOffice?.initial_openclaw_config ?? EMPTY_OPENCLAW_CONFIG
        db.prepare('UPDATE offices SET daemon_url=?, daemon_api_key=?, initial_openclaw_config=?, updated_at=? WHERE id=?')
          .run(daemonUrl, encrypt(apiKey), initialConfig, now(), office_id)
      }

      log.info(`probe_remote_daemon: found daemon at ${daemonUrl} for office ${office_id}`)
      return res.json({ ok: true, daemon_url: daemonUrl, api_key: apiKey })
    } catch (err) {
      log.warn(`probe_remote_daemon: ${err.message}`)
      return res.json({ ok: false })
    }
  })

  // get_local_daemon_version: read version from local clawpilot-daemon binary
  router.post('/get_local_daemon_version', async (req, res) => {
    const binPath = await findDaemonBinary()
    if (!binPath) return res.json({ ok: false, error: '未找到 clawpilot-daemon 二进制' })
    try {
      const { stdout } = await execAsync(`"${binPath}" --version`, { timeout: 5000 })
      const match = stdout.trim().match(/(\d+\.\d+\.\d+[\w.-]*)/)
      const version = match ? match[1] : stdout.trim()
      return res.json({ ok: true, version })
    } catch (err) {
      return res.json({ ok: false, error: err.message })
    }
  })

  // ── Install SSE Endpoint ─────────────────────────────────────
  // GET /api/install_logs/stream/:office_id - SSE endpoint for install progress
  router.get('/install_logs/stream/:office_id', (req, res) => {
    const officeId = req.params.office_id
    res.setHeader('Content-Type', 'text/event-stream')
    res.setHeader('Cache-Control', 'no-cache')
    res.setHeader('Connection', 'keep-alive')
    res.setHeader('X-Accel-Buffering', 'no')
    res.write(': connected\n\n')

    if (!installSseClients.has(officeId)) {
      installSseClients.set(officeId, new Set())
    }
    installSseClients.get(officeId).add(res)
    log.info(`Install SSE client connected for office ${officeId}`)

    req.on('close', () => {
      const clients = installSseClients.get(officeId)
      if (clients) {
        clients.delete(res)
        if (clients.size === 0) {
          installSseClients.delete(officeId)
        }
      }
      log.info(`Install SSE client disconnected for office ${officeId}`)
    })
  })

  return router
}

// Backward compatibility
export default createOfficeRouter
