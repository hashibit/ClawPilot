import { Router } from 'express'
import db from '../db.js'
import { randomUUID, createHash } from 'crypto'
import zlib from 'zlib'
import { pack } from 'tar-stream'
import FormData from 'form-data'
import path from 'path'
import fs from 'fs'
import { fileURLToPath } from 'url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const WORKSPACE_ROOT = path.resolve(__dirname, '../..')

const router = Router()
const now = () => Math.floor(Date.now() / 1000)

function writeLog(level, component, message) {
  try {
    db.prepare('INSERT INTO log_entries (timestamp, level, component, message) VALUES (?, ?, ?, ?)')
      .run(now(), level, component, message)
  } catch (_) {}
}

function collectOpcData(opcId) {
  const opc = db.prepare('SELECT * FROM opc_config WHERE id = ?').get(opcId)
  if (!opc) throw new Error(`OPC not found: ${opcId}`)

  const agents = db.prepare('SELECT * FROM agents WHERE opc_id = ? ORDER BY order_index').all(opcId)
  const agentIds = agents.map(a => a.id)

  let agentDocuments = []
  if (agentIds.length > 0) {
    const ph = agentIds.map(() => '?').join(',')
    agentDocuments = db.prepare(`SELECT * FROM agent_documents WHERE agent_id IN (${ph})`).all(...agentIds)
  }

  const channels = db.prepare('SELECT * FROM channels WHERE opc_id = ?').all(opcId)
  const bindings = db.prepare('SELECT * FROM bindings WHERE opc_id = ?').all(opcId)
  const modelProviders = db.prepare('SELECT provider_type, api_key, base_url, is_enabled FROM model_providers').all()
  
  // Tools metadata (from DB)
  const tools = db.prepare('SELECT * FROM tools ORDER BY id').all()
  
  // Skills: scan skills/ directory and collect actual files
  const skillsDir = path.join(WORKSPACE_ROOT, 'skills')
  const skills = []
  
  if (fs.existsSync(skillsDir)) {
    const skillSlugs = fs.readdirSync(skillsDir).filter(f => {
      const stat = fs.statSync(path.join(skillsDir, f))
      return stat.isDirectory()
    })
    
    for (const slug of skillSlugs) {
      const skillPath = path.join(skillsDir, slug)
      const files = fs.readdirSync(skillPath).filter(f => {
        const stat = fs.statSync(path.join(skillPath, f))
        return stat.isFile()
      })
      
      // Read SKILL.md for metadata
      let name = slug
      let description = ''
      let version = '1.0.0'
      let author = 'unknown'
      
      const skillMdPath = path.join(skillPath, 'SKILL.md')
      if (fs.existsSync(skillMdPath)) {
        const skillMd = fs.readFileSync(skillMdPath, 'utf8')
        // Extract metadata from SKILL.md frontmatter or first lines
        const nameMatch = skillMd.match(/<name>(.*?)<\/name>/)
        if (nameMatch) name = nameMatch[1]
        
        const descMatch = skillMd.match(/<description>(.*?)<\/description>/)
        if (descMatch) description = descMatch[1]
      }
      
      skills.push({
        id: slug,
        slug,
        name,
        description,
        version,
        author,
        files,
        path: skillPath  // For packaging
      })
    }
  }

  return { 
    opc, 
    agents, 
    agent_documents: agentDocuments, 
    channels, 
    bindings, 
    model_providers: modelProviders,
    tools,
    skills
  }
}

/** Build a tar.gz Buffer containing the deployment package */
function buildPackage(data, manifest) {
  return new Promise((resolve, reject) => {
    const tarPack = pack()
    const chunks = []

    const gz = zlib.createGzip()
    gz.on('data', chunk => chunks.push(chunk))
    gz.on('end', () => resolve(Buffer.concat(chunks)))
    gz.on('error', reject)
    tarPack.pipe(gz)

    const addFile = (tarPath, content) => {
      const buf = Buffer.from(typeof content === 'string' ? content : JSON.stringify(content, null, 2), 'utf8')
      tarPack.entry({ name: tarPath, size: buf.length }, buf, (err) => {
        if (err) reject(err)
      })
    }

    // manifest.json
    addFile('manifest.json', JSON.stringify(manifest, null, 2))

    // config/
    addFile('config/opc.json', data.opc)
    addFile('config/agents.json', data.agents)
    addFile('config/channels.json', data.channels)
    addFile('config/bindings.json', data.bindings)
    addFile('config/models.json', data.model_providers)
    addFile('config/tools.json', data.tools)
    
    // Skills metadata (without path)
    const skillsMeta = data.skills.map(s => ({
      id: s.id,
      slug: s.slug,
      name: s.name,
      description: s.description,
      version: s.version,
      author: s.author,
      files: s.files
    }))
    addFile('config/skills.json', skillsMeta)

    // agents/{id}/*.md
    for (const doc of data.agent_documents) {
      const filename = `${doc.document_type}.md`
      addFile(`agents/${doc.agent_id}/${filename}`, doc.content)
    }

    // skills/{slug}/* (actual skill files)
    for (const skill of data.skills) {
      for (const file of skill.files) {
        const filePath = path.join(skill.path, file)
        const content = fs.readFileSync(filePath)
        addFile(`skills/${skill.slug}/${file}`, content)
      }
    }

    tarPack.finalize()
  })
}

// ── POST /api/start_deployment ────────────────────────────────
router.post('/start_deployment', async (req, res) => {
  try {
    const { opc_id, office_id } = req.body
    if (!opc_id || !office_id) return res.status(400).send('opc_id and office_id are required')

    const opc = db.prepare('SELECT * FROM opc_config WHERE id = ?').get(opc_id)
    if (!opc) return res.status(400).send('OPC not found')

    const office = db.prepare('SELECT * FROM offices WHERE id = ?').get(office_id)
    if (!office) return res.status(400).send('Office not found')

    const taskId = randomUUID()
    const createdAt = now()

    db.prepare(`
      INSERT INTO deployment_tasks (id, opc_id, office_id, opc_name, status, steps, current_step, created_at)
      VALUES (?, ?, ?, ?, 'PENDING', ?, 0, ?)
    `).run(taskId, opc_id, office_id, opc.name, JSON.stringify(['准备配置文件', '发送部署包', '等待完成', '健康检查']), createdAt)

    writeLog('INFO', 'deployment', `Deploy started: ${opc.name} → ${office.name} (task: ${taskId})`)

    // Check if office has daemon configured
    if (office.daemon_url && office.daemon_api_key) {
      // Real daemon deployment (async)
      setImmediate(() => runDaemonDeploy(taskId, opc_id, opc, office).catch(console.error))
    } else {
      // Stub simulation (no daemon configured)
      runStubDeploy(taskId, opc_id, opc, office)
    }

    res.json(taskId)
  } catch (err) {
    res.status(500).send(err.message)
  }
})

// Stub simulation (dev without daemon)
function runStubDeploy(taskId, opc_id, opc, office) {
  const updateStep = (step, status, extra = {}) => {
    try {
      db.prepare(`UPDATE deployment_tasks SET status = ?, current_step = ?, ${
        Object.keys(extra).map(k => `${k} = ?`).join(', ')
      }${Object.keys(extra).length ? ', ' : ''}updated_at = ? WHERE id = ?`)
        .run(status, step, ...Object.values(extra), now(), taskId)
    } catch (_) {}
  }

  setTimeout(() => updateStep(1, 'RUNNING', { started_at: now() }), 300)
  setTimeout(() => updateStep(2, 'RUNNING'), 800)
  setTimeout(() => updateStep(3, 'RUNNING'), 1200)
  setTimeout(() => {
    try {
      updateStep(4, 'SUCCESS', { completed_at: now(), message: '(仿真模式：未配置 Daemon)' })
      db.prepare(`UPDATE office_deployments SET is_active = 0, undeployed_at = ? WHERE opc_id = ? AND is_active = 1`)
        .run(now(), opc_id)
      db.prepare(`INSERT INTO office_deployments (id, opc_id, opc_name, office_id, office_name, deployed_at, is_active)
                  VALUES (?, ?, ?, ?, ?, ?, 1)`)
        .run(randomUUID(), opc_id, opc.name, office.id, office.name, now())
      db.prepare(`UPDATE opc_config SET is_running = 1, office_id = ? WHERE id = ?`).run(office.id, opc_id)
    } catch (e) { writeLog('ERROR', 'deployment', e.message) }
  }, 2000)
}

// Real daemon deployment
async function runDaemonDeploy(taskId, opc_id, opc, office) {
  const mark = (status, step, extra = {}) => {
    try {
      const sets = ['status = ?', 'current_step = ?', 'updated_at = ?']
      const vals = [status, step, now()]
      for (const [k, v] of Object.entries(extra)) { sets.push(`${k} = ?`); vals.push(v) }
      vals.push(taskId)
      db.prepare(`UPDATE deployment_tasks SET ${sets.join(', ')} WHERE id = ?`).run(...vals)
    } catch (_) {}
  }

  try {
    mark('RUNNING', 1, { started_at: now() })

    // Build package
    const data = collectOpcData(opc_id)
    const version = new Date().toISOString()
    const manifest = { opc_id, version, checksum: '' }

    const pkgBuf = await buildPackage(data, manifest)

    // Compute checksum and update manifest
    const checksum = 'sha256:' + createHash('sha256').update(pkgBuf).digest('hex')
    manifest.checksum = checksum

    mark('RUNNING', 2)

    // Upload to daemon
    const form = new FormData()
    form.append('manifest', JSON.stringify(manifest), { contentType: 'application/json' })
    form.append('package', pkgBuf, { filename: 'package.tar.gz', contentType: 'application/gzip' })

    const daemonUrl = office.daemon_url.replace(/\/$/, '')
    const response = await fetch(`${daemonUrl}/deploy`, {
      method: 'POST',
      headers: {
        ...form.getHeaders(),
        'Authorization': `Bearer ${office.daemon_api_key}`,
      },
      body: form.getBuffer(),
      signal: AbortSignal.timeout(30000),
    })

    if (!response.ok) {
      const text = await response.text()
      throw new Error(`Daemon 返回错误 ${response.status}: ${text}`)
    }

    const { task_id: daemonTaskId } = await response.json()

    // Store daemon task id
    try { db.prepare('UPDATE deployment_tasks SET daemon_task_id = ? WHERE id = ?').run(daemonTaskId, taskId) } catch (_) {}

    mark('RUNNING', 3)
    writeLog('INFO', 'deployment', `Daemon task accepted: ${daemonTaskId}`)

    // Poll daemon status
    const deadline = Date.now() + 120_000
    while (Date.now() < deadline) {
      await sleep(2000)

      const statusResp = await fetch(`${daemonUrl}/deploy/${daemonTaskId}`, {
        headers: { 'Authorization': `Bearer ${office.daemon_api_key}` },
        signal: AbortSignal.timeout(10000),
      })

      if (!statusResp.ok) continue

      const statusData = await statusResp.json()

      // Save daemon logs to deployment_tasks.message
      const logSnippet = (statusData.logs || []).slice(-5).join('\n')
      try {
        db.prepare('UPDATE deployment_tasks SET message = ?, current_step = ? WHERE id = ?')
          .run(logSnippet, Math.min(3, Math.floor((statusData.progress || 0) / 34)), taskId)
      } catch (_) {}

      if (statusData.status === 'success') {
        mark('SUCCESS', 4, {
          completed_at: now(),
          message: (statusData.logs || []).join('\n'),
        })

        // Record active deployment
        db.prepare(`UPDATE office_deployments SET is_active = 0, undeployed_at = ? WHERE opc_id = ? AND is_active = 1`)
          .run(now(), opc_id)
        db.prepare(`INSERT INTO office_deployments (id, opc_id, opc_name, office_id, office_name, deployed_at, is_active)
                    VALUES (?, ?, ?, ?, ?, ?, 1)`)
          .run(randomUUID(), opc_id, opc.name, office.id, office.name, now())
        db.prepare(`UPDATE opc_config SET is_running = 1, office_id = ? WHERE id = ?`).run(office.id, opc_id)
        writeLog('INFO', 'deployment', `Deploy SUCCESS: ${opc.name} → ${office.name}`)
        return
      }

      if (statusData.status === 'failed') {
        throw new Error(statusData.error || '部署失败')
      }
    }

    throw new Error('部署超时（120s）')
  } catch (err) {
    writeLog('ERROR', 'deployment', err.message)
    try {
      db.prepare(`UPDATE deployment_tasks SET status = 'FAILED', message = ?, completed_at = ? WHERE id = ?`)
        .run(err.message, now(), taskId)
    } catch (_) {}
  }
}

const sleep = ms => new Promise(resolve => setTimeout(resolve, ms))

// ── GET /api/get_deployment_status ───────────────────────────
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

// ── POST /api/cancel_deployment ──────────────────────────────
router.post('/cancel_deployment', (req, res) => {
  try {
    const { task_id } = req.body
    db.prepare(`UPDATE deployment_tasks SET status = 'FAILED', message = 'Cancelled', completed_at = ? WHERE id = ?`)
      .run(now(), task_id)
    res.json(null)
  } catch (err) {
    res.status(500).send(err.message)
  }
})

// ── POST /api/undeploy ───────────────────────────────────────
router.post('/undeploy', (req, res) => {
  try {
    const { opc_id } = req.body
    const ts = now()
    db.prepare(`UPDATE office_deployments SET is_active = 0, undeployed_at = ? WHERE opc_id = ? AND is_active = 1`)
      .run(ts, opc_id)
    db.prepare(`UPDATE opc_config SET is_running = 0, office_id = NULL WHERE id = ?`).run(opc_id)
    writeLog('INFO', 'deployment', `Undeployed opc_id=${opc_id}`)
    res.json(null)
  } catch (err) {
    res.status(500).send(err.message)
  }
})

// ── POST /api/get_recent_deployments ─────────────────────────
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

// ── POST /api/get_office_deployments ─────────────────────────
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
