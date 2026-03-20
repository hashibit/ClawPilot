import { Router } from 'express'
import { spawn } from 'child_process'
import { exec as execCb } from 'child_process'
import { promisify } from 'util'
import { existsSync, readFileSync } from 'fs'
import { join, resolve } from 'path'
import { homedir } from 'os'
import { fileURLToPath } from 'url'
import db from '../db.js'

const router = Router()
const now = () => Math.floor(Date.now() / 1000)
const execAsync = promisify(execCb)
const __dirname = fileURLToPath(new URL('.', import.meta.url))

// ── Daemon install helpers ─────────────────────────────────
async function findDaemonBinary() {
  // 1. PATH
  try {
    const { stdout } = await execAsync('which clawpilot-daemon')
    const p = stdout.trim()
    if (p && existsSync(p)) return p
  } catch {}
  // 2. project daemon/target/release/
  const candidates = [
    join(__dirname, '..', '..', 'daemon', 'target', 'release', 'clawpilot-daemon'),
    join(__dirname, '..', '..', 'daemon', 'target', 'debug', 'clawpilot-daemon'),
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

// install_daemon — copy binary + start daemon + return api key
router.post('/install_daemon', async (req, res) => {
  const {
    office_id, mode = 'local', daemon_port = 8443,
    ssh_host, ssh_port = 22, ssh_user = 'root', ssh_key_path,
  } = req.body
  const logs = []
  const log = (msg) => logs.push(msg)

  try {
    if (mode === 'local') {
      const listenAddr = `127.0.0.1:${daemon_port}`
      const daemonUrl = `http://127.0.0.1:${daemon_port}`

      // Already running?
      if (await isDaemonRunning(daemonUrl)) {
        log('✅ Daemon 已在运行')
        const apiKey = readLocalKey()
        if (office_id && apiKey) {
          db.prepare('UPDATE offices SET daemon_url=?, daemon_api_key=?, updated_at=? WHERE id=?')
            .run(daemonUrl, apiKey, now(), office_id)
        }
        return res.json({ ok: true, daemon_url: daemonUrl, api_key: apiKey, logs, already_running: true })
      }

      log('🔍 查找 daemon 二进制...')
      const binPath = await findDaemonBinary()
      if (!binPath) {
        return res.json({ ok: false, error: '未找到 clawpilot-daemon，请先 cargo build --release', logs })
      }
      log(`✅ 找到: ${binPath}`)

      log('🚀 启动 daemon...')
      const child = spawn(binPath, ['--listen', listenAddr], { detached: true, stdio: 'ignore' })
      child.unref()

      log('⏳ 等待启动...')
      let started = false
      for (let i = 0; i < 12; i++) {
        await new Promise(r => setTimeout(r, 700))
        if (await isDaemonRunning(daemonUrl)) { started = true; break }
      }
      if (!started) return res.json({ ok: false, error: '启动超时，请检查端口是否被占用', logs })
      log('✅ Daemon 已就绪')

      const apiKey = readLocalKey()
      log('🔑 API Key 已读取')

      if (office_id && apiKey) {
        db.prepare('UPDATE offices SET daemon_url=?, daemon_api_key=?, updated_at=? WHERE id=?')
          .run(daemonUrl, apiKey, now(), office_id)
        log('💾 配置已自动保存')
      }
      return res.json({ ok: true, daemon_url: daemonUrl, api_key: apiKey, logs })

    } else if (mode === 'ssh') {
      if (!ssh_host) return res.json({ ok: false, error: '请填写远程主机地址', logs })
      const keyFlag = ssh_key_path ? `-i "${ssh_key_path}"` : ''
      const sshOpts = `-o StrictHostKeyChecking=no -o ConnectTimeout=10 -p ${ssh_port} ${keyFlag}`.trim()
      const target = `${ssh_user}@${ssh_host}`
      const daemonUrl = `http://${ssh_host}:${daemon_port}`

      log('🔍 查找本地 daemon 二进制...')
      const binPath = await findDaemonBinary()
      if (!binPath) {
        return res.json({ ok: false, error: '未找到本地 clawpilot-daemon 二进制', logs })
      }
      log(`✅ 找到: ${binPath}`)

      log(`📤 上传到 ${target}...`)
      await execAsync(`scp ${sshOpts} "${binPath}" "${target}:/tmp/clawpilot-daemon"`)
      await execAsync(`ssh ${sshOpts} "${target}" "chmod +x /tmp/clawpilot-daemon && sudo mv /tmp/clawpilot-daemon /usr/local/bin/clawpilot-daemon"`)
      log('✅ 二进制已上传')

      log('🛑 停止旧进程...')
      await execAsync(`ssh ${sshOpts} "${target}" "pkill -f clawpilot-daemon || true"`).catch(() => {})

      log('🚀 启动远程 daemon...')
      await execAsync(`ssh ${sshOpts} "${target}" "nohup /usr/local/bin/clawpilot-daemon --listen 0.0.0.0:${daemon_port} > /tmp/clawpilot-daemon.log 2>&1 &"`)

      log('⏳ 等待远程 daemon 就绪...')
      let started = false
      for (let i = 0; i < 12; i++) {
        await new Promise(r => setTimeout(r, 800))
        if (await isDaemonRunning(daemonUrl)) { started = true; break }
      }
      if (!started) return res.json({ ok: false, error: '远程 daemon 启动超时', logs })
      log('✅ 远程 daemon 已就绪')

      const { stdout: keyOut } = await execAsync(`ssh ${sshOpts} "${target}" "cat ~/.clawpilot/daemon.key"`)
      const apiKey = keyOut.trim() || null
      log('🔑 API Key 已读取')

      if (office_id && apiKey) {
        db.prepare('UPDATE offices SET daemon_url=?, daemon_api_key=?, updated_at=? WHERE id=?')
          .run(daemonUrl, apiKey, now(), office_id)
        log('💾 配置已自动保存')
      }
      return res.json({ ok: true, daemon_url: daemonUrl, api_key: apiKey, logs })
    }

    res.json({ ok: false, error: '未知安装模式', logs })
  } catch (err) {
    log(`❌ ${err.message}`)
    res.json({ ok: false, error: err.message, logs })
  }
})

export default router
