import { Router } from 'express'
import { randomUUID, createHash } from 'crypto'
import zlib from 'zlib'
import { pack } from 'tar-stream'
import FormData from 'form-data'
import path from 'path'
import fs from 'fs'
import { fileURLToPath } from 'url'
import { createLogger } from '../logger.js'
import { decrypt } from '../utils/crypto.js'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const WORKSPACE_ROOT = path.resolve(__dirname, '../..')

const now = () => Math.floor(Date.now() / 1000)

// Configuration constants
const DAEMON_UPLOAD_TIMEOUT_MS = parseInt(process.env.DAEMON_UPLOAD_TIMEOUT_MS, 10) || 30000 // 30s default
const DAEMON_DEPLOY_TIMEOUT_MS = parseInt(process.env.DAEMON_DEPLOY_TIMEOUT_MS, 10) || 120000 // 120s default
const DAEMON_POLL_INTERVAL_MS = 2000

// LRU cache for deployment packages with TTL and max size
const MAX_CACHE_SIZE = 50 // max entries
const CACHE_TTL_MS = 5 * 60 * 1000 // 5 minutes

export function createDeploymentRouter(db) {
  const log = createLogger('deployment')
  const router = Router()

  // In-memory cache: opc_id → { buf: Buffer, checksum: string, version: string, lastAccess: number }
  const packageCache = new Map()

  function cleanupCache() {
    const cutoff = Date.now() - CACHE_TTL_MS
    let deleted = 0
    for (const [key, value] of packageCache.entries()) {
      if (value.lastAccess < cutoff) {
        packageCache.delete(key)
        deleted++
      }
    }
    // If still over limit, remove oldest entries
    if (packageCache.size > MAX_CACHE_SIZE) {
      const entries = Array.from(packageCache.entries())
        .sort((a, b) => a[1].lastAccess - b[1].lastAccess)
      for (let i = 0; i < entries.length - MAX_CACHE_SIZE; i++) {
        packageCache.delete(entries[i][0])
        deleted++
      }
    }
    if (deleted > 0) {
      log.debug(`[packageCache] Cleaned up ${deleted} entries`)
    }
  }

  // Periodic cleanup every 2 minutes
  // Note: cleanup runs for process lifetime; no router-level cleanup needed
  const cleanupInterval = setInterval(cleanupCache, 2 * 60 * 1000)

  function getCachedPackage(opcId) {
    const entry = packageCache.get(opcId)
    if (entry) {
      entry.lastAccess = Date.now()
      return entry
    }
    return null
  }

  function setCachedPackage(opcId, pkgBuf, checksum, version) {
    // Cleanup before adding new entry
    if (packageCache.size >= MAX_CACHE_SIZE) {
      cleanupCache()
    }
    packageCache.set(opcId, { buf: pkgBuf, checksum, version, lastAccess: Date.now() })
  }

function writeLog(level, component, message) {
  try {
    db.prepare('INSERT INTO log_entries (timestamp, level, component, message) VALUES (?, ?, ?, ?)')
      .run(now(), level, component, message)
  } catch (_) {}
  const lvl = level.toLowerCase()
  if (lvl === 'error') log.error(`[${component}] ${message}`)
  else if (lvl === 'warn') log.warn(`[${component}] ${message}`)
  else log.info(`[${component}] ${message}`)
}

function collectOpcData(opcId) {
  const opc = db.prepare('SELECT * FROM opc_config WHERE id = ?').get(opcId)
  if (!opc) throw new Error(`OPC not found: ${opcId}`)

  // Get global opc_root from settings
  const settingsRow = db.prepare('SELECT value FROM settings WHERE key = ?').get('opc_root')
  const opcRoot = settingsRow?.value || '~/.openclaw/OPC'

  const agents = db.prepare('SELECT * FROM agents WHERE opc_id = ? ORDER BY order_index').all(opcId)
  const agentIds = agents.map(a => a.id)

  let agentDocuments = []
  if (agentIds.length > 0) {
    const ph = agentIds.map(() => '?').join(',')
    agentDocuments = db.prepare(`SELECT * FROM agent_documents WHERE agent_id IN (${ph})`).all(...agentIds)
  }

  const channels = db.prepare('SELECT * FROM channels WHERE opc_id = ?').all(opcId)
  const bindings = db.prepare('SELECT * FROM bindings WHERE opc_id = ?').all(opcId)
  const modelProviders = db.prepare('SELECT name, api, api_key, base_url, is_enabled FROM model_providers_v2').all()
    .map(p => ({ ...p, api_key: decrypt(p.api_key) }))
  
  // Tools metadata (from DB)
  const tools = db.prepare('SELECT * FROM tools ORDER BY id').all()
  
  // Skills: scan skills/ directory and collect actual files
  const skillsDir = path.join(WORKSPACE_ROOT, 'bundle/skills')
  const skills = []
  
  if (fs.existsSync(skillsDir)) {
    const skillSlugs = fs.readdirSync(skillsDir).filter(f => {
      const stat = fs.statSync(path.join(skillsDir, f))
      return stat.isDirectory()
    })
    
    for (const slug of skillSlugs) {
      const skillPath = path.join(skillsDir, slug)

      // Recursively collect all files (relative paths)
      const collectFiles = (dir, base = '') => {
        const result = []
        for (const entry of fs.readdirSync(dir)) {
          const full = path.join(dir, entry)
          const rel = base ? `${base}/${entry}` : entry
          if (fs.statSync(full).isDirectory()) {
            result.push(...collectFiles(full, rel))
          } else {
            result.push(rel)
          }
        }
        return result
      }
      const files = collectFiles(skillPath)
      
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
    skills,
    opc_root: opcRoot
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
      let buf
      if (Buffer.isBuffer(content)) {
        buf = content
      } else if (typeof content === 'string') {
        buf = Buffer.from(content, 'utf8')
      } else {
        buf = Buffer.from(JSON.stringify(content, null, 2), 'utf8')
      }
      tarPack.entry({ name: tarPath, size: buf.length }, buf, (err) => {
        if (err) reject(err)
      })
    }

    // manifest.json
    addFile('manifest.json', JSON.stringify(manifest, null, 2))

    // agents/{id}/*.md (legacy, not used with $include)
    for (const doc of data.agent_documents) {
      const filename = `${doc.document_type}.md`
      addFile(`agents/${doc.agent_id}/${filename}`, doc.content)
    }

    // skills/{slug}/* (actual skill files, including subdirectories)
    for (const skill of data.skills) {
      for (const relFile of skill.files) {
        const filePath = path.join(skill.path, relFile)
        const content = fs.readFileSync(filePath)
        addFile(`skills/${skill.slug}/${relFile}`, content)
      }
    }

    tarPack.finalize()
  })
}

/**
 * Deploy 前统一重新生成所有 agent 的 AGENTS.md 和 SOUL.md 领队段落。
 *
 * - AGENTS.md：全团队花名册（所有 agent 一致）
 * - SOUL.md：若 agent.manages 非空，追加/替换领队协调段落；否则移除该段落
 *
 * 用 <!-- CLAWPILOT:LEADER_START --> / <!-- CLAWPILOT:LEADER_END --> 标记
 * 划定领队段落边界，避免覆盖用户自定义的其他内容。
 */
function regenerateAgentDocuments(opcId) {
  const opc = db.prepare('SELECT * FROM opc_config WHERE id = ?').get(opcId)
  if (!opc) return

  const agents = db.prepare('SELECT * FROM agents WHERE opc_id = ? ORDER BY order_index').all(opcId)
  if (agents.length === 0) return

  // Parse JSON fields
  const parsed = agents.map(a => ({
    ...a,
    manages: safeJsonArray(a.manages),
    reports_to: safeJsonArray(a.reports_to),
    enabled_skills: safeJsonArray(a.enabled_skills),
  }))

  // Build unified roster for AGENTS.md
  const rosterRows = parsed.map(a =>
    `| **${a.display_name}${a.manages?.length ? '（领队）' : ''}** | ${a.name} | ${a.job_title || '-'} | ${a.initials || '-'} |`
  ).join('\n')

  const upsertDoc = db.prepare(`
    INSERT INTO agent_documents (agent_id, document_type, content)
    VALUES (?, ?, ?)
    ON CONFLICT(agent_id, document_type) DO UPDATE SET content = excluded.content
  `)

  for (const agent of parsed) {
    const isLeader = agent.manages.length > 0
    const reportsTo = agent.reports_to.length > 0
      ? parsed.filter(a => agent.reports_to.includes(a.name)).map(a => a.display_name).join('、')
      : 'Boss（真人）'

    // ── AGENTS.md ───────────────────────────────────────────
    const agentsMd = buildAgentsMd(agent, parsed, opc, rosterRows, reportsTo)
    upsertDoc.run(agent.id, 'AGENTS', agentsMd)

    // ── SOUL.md：仅修改领队段落，其他内容保留 ───────────────
    const existingSoul = db.prepare(
      `SELECT content FROM agent_documents WHERE agent_id = ? AND document_type = 'SOUL'`
    ).get(agent.id)

    // SOUL.md: 只更新已存在的，不创建新的
    // 新的 SOUL.md 应该由 ai_generate_agents 生成并通过 batch_create_agents 保存
    if (existingSoul) {
      const soulContent = isLeader
        ? injectLeaderSection(existingSoul.content, agent, parsed, opc)
        : removeLeaderSection(existingSoul.content)
      upsertDoc.run(agent.id, 'SOUL', soulContent)
    }
  }
}

function safeJsonArray(val) {
  if (!val) return []
  try { const r = JSON.parse(val); return Array.isArray(r) ? r : [] } catch { return [] }
}

function buildAgentsMd(agent, allAgents, opc, rosterRows, reportsTo) {
  return `# AGENTS.md - Your Workspace

_${opc.display_name} 团队成员_

## 团队编制

| 成员 | AgentId | 职位 | Emoji |
|------|---------|------|-------|
| **Boss** | - | 最高决策者，唯一真人 | 👑 |
${rosterRows}

## 汇报关系

- **我是：** ${agent.display_name}（${agent.job_title || agent.name}）
- **汇报给：** ${reportsTo}
${agent.manages.length > 0 ? `- **我管理：** ${allAgents.filter(a => agent.manages.includes(a.name)).map(a => a.display_name).join('、')}` : ''}

## Every Session

开始任何工作前：

1. 读 \`SOUL.md\` — 这是你的身份
2. 读 \`USER.md\` — 了解你在帮谁
3. 读 \`memory/YYYY-MM-DD.md\`（今天 + 昨天）获取近期上下文
4. 读 \`MEMORY.md\` — 长期记忆

不需要请求许可，直接读。

## Memory

- **日记：** \`memory/YYYY-MM-DD.md\` — 原始工作日志
- **长期记忆：** \`MEMORY.md\` — 重要决策和经验教训

## Safety

- 不泄露私人数据
- 不可逆操作前先确认
- 拿不准时，先问
`
}

const LEADER_START = '<!-- CLAWPILOT:LEADER_START -->'
const LEADER_END = '<!-- CLAWPILOT:LEADER_END -->'

function buildLeaderSection(agent, allAgents, opc) {
  const managedNames = allAgents
    .filter(a => agent.manages.includes(a.name))
    .map(a => `${a.display_name}（${a.name}）`)
    .join('、')

  return `${LEADER_START}

## 多智能体协调（领队职责）

你是 **${opc.display_name}** 团队的领队，负责协调以下成员：${managedNames}

### 收到用户复杂任务时的流程

1. **提取回复信息**：从系统提示中找到 \`"sender_id": "ou_xxx"\`，这是用户的飞书 open_id
2. **拆解任务**：将任务拆解为 DAG（多个步骤，明确依赖关系）
3. **创建 Plan**：使用 \`create-plan\` skill 调用 \`POST /api/plans\`，填入：
   - \`reply_channel: "feishu"\`
   - \`reply_to: <sender_id>\`
4. **展示计划**：在飞书向用户展示计划摘要，等待确认
5. **执行**：用户确认后调用 \`PATCH /api/plans/:id/approve\`，或等待 daemon 自动审批（2分钟）
6. **完成回复**：Plan 完成后，根据 \`reply_channel\` 决定回复方式：
   - \`feishu\`：调用飞书 API，向 \`reply_to\`（open_id）发送消息
   - null / 未设置：在当前会话直接输出结果（终端测试时的自然状态）

### 何时创建 Plan

- 任务需要多个步骤或多个 agent 协作时
- 预计耗时超过一次对话能完成的范围时
- 简单的单步问答**不需要**创建 Plan，直接回复即可

${LEADER_END}`
}

function injectLeaderSection(soulContent, agent, allAgents, opc) {
  const section = buildLeaderSection(agent, allAgents, opc)
  const startIdx = soulContent.indexOf(LEADER_START)
  const endIdx = soulContent.indexOf(LEADER_END)

  if (startIdx !== -1 && endIdx !== -1) {
    // Replace existing section
    return soulContent.slice(0, startIdx) + section + soulContent.slice(endIdx + LEADER_END.length)
  }
  // Append at end
  return soulContent.trimEnd() + '\n\n' + section + '\n'
}

function removeLeaderSection(soulContent) {
  const startIdx = soulContent.indexOf(LEADER_START)
  const endIdx = soulContent.indexOf(LEADER_END)
  if (startIdx === -1 || endIdx === -1) return soulContent
  return (soulContent.slice(0, startIdx) + soulContent.slice(endIdx + LEADER_END.length)).trimEnd() + '\n'
}

/** Generate openclaw.json config from OPC data - using $include references */
function generateOpenclawConfig(opcId) {
  const data = collectOpcData(opcId)
  const { opc, agents, channels, model_providers: modelProviders, opc_root: opcRoot } = data

  // Build agents list
  const agentsList = agents.map(agent => ({
    id: agent.name,
    name: agent.name,
    workspace: `${opcRoot}/${opc.id}/workspace-${agent.display_name}`,
    model: { primary: agent.model ?? `${agent.model_provider ?? 'anthropic'}/${agent.model_name ?? 'claude-opus-4-5'}` },
    identity: {
      name: agent.display_name,
      emoji: agent.initials || (agent.name ? agent.name[0] : '?'),
    },
  }))

  // Default model from first enabled provider's first model
  const firstProvider = modelProviders.find(p => p.is_enabled === 1) ?? modelProviders[0]
  let defaultModel = 'anthropic/claude-opus-4-5'
  if (firstProvider) {
    const firstModel = db.prepare(
      'SELECT model_id FROM model_info_v2 WHERE provider_name = ? ORDER BY sort_order LIMIT 1'
    ).get(firstProvider.name)
    if (firstModel) {
      defaultModel = `${firstProvider.name}/${firstModel.model_id}`
    }
  }

  // Build channels section
  const channelsSection = {}
  const feishuChannel = channels.find(c => c.channel_type === 'FEISHU')
  if (feishuChannel) {
    try {
      let feishuConfig = feishuChannel.feishu_config ?? {}
      if (typeof feishuConfig === 'string') {
        try { feishuConfig = JSON.parse(decrypt(feishuConfig)) } catch { try { feishuConfig = JSON.parse(feishuConfig) } catch { feishuConfig = {} } }
      }
      if (feishuConfig.app_id) {
        channelsSection.feishu = {
          enabled: true,
          appId: feishuConfig.app_id,
          appSecret: feishuConfig.app_secret ?? '',
          connectionMode: 'websocket',
          domain: 'feishu',
          groupPolicy: 'open',
          tools: { perm: true },
        }
      }
    } catch (_) { /* ignore parse error */ }
  }

  // Build models section — only include providers that have models defined
  const providersSection = {}
  for (const p of modelProviders.filter(mp => mp.is_enabled === 1)) {
    const models = db.prepare(
      'SELECT * FROM model_info_v2 WHERE provider_name = ? ORDER BY sort_order, model_id'
    ).all(p.name)

    // Only include providers that have models defined
    if (models.length === 0) continue

    const modelsArray = models.map(m => {
      let inputTypes
      try { inputTypes = JSON.parse(m.input_types) } catch { inputTypes = ['text'] }
      return {
        id: m.model_id,
        name: m.model_id,
        reasoning: false,
        input: inputTypes,
        cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 },
        contextWindow: m.context_window ?? 0,
        maxTokens: m.max_tokens ?? 0,
      }
    })

    providersSection[p.name] = {
      baseUrl: p.base_url,
      apiKey: p.api_key ?? '',
      api: p.api ?? 'openai-completions',
      models: modelsArray,
    }
  }

  // Build agents defaults
  const agentsDefaults = {
    workspace: opcRoot,
    model: { primary: defaultModel },
  }

  // Build full config sections for json5 files
  const agentsSection = {
    defaults: agentsDefaults,
    list: agentsList,
  }

  const modelsSection = { providers: providersSection }

  // Build bindings section (OpenClaw format)
  // Format: [{ agentId: "xxx", match: { channel: "feishu", peer: { kind: "group/direct", id: "xxx" } } }]
  const bindingsSection = data.bindings
    .filter(b => b.is_enabled === 1)
    .map(b => ({
      agentId: b.agent_name,
      match: {
        channel: b.channel_type.toLowerCase(),
        peer: {
          kind: b.channel_type === 'GROUP' ? 'group' : 'direct',
          id: b.channel_id,
        },
      },
    }))

  // Return config with $include references - matching local openclaw.json format
  // The main openclaw.json uses $include to reference separate json5 files
  // _sections is for internal use to generate the json5 files
  return {
    _sections: {
      agents: agentsSection,
      models: modelsSection,
      channels: channelsSection,
      bindings: bindingsSection,
    },
    agents: { "$include": `./OPC/${opc.id}/agents.json5` },
    models: { "$include": `./OPC/${opc.id}/models.json5` },
    channels: { "$include": `./OPC/${opc.id}/channels.json5` },
    bindings: { "$include": `./OPC/${opc.id}/bindings.json5` },
  }
}

// ── POST /api/generate_openclaw_config ───────────────────────
router.post('/generate_openclaw_config', (req, res) => {
  try {
    const { opc_id } = req.body
    if (!opc_id) return res.status(400).json({ error: 'opc_id is required' })
    const config = generateOpenclawConfig(opc_id)
    res.json(config)
  } catch (err) {
    res.status(500).json({ error: err.message })
  }
})

// ── POST /api/build_deploy_package ───────────────────────────
router.post('/build_deploy_package', async (req, res) => {
  try {
    const { opc_id } = req.body
    if (!opc_id) return res.status(400).json({ error: 'opc_id is required' })

    const data = collectOpcData(opc_id)
    const version = new Date().toISOString()
    const manifest = { opc_id, version, checksum: '', opc_root: data.opc_root }

    // Generate openclaw.json
    const openclawConfig = generateOpenclawConfig(opc_id)

    // Build base package
    const pkgBuf = await buildPackageWithOpenclaw(data, manifest, openclawConfig)

    // Compute checksum
    const checksum = 'sha256:' + createHash('sha256').update(pkgBuf).digest('hex')

    // Store in cache with TTL
    setCachedPackage(opc_id, pkgBuf, checksum, version)

    res.json({ ok: true, checksum, size: pkgBuf.length })
  } catch (err) {
    res.status(500).json({ error: err.message })
  }
})

/** Extended buildPackage that also includes openclaw.json with $include references */
function buildPackageWithOpenclaw(data, manifest, openclawConfig) {
  return new Promise((resolve, reject) => {
    const tarPack = pack()
    const chunks = []

    const gz = zlib.createGzip()
    gz.on('data', chunk => chunks.push(chunk))
    gz.on('end', () => resolve(Buffer.concat(chunks)))
    gz.on('error', reject)
    tarPack.pipe(gz)

    const addFile = (tarPath, content) => {
      return new Promise((resolve, reject) => {
        let buf
        if (Buffer.isBuffer(content)) {
          buf = content
        } else if (typeof content === 'string') {
          buf = Buffer.from(content, 'utf8')
        } else {
          buf = Buffer.from(JSON.stringify(content, null, 2), 'utf8')
        }
        log.info(`[buildPackage] Adding file: ${tarPath} (${buf.length} bytes)`)
        tarPack.entry({ name: tarPath, size: buf.length }, buf, (err) => {
          if (err) reject(err)
          else resolve()
        })
      })
    }

    // Build package sequentially to ensure proper ordering
    (async () => {
      try {
        // manifest.json
        await addFile('manifest.json', JSON.stringify(manifest, null, 2))

        // Note: We do NOT include opc-xxx/openclaw.json in the tar package.
        // Instead, daemon will directly update the main ~/.openclaw/openclaw.json
        // with $include references to the json5 files.
        const opcId = data.opc.id

        // Build workspace directories with agent md files
        // Structure: {opc_id}/workspace-{AGENT_NAME}/*.md

        // Group agent documents by agent_id
        const docsByAgent = {}
        for (const doc of data.agent_documents) {
          if (!docsByAgent[doc.agent_id]) docsByAgent[doc.agent_id] = {}
          docsByAgent[doc.agent_id][doc.document_type] = doc.content
        }

        for (const agent of data.agents) {
          const workspaceName = `workspace-${agent.display_name}`
          const agentDocs = docsByAgent[agent.id] || {}

          // Add all md files to workspace
          for (const [docType, content] of Object.entries(agentDocs)) {
            const filename = `${docType}.md`
            await addFile(`${opcId}/${workspaceName}/${filename}`, content)
          }

          // Copy skills to agent's workspace directory (each agent has its own skills)
          // Skills are copied from bundle/skills/{skillSlug}/ to {opc_id}/workspace-{name}/skills/{skillSlug}/
          for (const skill of data.skills) {
            for (const relFile of skill.files) {
              const filePath = path.join(skill.path, relFile)
              const content = fs.readFileSync(filePath)
              await addFile(`${opcId}/${workspaceName}/skills/${skill.slug}/${relFile}`, content)
            }
          }
        }

        // Also add .json5 files for $include references - use properly formatted sections
        const sections = openclawConfig._sections || {}
        await addFile(`${opcId}/agents.json5`, sections.agents || { defaults: {}, list: [] })
        await addFile(`${opcId}/models.json5`, sections.models || { providers: {} })
        await addFile(`${opcId}/channels.json5`, sections.channels || {})
        await addFile(`${opcId}/bindings.json5`, sections.bindings || [])

        // Note: Skills are now copied to each agent's workspace directory above
        // No shared skills directory at OPC root level

        tarPack.finalize()
      } catch (err) {
        log.error(`[buildPackage] Error during packaging: ${err.message}`)
        reject(err)
      }
    })()

    // Log package contents after finalize
    gz.on('end', () => {
      const totalSize = chunks.reduce((sum, c) => sum + c.length, 0)
      log.info(`[buildPackage] Package completed: ${totalSize} bytes`)
      log.info(`[buildPackage] Package structure:`)
      log.info(`[buildPackage]   - manifest.json`)
      log.info(`[buildPackage]   - openclaw.json`)
      log.info(`[buildPackage]   - ${manifest.opc_id}/workspace-*/ (agent workspaces)`)
      log.info(`[buildPackage]   - ${manifest.opc_id}/skills/ (shared skills)`)
      log.info(`[buildPackage]   - ${manifest.opc_id}/*.json5 (config files)`)
      log.info(`[buildPackage] opc_root: ${manifest.opc_root}`)
    })
  })
}

// ── POST /api/start_deployment ────────────────────────────────
router.post('/start_deployment', async (req, res) => {
  try {
    const { opc_id, office_id } = req.body
    if (!opc_id || !office_id) return res.status(400).json({ error: 'opc_id and office_id are required' })

    const opc = db.prepare('SELECT * FROM opc_config WHERE id = ?').get(opc_id)
    if (!opc) return res.status(400).json({ error: 'OPC not found' })

    const officeRow = db.prepare('SELECT * FROM offices WHERE id = ?').get(office_id)
    if (!officeRow) return res.status(400).json({ error: 'Office not found' })
    const office = { ...officeRow, daemon_api_key: decrypt(officeRow.daemon_api_key) }

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
      log.info(`start_deployment: daemon mode opc=${opc.name} office=${office.name} task=${taskId}`)
      setImmediate(() => runDaemonDeploy(taskId, opc_id, opc, office).catch(e => log.error(`runDaemonDeploy: ${e.message}`)))
    } else {
      // Stub simulation (no daemon configured)
      log.info(`start_deployment: stub mode opc=${opc.name} office=${office.name} task=${taskId}`)
      runStubDeploy(taskId, opc_id, opc, office)
    }

    res.json(taskId)
  } catch (err) {
    log.error(`start_deployment: ${err.message}`)
    res.status(500).json({ error: err.message })
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

  // Regenerate agent documents synchronously before simulation
  try { regenerateAgentDocuments(opc_id) } catch (_) {}
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

    // Regenerate agent documents (AGENTS.md + leader SOUL.md section) before packaging
    regenerateAgentDocuments(opc_id)

    // Build package with openclaw.json included
    const data = collectOpcData(opc_id)
    const version = new Date().toISOString()
    const manifest = { opc_id, version, checksum: '', opc_root: data.opc_root }
    const openclawConfig = generateOpenclawConfig(opc_id)

    const pkgBuf = await buildPackageWithOpenclaw(data, manifest, openclawConfig)

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
      signal: AbortSignal.timeout(DAEMON_UPLOAD_TIMEOUT_MS),
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
    const deadline = Date.now() + DAEMON_DEPLOY_TIMEOUT_MS
    while (Date.now() < deadline) {
      await sleep(DAEMON_POLL_INTERVAL_MS)

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
    res.status(500).json({ error: err.message })
  }
})

// ── POST /api/cancel_deployment ──────────────────────────────
router.post('/cancel_deployment', (req, res) => {
  try {
    const { task_id } = req.body
    db.prepare(`UPDATE deployment_tasks SET status = 'FAILED', message = 'Cancelled', completed_at = ? WHERE id = ?`)
      .run(now(), task_id)
    log.info(`cancel_deployment: task=${task_id}`)
    res.json(null)
  } catch (err) {
    log.error(`cancel_deployment: ${err.message}`)
    res.status(500).json({ error: err.message })
  }
})

/** Build a minimal reset package containing only the initial openclaw config */
function buildResetPackage(initialConfig) {
  return new Promise((resolve, reject) => {
    const tarPack = pack()
    const chunks = []
    const gz = zlib.createGzip()
    gz.on('data', chunk => chunks.push(chunk))
    gz.on('end', () => resolve(Buffer.concat(chunks)))
    gz.on('error', reject)
    tarPack.pipe(gz)

    const addFile = (name, content) => {
      const buf = typeof content === 'string' ? Buffer.from(content, 'utf8') : Buffer.from(JSON.stringify(content, null, 2), 'utf8')
      tarPack.entry({ name, size: buf.length }, buf, err => { if (err) reject(err) })
    }

    const manifest = { opc_id: null, version: new Date().toISOString(), checksum: '', reset: true }
    addFile('manifest.json', JSON.stringify(manifest, null, 2))
    addFile('openclaw.json', initialConfig)
    tarPack.finalize()
  })
}

// ── POST /api/undeploy ───────────────────────────────────────
router.post('/undeploy', async (req, res) => {
  try {
    const { opc_id } = req.body
    const ts = now()

    // Find which office this OPC is deployed to
    const opc = db.prepare('SELECT office_id FROM opc_config WHERE id = ?').get(opc_id)
    const officeRow = opc?.office_id
      ? db.prepare('SELECT daemon_url, daemon_api_key, initial_openclaw_config FROM offices WHERE id = ?').get(opc.office_id)
      : null
    const office = officeRow ? { ...officeRow, daemon_api_key: decrypt(officeRow.daemon_api_key) } : null

    // Update DB records
    db.prepare(`UPDATE office_deployments SET is_active = 0, undeployed_at = ? WHERE opc_id = ? AND is_active = 1`)
      .run(ts, opc_id)
    db.prepare(`UPDATE opc_config SET is_running = 0, office_id = NULL WHERE id = ?`).run(opc_id)
    writeLog('INFO', 'deployment', `Undeployed opc_id=${opc_id}`)

    // Push initial config back to daemon to restore clean state
    if (office?.daemon_url && office?.daemon_api_key && office?.initial_openclaw_config) {
      try {
        const initialConfig = office.initial_openclaw_config
        const pkgBuf = await buildResetPackage(initialConfig)
        const form = new FormData()
        const manifest = { opc_id: null, version: new Date().toISOString(), checksum: '', reset: true }
        form.append('manifest', JSON.stringify(manifest), { contentType: 'application/json' })
        form.append('package', pkgBuf, { filename: 'package.tar.gz', contentType: 'application/gzip' })
        const daemonUrl = office.daemon_url.replace(/\/$/, '')
        await fetch(`${daemonUrl}/deploy`, {
          method: 'POST',
          headers: { ...form.getHeaders(), 'Authorization': `Bearer ${office.daemon_api_key}` },
          body: form.getBuffer(),
          signal: AbortSignal.timeout(DAEMON_UPLOAD_TIMEOUT_MS),
        })
        writeLog('INFO', 'deployment', `Pushed initial config to daemon after undeploy opc_id=${opc_id}`)
      } catch (e) {
        writeLog('WARN', 'deployment', `Failed to push initial config: ${e.message}`)
      }
    }

    res.json(null)
  } catch (err) {
    res.status(500).json({ error: err.message })
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
    res.status(500).json({ error: err.message })
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
    res.status(500).json({ error: err.message })
  }
})

// ── POST /api/deploy_to_office ───────────────────────────────
router.post('/deploy_to_office', async (req, res) => {
  try {
    const { opc_id, office_id } = req.body
    if (!opc_id || !office_id) return res.status(400).json({ error: 'opc_id and office_id are required' })

    const opc = db.prepare('SELECT * FROM opc_config WHERE id = ?').get(opc_id)
    if (!opc) return res.status(400).json({ error: 'OPC not found' })

    const officeRow2 = db.prepare('SELECT * FROM offices WHERE id = ?').get(office_id)
    if (!officeRow2) return res.status(400).json({ error: 'Office not found' })
    const office = { ...officeRow2, daemon_api_key: decrypt(officeRow2.daemon_api_key) }

    if (!office.daemon_url) {
      return res.json({ ok: false, error: '该办公室未配置 Daemon，请先安装物业' })
    }

    // Regenerate agent documents before packaging (invalidates any stale cache)
    regenerateAgentDocuments(opc_id)

    // Build or use cached package
    let cached = getCachedPackage(opc_id)
    if (!cached) {
      const data = collectOpcData(opc_id)
      const version = new Date().toISOString()
      const manifest = { opc_id, version, checksum: '', opc_root: data.opc_root }
      const openclawConfig = generateOpenclawConfig(opc_id)
      const pkgBuf = await buildPackageWithOpenclaw(data, manifest, openclawConfig)
      const checksum = 'sha256:' + createHash('sha256').update(pkgBuf).digest('hex')
      cached = { buf: pkgBuf, checksum, version }
      setCachedPackage(opc_id, pkgBuf, checksum, version)
    }

    const { buf: pkgBuf, checksum, version } = cached
    // Get opc_root from cached data or re-collect if needed
    const data = collectOpcData(opc_id)
    const manifest = { opc_id, version, checksum, opc_root: data.opc_root }

    // Create local task record first
    const taskId = randomUUID()
    db.prepare(`
      INSERT INTO deployment_tasks (id, opc_id, office_id, opc_name, status, steps, current_step, created_at)
      VALUES (?, ?, ?, ?, 'RUNNING', ?, 1, ?)
    `).run(taskId, opc_id, office_id, opc.name,
      JSON.stringify(['准备配置文件', '发送部署包', '等待完成', '健康检查']),
      now()
    )
    try { db.prepare('UPDATE deployment_tasks SET started_at = ? WHERE id = ?').run(now(), taskId) } catch (_) {}

    writeLog('INFO', 'deployment', `deploy_to_office: ${opc.name} → ${office.name} (task: ${taskId})`)

    // Upload to daemon
    const form = new FormData()
    form.append('manifest', JSON.stringify(manifest), { contentType: 'application/json' })
    form.append('package', pkgBuf, { filename: 'package.tar.gz', contentType: 'application/gzip' })

    const daemonUrl = office.daemon_url.replace(/\/$/, '')
    let daemonTaskId
    try {
      const response = await fetch(`${daemonUrl}/deploy`, {
        method: 'POST',
        headers: {
          ...form.getHeaders(),
          'Authorization': `Bearer ${office.daemon_api_key ?? ''}`,
        },
        body: form.getBuffer(),
        signal: AbortSignal.timeout(DAEMON_UPLOAD_TIMEOUT_MS),
      })
      if (!response.ok) {
        const text = await response.text()
        throw new Error(`Daemon 返回错误 ${response.status}: ${text}`)
      }
      const respData = await response.json()
      daemonTaskId = respData.task_id
    } catch (err) {
      db.prepare(`UPDATE deployment_tasks SET status = 'FAILED', message = ?, completed_at = ? WHERE id = ?`)
        .run(err.message, now(), taskId)
      return res.json({ ok: false, error: err.message, task_id: taskId })
    }

    // Store daemon task id and update step
    try {
      db.prepare('UPDATE deployment_tasks SET daemon_task_id = ?, current_step = ? WHERE id = ?')
        .run(daemonTaskId, 2, taskId)
    } catch (_) {}

    res.json({ ok: true, task_id: taskId })

    // Background polling
    let pollCount = 0
    const maxPolls = 60
    const pollInterval = setInterval(async () => {
      pollCount++
      if (pollCount > maxPolls) {
        clearInterval(pollInterval)
        db.prepare(`UPDATE deployment_tasks SET status = 'FAILED', message = ?, completed_at = ? WHERE id = ?`)
          .run('部署超时（3分钟）', now(), taskId)
        return
      }
      try {
        const statusResp = await fetch(`${daemonUrl}/deploy/${daemonTaskId}`, {
          headers: { 'Authorization': `Bearer ${office.daemon_api_key ?? ''}` },
          signal: AbortSignal.timeout(10000),
        })
        if (!statusResp.ok) return
        const statusData = await statusResp.json()
        const taskStatus = statusData.state?.status ?? statusData.status

        if (taskStatus === 'success') {
          clearInterval(pollInterval)
          const logs = statusData.state?.logs ?? statusData.logs ?? []
          db.prepare(`UPDATE deployment_tasks SET status = 'SUCCESS', current_step = 4, completed_at = ?, message = ? WHERE id = ?`)
            .run(now(), logs.join('\n'), taskId)
          db.prepare(`UPDATE office_deployments SET is_active = 0, undeployed_at = ? WHERE opc_id = ? AND is_active = 1`)
            .run(now(), opc_id)
          db.prepare(`INSERT INTO office_deployments (id, opc_id, opc_name, office_id, office_name, deployed_at, is_active) VALUES (?, ?, ?, ?, ?, ?, 1)`)
            .run(randomUUID(), opc_id, opc.name, office.id, office.name, now())
          db.prepare(`UPDATE opc_config SET is_running = 1, office_id = ? WHERE id = ?`).run(office.id, opc_id)
          writeLog('INFO', 'deployment', `deploy_to_office SUCCESS: ${opc.name} → ${office.name}`)
        } else if (taskStatus === 'failed') {
          clearInterval(pollInterval)
          const errMsg = statusData.state?.error ?? statusData.error ?? '部署失败'
          db.prepare(`UPDATE deployment_tasks SET status = 'FAILED', message = ?, completed_at = ? WHERE id = ?`)
            .run(errMsg, now(), taskId)
          writeLog('ERROR', 'deployment', `deploy_to_office FAILED: ${errMsg}`)
        } else {
          // In progress
          const logs = statusData.state?.logs ?? statusData.logs ?? []
          const logSnippet = logs.slice(-5).join('\n')
          try {
            db.prepare('UPDATE deployment_tasks SET message = ?, current_step = ? WHERE id = ?')
              .run(logSnippet, 3, taskId)
          } catch (_) {}
        }
      } catch (_) { /* ignore poll errors */ }
    }, 3000)

  } catch (err) {
    res.status(500).json({ error: err.message })
  }
})

  return router
}

// Backward compatibility
export default createDeploymentRouter
