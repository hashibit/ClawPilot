import { Router } from 'express'
import { spawn } from 'child_process'
import { exec as execCb } from 'child_process'
import { promisify } from 'util'
import { existsSync, readFileSync, statSync, mkdirSync, writeFileSync } from 'fs'
import { join, resolve } from 'path'
import { homedir } from 'os'
import { randomBytes } from 'crypto'
import { fileURLToPath } from 'url'
import { createLogger } from '../logger.js'
import { encrypt, decrypt } from '../utils/crypto.js'
import { sshExecRaw, checkConnection, detectArch, commandExists, readFile, uploadFile, sshHttpRequest } from '../utils/ssh.js'

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

// ── OpenClaw Offline Package Helpers ───────────────────────────────────────
// These functions are exported for testing

/**
 * Detect current platform and architecture
 * @returns {{ platform: 'darwin'|'linux'|'windows', arch: 'x64'|'arm64' }}
 */
export function detectPlatformArch() {
  const platform = process.platform === 'darwin' ? 'darwin' :
                   process.platform === 'win32' ? 'windows' : 'linux'
  const arch = process.arch === 'arm64' ? 'arm64' : 'x64'
  return { platform, arch }
}

/**
 * Build offline package download URL
 * @param {string} version - OpenClaw version (e.g., '2026.4.9')
 * @param {string} platform - 'darwin', 'linux', or 'windows'
 * @param {string} arch - 'x64' or 'arm64'
 * @returns {string} Download URL
 */
export function buildOfflinePackageUrl(version, platform, arch) {
  const ext = platform === 'windows' ? 'zip' : 'tar.gz'
  return `https://github.com/hashibit/openclaw-pkgs/releases/download/v${version}/openclaw-pkgs-v${version}-${platform}-${arch}.${ext}`
}

/**
 * Parse SHA256 file content (handles both standard and plain hash formats)
 * @param {string} content - SHA256 file content
 * @returns {string} Expected hash
 */
export function parseSha256Content(content) {
  return content.trim().split(/\s+/)[0]
}

/**
 * Map Node.js arch string to package arch suffix
 * @param {string} arch - Node.js process.arch value
 * @returns {'x64'|'arm64'}
 */
export function normalizeArch(arch) {
  // arm64 and aarch64 are equivalent
  if (arch === 'arm64' || arch === 'aarch64') return 'arm64'
  return 'x64'
}

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
        encrypt(office.access_password ?? null), office.ssh_key_path?.trim() ?? null,
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

  // update_office — 部分更新，只更新传入的字段
  router.post('/update_office', (req, res) => {
    try {
      const { id, office } = req.body
      if (!id) return res.status(400).json({ error: 'id required' })
      if (!office) return res.status(400).json({ error: 'office object required' })

      // 先读取现有记录，避免 NOT NULL 约束冲突
      const existing = db.prepare('SELECT * FROM offices WHERE id = ?').get(id)
      if (!existing) return res.status(404).json({ error: 'Office not found' })

      // 合并传入的字段，只更新有值的字段
      const finalName = office.name ?? existing.name
      const finalAddress = office.address ?? existing.address
      const finalAccessAuthType = office.access_auth_type ?? existing.access_auth_type ?? 'password'
      const finalAccessUser = office.access_user ?? existing.access_user
      const finalAccessPassword = office.access_password !== undefined ? encrypt(office.access_password ?? null) : existing.access_password
      const finalSshKeyPath = office.ssh_key_path?.trim() ?? existing.ssh_key_path
      const finalPhone = office.phone ?? existing.phone
      const finalReceptionistImage = office.receptionist_image ?? existing.receptionist_image
      const finalOwnership = office.ownership ?? existing.ownership ?? 'RENTED'
      const finalMonthlyRent = office.monthly_rent ?? existing.monthly_rent
      const finalInternetSpeed = office.internet_speed ?? existing.internet_speed
      const finalDecorationGrade = office.decoration_grade ?? existing.decoration_grade ?? 'MEDIUM'
      const finalDescription = office.description ?? existing.description
      const finalDaemonUrl = office.daemon_url ?? existing.daemon_url
      const finalDaemonApiKey = office.daemon_api_key !== undefined ? encrypt(office.daemon_api_key ?? null) : existing.daemon_api_key
      const finalOpcRoot = office.opc_root ?? existing.opc_root

      db.prepare(`
        UPDATE offices SET
          name = ?, address = ?,
          access_auth_type = ?, access_user = ?, access_password = ?, ssh_key_path = ?,
          phone = ?, receptionist_image = ?,
          ownership = ?, monthly_rent = ?, internet_speed = ?, decoration_grade = ?,
          description = ?, daemon_url = ?, daemon_api_key = ?, opc_root = ?, updated_at = ?
        WHERE id = ?
      `).run(
        finalName, finalAddress,
        finalAccessAuthType, finalAccessUser, finalAccessPassword, finalSshKeyPath,
        finalPhone, finalReceptionistImage,
        finalOwnership, finalMonthlyRent, finalInternetSpeed, finalDecorationGrade,
        finalDescription,
        finalDaemonUrl, finalDaemonApiKey, finalOpcRoot,
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
    const { daemon_url, daemon_api_key, office_id } = req.body
    if (!daemon_url) return res.json({ ok: false, error: '未配置 Daemon URL' })

    try {
      // 远程 daemon 只监听 127.0.0.1，通过 SSH 隧道访问
      if (office_id) {
        const office = db.prepare('SELECT * FROM offices WHERE id = ?').get(office_id)
        if (office) {
          const address = office.address || ''
          const isRemote = address && address !== 'localhost'
          if (isRemote) {
            const idx = address.lastIndexOf(':')
            const host = idx >= 0 ? address.slice(0, idx) : address
            const sshPort = idx >= 0 ? parseInt(address.slice(idx + 1)) || 22 : 22
            const sshOpts = {
              host,
              port: sshPort,
              user: office.access_user || 'root',
              keyPath: office.ssh_key_path || undefined,
              password: office.access_password ? decrypt(office.access_password) : undefined,
            }
            const { status, data } = await sshHttpRequest(sshOpts, 'GET', '/health', decrypt(office.daemon_api_key) || daemon_api_key)
            if (status >= 200 && status < 300) return res.json({ ok: true, ...data })
            return res.json({ ok: false, error: `HTTP ${status}` })
          }
        }
      }

      // 本地直连
      const url = `${daemon_url.replace(/\/$/, '')}/health`
      const r = await fetch(url, {
        headers: { 'Authorization': `Bearer ${daemon_api_key ?? ''}` },
        signal: AbortSignal.timeout(5000),
      })
      if (!r.ok) return res.json({ ok: false, error: `HTTP ${r.status}` })
      const data = await r.json()
      log.debug('daemon health response:', JSON.stringify(data))
      res.json({ ok: true, ...data })
    } catch (err) {
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
      const sudoCheck = await sshExecRaw(sshOpts, 'sudo -n true 2>/dev/null && echo yes || echo no', { timeout: 5000 })
      const sudo_ok = sudoCheck.stdout.trim() === 'yes'

      // Detect platform and architecture
      const archOut = await sshExecRaw(sshOpts, 'uname -m', { timeout: 5000 })
      const rawArch = archOut.stdout.trim()
      const arch = rawArch === 'aarch64' || rawArch === 'arm64' ? 'arm64' : 'x64'

      const osOut = await sshExecRaw(sshOpts, 'uname -s', { timeout: 5000 })
      const osName = osOut.stdout.trim()
      const platform = osName === 'Darwin' ? 'darwin' : 'linux'

      res.json({ ok: true, latency_ms: Date.now() - start, sudo_ok, platform, arch })
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

// ── Daemon Install Helper ─────────────────────────────────────────
// Shared logic for installing daemon, used by both install_daemon and install_decoration
async function runDaemonInstall(db, { office_id, mode, daemon_port, ssh_host, ssh_port, ssh_user, ssh_key_path, ssh_password, daemon_host }, step, writeLog) {
  const logs = []
  const nowUnix = () => Math.floor(Date.now() / 1000)

  if (mode === 'local') {
    const listenAddr = `127.0.0.1:${daemon_port}`
    const daemonUrl = `http://127.0.0.1:${daemon_port}`

    if (await isDaemonRunning(daemonUrl)) {
      step('✅ Daemon 已在运行')
      let apiKey = readLocalKey()
      if (!apiKey) {
        step('🔑 生成新的 API Key...')
        apiKey = randomBytes(32).toString('hex')
        const keyDir = join(homedir(), '.clawpilot')
        mkdirSync(keyDir, { recursive: true })
        writeFileSync(join(keyDir, 'daemon.key'), apiKey, 'utf8')
      }
      if (office_id && apiKey) {
        const existingOffice = db.prepare('SELECT initial_openclaw_config FROM offices WHERE id=?').get(office_id)
        const initialConfig = existingOffice?.initial_openclaw_config ?? EMPTY_OPENCLAW_CONFIG
        db.prepare('UPDATE offices SET daemon_url=?, daemon_api_key=?, initial_openclaw_config=?, updated_at=? WHERE id=?')
          .run(daemonUrl, encrypt(apiKey), initialConfig, nowUnix(), office_id)
      }
      return { daemonUrl, apiKey, logs, already_running: true }
    }

    step('🔍 查找 daemon 二进制...')
    const binPath = await findDaemonBinary()
    if (!binPath) {
      throw new Error('未找到 clawpilot-daemon，请先 cargo build --release')
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
    if (!started) throw new Error('daemon 启动超时')
    step('✅ Daemon 已就绪')

    let apiKey = readLocalKey()
    if (!apiKey) {
      step('🔑 生成新的 API Key...')
      apiKey = randomBytes(32).toString('hex')
      const keyDir = join(homedir(), '.clawpilot')
      mkdirSync(keyDir, { recursive: true })
      writeFileSync(join(keyDir, 'daemon.key'), apiKey, 'utf8')
    }
    step('🔑 API Key 已就绪')

    if (office_id && apiKey) {
      db.prepare('UPDATE offices SET daemon_url=?, daemon_api_key=?, updated_at=? WHERE id=?')
        .run(daemonUrl, encrypt(apiKey), nowUnix(), office_id)
      step('💾 配置已自动保存')
    }
    writeLog('INFO', `daemon 安装完成 (local): ${daemonUrl}`)
    return { daemonUrl, apiKey, logs }

  } else if (mode === 'ssh') {
    if (!ssh_host) throw new Error('请填写远程主机地址')

    const sshOpts = {
      host: ssh_host,
      port: ssh_port,
      user: ssh_user || 'root',
      password: ssh_password || undefined,
      keyPath: ssh_key_path || undefined,
    }

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
      throw new Error(`未找到 ${remoteOs}/${remoteArch} 版 clawpilot-daemon 二进制，请先编译对应目标`)
    }
    step(`✅ 找到: ${binPath}`)

    step('office.install.uploading_daemon')
    await uploadFile(sshOpts, binPath, '/tmp/clawpilot-daemon')
    await sshExecRaw(sshOpts, 'mkdir -p ~/.clawpilot/bin && mv /tmp/clawpilot-daemon ~/.clawpilot/bin/clawpilot-daemon && chmod +x ~/.clawpilot/bin/clawpilot-daemon')
    step('office.install.daemon_uploaded')

    // 在 daemon 启动前写入 API key，daemon 启动时会读取它
    step('🔑 生成 API Key...')
    const apiKey = randomBytes(32).toString('hex')
    await sshExecRaw(sshOpts, `mkdir -p ~/.clawpilot && printf '%s' '${apiKey}' > ~/.clawpilot/daemon.key && chmod 600 ~/.clawpilot/daemon.key`, { timeout: 5000 })
    step('🔑 API Key 已就绪')

    step('🔧 安装 systemd 用户服务...')
    // %h 由 systemd 在远程机器上展开为用户 home，daemon 只监听 127.0.0.1
    const serviceUnit = [
      '[Unit]',
      'Description=ClawPilot Daemon',
      'After=network.target',
      '',
      '[Service]',
      'Type=simple',
      `ExecStart=%h/.clawpilot/bin/clawpilot-daemon --listen 127.0.0.1:${daemon_port}`,
      'Restart=on-failure',
      'RestartSec=5',
      'WorkingDirectory=%h/.clawpilot',
      'Environment=PATH=/usr/bin:/bin:/usr/sbin:/sbin',
      '',
      `StandardOutput=append:%h/.clawpilot/logs/daemon.log`,
      `StandardError=append:%h/.clawpilot/logs/daemon.log`,
      '',
      '[Install]',
      'WantedBy=default.target',
    ].join('\n')
    const encodedUnit = Buffer.from(serviceUnit).toString('base64')
    const uid = (await sshExecRaw(sshOpts, 'id -u')).stdout.trim()
    await sshExecRaw(sshOpts, `mkdir -p ~/.clawpilot/logs ~/.config/systemd/user && echo '${encodedUnit}' | base64 -d > ~/.config/systemd/user/clawpilot-daemon.service && XDG_RUNTIME_DIR=/run/user/${uid} systemctl --user daemon-reload && XDG_RUNTIME_DIR=/run/user/${uid} systemctl --user enable --now clawpilot-daemon.service`)
    step('✅ systemd 用户服务已启用')

    // daemon 只监听 127.0.0.1，通过 SSH 隧道等待就绪
    step('⏳ 等待远程 daemon 就绪...')
    const daemonUrl = `http://127.0.0.1:${daemon_port}`
    let started = false
    for (let i = 0; i < 15; i++) {
      await new Promise(r => setTimeout(r, 1000))
      try {
        const { status } = await sshHttpRequest(sshOpts, 'GET', '/health', apiKey)
        if (status >= 200 && status < 300) { started = true; break }
      } catch { /* 继续等待 */ }
    }
    if (!started) throw new Error('远程 daemon 启动超时')
    step('✅ 远程 daemon 已就绪')

    if (office_id && apiKey) {
      db.prepare('UPDATE offices SET daemon_url=?, daemon_api_key=?, updated_at=? WHERE id=?')
        .run(daemonUrl, encrypt(apiKey), nowUnix(), office_id)
      step('💾 配置已自动保存')
    }
    writeLog('INFO', `daemon 安装完成 (ssh): ${daemonUrl}`)
    return { daemonUrl, apiKey, logs }
  }

  throw new Error('未知安装模式，请使用 local 或 ssh')
}

  // install_daemon
  router.post('/install_daemon', async (req, res) => {
    const {
      office_id, mode = 'local', daemon_port = 16668,
      ssh_host, ssh_port = 22, ssh_user = 'root', ssh_key_path, ssh_config_file,
      ssh_password,
      daemon_host,
    } = req.body
    const logs = []
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
      const result = await runDaemonInstall(db, {
        office_id, mode, daemon_port, ssh_host, ssh_port, ssh_user, ssh_key_path, ssh_password, daemon_host,
      }, step, writeLog)
      return res.json({ ok: true, daemon_url: result.daemonUrl, api_key: result.apiKey, logs, already_running: result.already_running })
    } catch (err) {
      step(`❌ ${err.message}`)
      writeLog('ERROR', `install_daemon 失败: ${err.message}`)
      res.json({ ok: false, error: err.message, logs })
    }
  })

  // install_decoration — auto-install daemon first if needed, then install openclaw via daemon API
  router.post('/install_decoration', async (req, res) => {
    const {
      office_id,
      mode = 'local', daemon_port = 16668,
      ssh_host, ssh_port = 22, ssh_user = 'root', ssh_key_path, ssh_password,
      daemon_host,
    } = req.body
    const logs = []
    // Log to array AND broadcast to SSE clients in real-time
    const lg = (msgOrKey, paramsOrLevel = {}, levelOrUndefined = 'info') => {
      const isKeyFormat = typeof msgOrKey === 'string' && msgOrKey.startsWith('office.install.')
      let displayMsg, level, payload

      if (isKeyFormat) {
        const key = msgOrKey
        const params = typeof paramsOrLevel === 'object' ? paramsOrLevel : {}
        level = typeof levelOrUndefined === 'string' ? levelOrUndefined : 'info'
        displayMsg = `[i18n:${key}]`
        payload = { key, params, type: level }
      } else {
        displayMsg = msgOrKey
        level = typeof paramsOrLevel === 'string' ? paramsOrLevel : 'info'
        payload = { message: displayMsg, type: level }
      }

      logs.push(displayMsg)
      log.info(`[install_decoration] ${displayMsg}`)
      if (office_id) {
        broadcastInstallLog(office_id, payload)
      }
    }

    // Helper to get latest version from GitHub releases
    const getLatestVersion = async () => {
      const res = await fetch('https://api.github.com/repos/hashibit/openclaw-pkgs/releases/latest')
      if (!res.ok) throw new Error(`GitHub API 返回 ${res.status}`)
      const data = await res.json()
      if (!data.tag_name) throw new Error('GitHub API 响应中缺少 tag_name 字段')
      return data.tag_name.replace(/^v/, '')
    }

    // SSH opts（供平台探测和隧道访问复用）
    const isRemote = mode === 'ssh'
    const sshOpts = isRemote ? {
      host: ssh_host,
      port: ssh_port,
      user: ssh_user || 'root',
      password: ssh_password || undefined,
      keyPath: ssh_key_path || undefined,
    } : null

    try {
      // Get office info
      const officeRow = db.prepare('SELECT * FROM offices WHERE id = ?').get(office_id)
      if (!officeRow) {
        return res.json({ ok: false, error: '办公室不存在', logs })
      }

      // 通过 SSH（或本地）探测目标平台/架构，不依赖 daemon health
      lg('🔍 探测目标平台信息...')
      let targetPlatform, targetArch
      if (isRemote) {
        const { arch, os } = await detectArch(sshOpts)
        targetPlatform = os.toLowerCase().includes('darwin') ? 'darwin' : 'linux'
        targetArch = (arch === 'aarch64' || arch === 'arm64') ? 'arm64' : 'x64'
      } else {
        targetPlatform = process.platform === 'darwin' ? 'darwin' : 'linux'
        targetArch = process.arch === 'arm64' ? 'arm64' : 'x64'
      }
      lg(`   平台: ${targetPlatform}, 架构: ${targetArch}`)

      // If daemon not installed, install it first
      let daemonUrl = officeRow.daemon_url
      let apiKey = officeRow.daemon_api_key ? decrypt(officeRow.daemon_api_key) : null

      if (!daemonUrl) {
        lg('📦 Daemon 未配置，先安装 daemon...')
        const daemonResult = await runDaemonInstall(db, {
          office_id, mode, daemon_port, ssh_host, ssh_port, ssh_user, ssh_key_path, ssh_password, daemon_host,
        }, lg, writeLog)
        daemonUrl = daemonResult.daemonUrl
        apiKey = daemonResult.apiKey
        lg('✅ Daemon 安装完成，继续安装 OpenClaw...')
      }

      lg(`📡 连接 daemon: ${daemonUrl}`)

      // Get version from GitHub
      const version = await getLatestVersion()
      lg(`   最新版本: ${version}`)

      // 提交安装任务（远程走 SSH 隧道，本地直连）
      const downloadUrl = buildOfflinePackageUrl(version, targetPlatform, targetArch)
      const sha256Url = `${downloadUrl}.sha256`
      const installBody = { version, platform: targetPlatform, arch: targetArch, download_url: downloadUrl, sha256_url: sha256Url }

      lg('📤 提交安装任务到 daemon...')
      let taskId
      if (isRemote) {
        const { status, data } = await sshHttpRequest(sshOpts, 'POST', '/install_openclaw', apiKey, installBody)
        if (status < 200 || status >= 300) return res.json({ ok: false, error: `daemon 返回错误: ${JSON.stringify(data)}`, logs })
        taskId = data?.task_id
      } else {
        const installResp = await fetch(`${daemonUrl.replace(/\/$/, '')}/install_openclaw`, {
          method: 'POST',
          headers: { 'Authorization': `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
          body: JSON.stringify(installBody),
          signal: AbortSignal.timeout(30000),
        })
        if (!installResp.ok) {
          const body = await installResp.text()
          return res.json({ ok: false, error: `daemon 返回错误: ${body}`, logs })
        }
        taskId = (await installResp.json()).task_id
      }
      if (!taskId) return res.json({ ok: false, error: 'daemon 未返回 task_id', logs })
      lg(`📋 安装任务已提交: ${taskId}`)

      // Poll for completion
      let logOffset = 0
      for (let i = 0; i < 600; i++) {
        await new Promise(r => setTimeout(r, 2000))

        try {
          let state
          if (isRemote) {
            const { status, data } = await sshHttpRequest(sshOpts, 'GET', `/install_openclaw/${taskId}`, apiKey)
            if (status < 200 || status >= 300) continue
            state = data?.state || {}
          } else {
            const statusResp = await fetch(`${daemonUrl.replace(/\/$/, '')}/install_openclaw/${taskId}`, {
              headers: { 'Authorization': `Bearer ${apiKey}` },
              signal: AbortSignal.timeout(5000),
            })
            if (!statusResp.ok) continue
            state = (await statusResp.json()).state || {}
          }

          const status = state.status || 'unknown'
          const progress = state.progress || 0
          const currentStep = state.current_step || ''

          if (Array.isArray(state.logs)) {
            for (const logLine of state.logs.slice(logOffset)) lg(logLine)
            logOffset = state.logs.length
          }
          lg(`   [${progress}%] ${currentStep}`)

          if (status === 'success') {
            writeLog('INFO', `openclaw 安装完成: ${version}`)
            return res.json({ ok: true, logs, version, daemon_url: daemonUrl, api_key: apiKey })
          } else if (status === 'failed') {
            return res.json({ ok: false, error: state.error || '未知错误', logs })
          }
        } catch (err) {
          lg(`⚠️  查询状态失败: ${err.message}`)
        }
      }

      return res.json({ ok: false, error: '安装超时', logs })
    } catch (err) {
      lg(`❌ ${err.message}`)
      writeLog('ERROR', `install_decoration 失败: ${err.message}`)
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
          .run(daemonUrl, encrypt(apiKey), initialConfig, nowUnix(), office_id)
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
