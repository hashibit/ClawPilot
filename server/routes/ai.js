import { Router } from 'express'
import path from 'path'
import fs from 'fs'
import { fileURLToPath } from 'url'
import { createLogger } from '../logger.js'
import { decrypt } from '../utils/crypto.js'

const __dirname = path.dirname(fileURLToPath(import.meta.url))

// Load bundle skills metadata for valid skills list
const BUNDLE_SKILLS_METADATA_PATH = path.resolve(__dirname, '../../bundle/bundled-skills-metadata.json')
let _cachedValidSkillSlugs = null
let _cachedSystemPromptSkills = null

function getValidSkillSlugs() {
  if (_cachedValidSkillSlugs) return _cachedValidSkillSlugs
  try {
    const metadata = JSON.parse(fs.readFileSync(BUNDLE_SKILLS_METADATA_PATH, 'utf8'))
    _cachedValidSkillSlugs = new Set(metadata.skills.map(s => s.slug))
    return _cachedValidSkillSlugs
  } catch {
    // Fallback to hardcoded list if metadata file not found
    return new Set([
      'multi-round-memory','proactive-speak','scheduled-heartbeat','mention-response','direct-response',
      'message-routing','context-compression','tool-calling','memory-persistence','emotional-aware',
      'github-helper','web-search','feishu-helper'
    ])
  }
}

function getSystemPromptSkillsText() {
  if (_cachedSystemPromptSkills) return _cachedSystemPromptSkills
  try {
    const metadata = JSON.parse(fs.readFileSync(BUNDLE_SKILLS_METADATA_PATH, 'utf8'))
    const coreSkills = metadata.skills.filter(s => s.category === 'core')
    const extSkills = metadata.skills.filter(s => s.category === 'integration')
    const coreList = coreSkills.map(s => `${s.slug} (${s.display_name})`).join(',')
    const extList = extSkills.map(s => `${s.slug} (${s.display_name})`).join(',')
    _cachedSystemPromptSkills = `核心技能：${coreList}\n扩展技能：${extList}`
    return _cachedSystemPromptSkills
  } catch {
    return '核心技能：multi-round-memory（多轮记忆）、proactive-speak（主动发言）、scheduled-heartbeat（定时心跳）、mention-response（被@响应）、direct-response（私信响应）、message-routing（消息路由）、context-compression（上下文压缩）、tool-calling（工具调用）、memory-persistence（记忆持久化）、emotional-aware（情绪感知）\n扩展技能：github-helper（GitHub 助手）、web-search（网页搜索）、feishu-helper（飞书助手）'
  }
}

const SYSTEM_PROMPT = `/no_think 你是一个 OpenClaw Agent 人格配置生成器。根据用户的描述，生成完整的 Agent 配置。

可选工具 ID（enabled_tools 从中选择合适的，数组）：
web_search（网页搜索）、web_reader（网页阅读）、feishu_message（发飞书消息）、code_interpreter（代码解释器）、file_reader（文件读取）、image_gen（图像生成）、image_analysis（视觉理解）、http_request（HTTP 请求）、asr（语音识别）、tts（语音合成）

可选技能 slug（enabled_skills 从中选择合适的，数组）：
${getSystemPromptSkillsText()}

严格以 JSON 格式返回，包含以下字段：
{
  "display_name": "显示名称（2-8 字，中文）",
  "name": "英文标识（小写字母 + 下划线，如 ux_designer）",
  "job_title": "职位名称",
  "description": "一句话描述",
  "personality": "性格关键词，逗号分隔，如：细腻、严谨、主动",
  "guardrail_allow": ["允许自主执行的操作，每条简短短语"],
  "guardrail_deny": ["禁止或须请示的操作，每条简短短语"],
  "enabled_tools": ["根据角色职能选择合适的工具 ID，数组"],
  "enabled_skills": ["根据角色行为选择合适的技能 slug，数组"],
  "soul": "SOUL.md 完整内容（Markdown，包含：身份定位 + 核心职责列表 + Boss/定位/emoji + 记忆管理规则 + 权限护栏，按角色特点详细撰写）",
  "identity": "IDENTITY.md 内容（列出 Name/Title/Persona/Role/Emoji/Boss 字段）",
  "agents": "AGENTS.md 内容（Markdown，包含成员编制表占位 + Every Session 阅读清单 + Memory 规则 + Safety 原则）",
  "user": "USER.md 内容（简短：Boss 是唯一汇报对象，可加一句 Boss 偏好）",
  "memory": "MEMORY.md 内容（Markdown，包含置信度图例 + 关于 Boss/项目/经验教训三个空章节）",
  "heartbeat": "HEARTBEAT.md 内容（注释说明 heartbeat 用途，默认为空）",
  "tools": "TOOLS.md 内容（说明用途：记录常用工具和使用心得）"
}

guardrail 规范：每条 3-10 字的短语，允许 3-6 条，禁止 3-5 条，按角色职能定制。
只输出 JSON，不要有任何其他内容。`

export function createAiRouter(db, dao) {
  const log = createLogger('ai')
  const router = Router()

// ai_generate_agent
router.post('/ai_generate_agent', async (req, res) => {
  const { prompt } = req.body
  log.info(`ai_generate_agent: prompt="${(prompt ?? '').slice(0, 60)}${(prompt?.length ?? 0) > 60 ? '...' : ''}"`)

  if (!prompt?.trim()) return res.status(400).json({ error: 'prompt is required' })

  const row = dao.getProviderByName('bailian')
  if (!row?.api_key) return res.status(400).json({ error: 'BAILIAN 未配置 API Key，请先在模型管理页完成配置并测试连接' })
  if (!row?.base_url) return res.status(400).json({ error: 'BAILIAN 未配置 Base URL，请先在模型管理页完成配置并测试连接' })

  const apiKey = decrypt(row.api_key)
  const baseUrl = row.base_url.replace(/\/$/, '')
  const isAnthropicUrl = baseUrl.includes('anthropic')
  const MODEL = 'qwen3.5-plus'

  const endpoint = isAnthropicUrl ? `${baseUrl}/v1/messages` : `${baseUrl}/chat/completions`
  const format = isAnthropicUrl ? 'anthropic' : 'openai'
  log.info(`ai_generate_agent: → ${format} POST ${endpoint} model=${MODEL}`)

  let rawText
  try {
    if (isAnthropicUrl) {
      const r = await fetch(endpoint, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-api-key': apiKey,
          'anthropic-version': '2023-06-01',
          'User-Agent': 'anthropic-sdk-node/0.32.1 node/v24.6.0 darwin arm64',
        },
        body: JSON.stringify({
          model: MODEL,
          system: SYSTEM_PROMPT,
          messages: [{ role: 'user', content: prompt }],
          max_tokens: 1024,
          thinking: { type: 'disabled' },
        }),
        signal: AbortSignal.timeout(120000),
      })
      log.info(`ai_generate_agent: ← HTTP ${r.status}`)
      if (!r.ok) {
        const t = await r.text()
        log.error(`ai_generate_agent: anthropic error body: ${t.slice(0, 200)}`)
        return res.status(502).json({ error: `Anthropic API 错误 ${r.status}: ${t.slice(0, 200)}` })
      }
      const data = await r.json()
      rawText = data.content?.[0]?.text ?? ''
    } else {
      const r = await fetch(endpoint, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${apiKey}`,
          'User-Agent': 'anthropic-sdk-node/0.32.1 node/v24.6.0 darwin arm64',
        },
        body: JSON.stringify({
          model: MODEL,
          messages: [
            { role: 'system', content: SYSTEM_PROMPT },
            { role: 'user', content: prompt },
          ],
          max_tokens: 2048,
          response_format: { type: 'json_object' },
          stream: false,
          enable_thinking: false,
        }),
        signal: AbortSignal.timeout(120000),
      })
      log.info(`ai_generate_agent: ← HTTP ${r.status}`)
      if (!r.ok) {
        const t = await r.text()
        log.error(`ai_generate_agent: openai error body: ${t.slice(0, 200)}`)
        return res.status(502).json({ error: `OpenAI API 错误 ${r.status}: ${t.slice(0, 200)}` })
      }
      const data = await r.json()
      rawText = data.choices?.[0]?.message?.content ?? ''
    }
  } catch (e) {
    log.error(`ai_generate_agent: fetch exception: ${e.message}`)
    return res.status(502).json({ error: `请求失败：${e.message}` })
  }

  log.debug(`ai_generate_agent: raw response (${rawText.length} chars): ${rawText.slice(0, 120)}`)

  // JSON 安全解析 + 重试机制
  function safeParseJson(text, retries = 2) {
    for (let attempt = 0; attempt <= retries; attempt++) {
      try {
        // 先尝试提取 markdown 代码块中的 JSON
        const match = text.match(/```(?:json)?\s*([\s\S]*?)```/m)
        const jsonStr = match ? match[1] : text.trim()
        return JSON.parse(jsonStr)
      } catch (parseErr) {
        if (attempt < retries) {
          // 尝试清洗控制字符：替换字面换行、制表符等为转义序列
          log.warn(`ai_generate_agent: JSON parse attempt ${attempt + 1} failed, trying cleanup...`)
          try {
            const match = text.match(/```(?:json)?\s*([\s\S]*?)```/m)
            let jsonStr = match ? match[1] : text.trim()
            // 转义字面控制字符
            jsonStr = jsonStr
              .replace(/\n/g, '\\n')
              .replace(/\r/g, '\\r')
              .replace(/\t/g, '\\t')
              // 清理其他控制字符（除了已转义的）
              .replace(/[\x00-\x08\x0b\x0c\x0e-\x1f]/g, '')
            text = jsonStr  // 直接保存清洗后的 JSON 字符串供下次解析
          } catch {}
        } else {
          throw parseErr
        }
      }
    }
    throw new Error('JSON parse failed after retries')
  }

  let parsed
  try {
    parsed = safeParseJson(rawText)
  } catch (parseErr) {
    log.error(`ai_generate_agent: JSON parse failed after retries, raw: ${rawText.slice(0, 300)}`)
    return res.status(502).json({ error: `AI 返回格式错误，无法解析 JSON:\n${rawText.slice(0, 300)}` })
  }

  const validToolIds = new Set(['web_search','web_reader','feishu_message','code_interpreter','file_reader','image_gen','image_analysis','http_request','asr','tts'])
  const validSkillSlugs = getValidSkillSlugs()

  const result = {
    display_name: parsed.display_name ?? '',
    name: (parsed.name ?? '').replace(/[^\w]/g, '_').toLowerCase(),
    job_title: parsed.job_title ?? '',
    description: parsed.description ?? '',
    personality: parsed.personality ?? '',
    guardrail_allow: Array.isArray(parsed.guardrail_allow) ? parsed.guardrail_allow.filter(s => typeof s === 'string') : [],
    guardrail_deny: Array.isArray(parsed.guardrail_deny) ? parsed.guardrail_deny.filter(s => typeof s === 'string') : [],
    enabled_tools: Array.isArray(parsed.enabled_tools) ? parsed.enabled_tools.filter(id => validToolIds.has(id)) : [],
    enabled_skills: Array.isArray(parsed.enabled_skills) ? parsed.enabled_skills.filter(s => validSkillSlugs.has(s)) : [],
    soul: parsed.soul ?? '',
    identity: parsed.identity ?? '',
    agents: parsed.agents ?? '',
    user: parsed.user ?? '',
    memory: parsed.memory ?? '',
    heartbeat: parsed.heartbeat ?? '',
    tools: parsed.tools ?? '',
  }
  log.info(`ai_generate_agent: OK display_name="${result.display_name}" name="${result.name}"`)
  res.json(result)
})

// ai_generate_agents - 一次性生成多个智能体
const SYSTEM_PROMPT_MULTI = `/no_think 你是一个 OpenClaw Agent 团队配置生成器。根据用户的描述，生成完整的团队配置。

每个智能体配置包含以下字段：
{
  "display_name": "显示名称（2-8 字，中文）",
  "name": "英文标识（小写字母 + 下划线，如 ux_designer）",
  "job_title": "职位名称",
  "description": "一句话描述",
  "personality": "性格关键词，逗号分隔",
  "guardrail_allow": ["允许自主执行的操作"],
  "guardrail_deny": ["禁止或须请示的操作"],
  "enabled_tools": ["工具 ID 数组"],
  "enabled_skills": ["技能 slug 数组"],
  "soul": "SOUL.md 内容",
  "identity": "IDENTITY.md 内容",
  "agents": "AGENTS.md 内容",
  "user": "USER.md 内容",
  "memory": "MEMORY.md 内容",
  "heartbeat": "HEARTBEAT.md 内容",
  "tools": "TOOLS.md 内容"
}

可选工具 ID：web_search, web_reader, feishu_message, code_interpreter, file_reader, image_gen, image_analysis, http_request, asr, tts

严格以 JSON 数组格式返回，每个元素是一个完整的智能体配置。不要有任何其他内容。`

router.post('/ai_generate_agents', async (req, res) => {
  const { prompts, prompt } = req.body
  log.info(`ai_generate_agents: received prompts=${Array.isArray(prompts) ? prompts.length : prompt?.slice(0, 60)}`)

  // 支持两种输入格式
  let promptList = []
  if (Array.isArray(prompts)) {
    promptList = prompts.filter(p => p?.trim())
  } else if (typeof prompt === 'string' && prompt.trim()) {
    // 按行分割，每行一个角色描述
    promptList = prompt.split('\n').map(p => p.trim()).filter(p => p)
  }

  if (promptList.length === 0) {
    return res.status(400).json({ error: 'prompts array or prompt string is required' })
  }

  const row = dao.getProviderByName('bailian')
  if (!row?.api_key) return res.status(400).json({ error: 'BAILIAN 未配置 API Key' })
  if (!row?.base_url) return res.status(400).json({ error: 'BAILIAN 未配置 Base URL' })

  const apiKey = decrypt(row.api_key)
  const baseUrl = row.base_url.replace(/\/$/, '')
  const isAnthropicUrl = baseUrl.includes('anthropic')
  const MODEL = 'qwen3.5-plus'

  const userPrompt = `生成一个包含 ${promptList.length} 个智能体的团队配置。\n\n角色描述：\n${promptList.map((p, i) => `${i + 1}. ${p}`).join('\n')}\n\n请为每个角色生成完整的智能体配置，返回 JSON 数组格式。`

  const endpoint = isAnthropicUrl ? `${baseUrl}/v1/messages` : `${baseUrl}/chat/completions`
  const format = isAnthropicUrl ? 'anthropic' : 'openai'
  log.info(`ai_generate_agents: → ${format} POST ${endpoint} model=${MODEL} count=${promptList.length}`)

  let rawText
  try {
    if (isAnthropicUrl) {
      const r = await fetch(endpoint, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-api-key': apiKey,
          'anthropic-version': '2023-06-01',
          'User-Agent': 'anthropic-sdk-node/0.32.1 node/v24.6.0 darwin arm64',
        },
        body: JSON.stringify({
          model: MODEL,
          system: SYSTEM_PROMPT_MULTI,
          messages: [{ role: 'user', content: userPrompt }],
          max_tokens: 4096,
          thinking: { type: 'disabled' },
        }),
        signal: AbortSignal.timeout(180000),
      })
      log.info(`ai_generate_agents: ← HTTP ${r.status}`)
      if (!r.ok) {
        const t = await r.text()
        log.error(`ai_generate_agents: anthropic error: ${t.slice(0, 200)}`)
        return res.status(502).json({ error: `Anthropic API 错误 ${r.status}` })
      }
      const data = await r.json()
      rawText = data.content?.[0]?.text ?? ''
    } else {
      const r = await fetch(endpoint, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${apiKey}`,
          'User-Agent': 'anthropic-sdk-node/0.32.1 node/v24.6.0 darwin arm64',
        },
        body: JSON.stringify({
          model: MODEL,
          messages: [
            { role: 'system', content: SYSTEM_PROMPT_MULTI },
            { role: 'user', content: userPrompt },
          ],
          max_tokens: 4096,
          response_format: { type: 'json_object' },
          stream: false,
          enable_thinking: false,
        }),
        signal: AbortSignal.timeout(180000),
      })
      log.info(`ai_generate_agents: ← HTTP ${r.status}`)
      if (!r.ok) {
        const t = await r.text()
        log.error(`ai_generate_agents: openai error: ${t.slice(0, 200)}`)
        return res.status(502).json({ error: `OpenAI API 错误 ${r.status}` })
      }
      const data = await r.json()
      rawText = data.choices?.[0]?.message?.content ?? ''
    }
  } catch (e) {
    log.error(`ai_generate_agents: fetch exception: ${e.message}`)
    return res.status(502).json({ error: `请求失败：${e.message}` })
  }

  log.debug(`ai_generate_agents: raw response (${rawText.length} chars): ${rawText.slice(0, 120)}`)

  let parsedArray
  try {
    const match = rawText.match(/```(?:json)?\s*([\s\S]*?)```/m)
    const jsonStr = match ? match[1] : rawText.trim()
    parsedArray = JSON.parse(jsonStr)
    if (!Array.isArray(parsedArray)) {
      // 尝试从对象中提取数组
      const arr = parsedArray.agents || parsedArray.items || parsedArray.results
      if (Array.isArray(arr)) {
        parsedArray = arr
      } else {
        throw new Error('返回的不是数组格式')
      }
    }
  } catch (e) {
    log.error(`ai_generate_agents: JSON parse failed, raw: ${rawText.slice(0, 300)}`)
    return res.status(502).json({ error: `AI 返回格式错误: ${e.message}` })
  }

  const validToolIds = new Set(['web_search','web_reader','feishu_message','code_interpreter','file_reader','image_gen','image_analysis','http_request','asr','tts'])
  const validSkillSlugs = getValidSkillSlugs()

  const results = parsedArray.map((parsed, idx) => ({
    display_name: parsed.display_name ?? '',
    name: (parsed.name ?? `agent_${idx + 1}`).replace(/[^\w]/g, '_').toLowerCase(),
    job_title: parsed.job_title ?? '',
    description: parsed.description ?? '',
    personality: parsed.personality ?? '',
    guardrail_allow: Array.isArray(parsed.guardrail_allow) ? parsed.guardrail_allow.filter(s => typeof s === 'string') : [],
    guardrail_deny: Array.isArray(parsed.guardrail_deny) ? parsed.guardrail_deny.filter(s => typeof s === 'string') : [],
    enabled_tools: Array.isArray(parsed.enabled_tools) ? parsed.enabled_tools.filter(id => validToolIds.has(id)) : [],
    enabled_skills: Array.isArray(parsed.enabled_skills) ? parsed.enabled_skills.filter(s => validSkillSlugs.has(s)) : [],
    soul: parsed.soul ?? '',
    identity: parsed.identity ?? '',
    agents: parsed.agents ?? '',
    user: parsed.user ?? '',
    memory: parsed.memory ?? '',
    heartbeat: parsed.heartbeat ?? '',
    tools: parsed.tools ?? '',
  }))

  log.info(`ai_generate_agents: OK generated ${results.length} agents`)
  res.json(results)
})

// ── chat_with_agent ──────────────────────────────────────
// POST /api/chat_with_agent { agent_id, messages: [{role, content}] }
router.post('/chat_with_agent', async (req, res) => {
  const { agent_id, messages, soul_override } = req.body
  if (!soul_override && !agent_id) return res.status(400).json({ error: 'agent_id is required' })
  if (!Array.isArray(messages) || messages.length === 0) return res.status(400).json({ error: 'messages is required' })

  let systemPrompt
  if (soul_override?.trim()) {
    // Use provided SOUL content directly (unsaved editing state)
    systemPrompt = `/no_think\n\n${soul_override}`
  } else {
    // Load agent SOUL.md from DB
    const docRow = db.prepare(
      "SELECT content FROM agent_documents WHERE agent_id = ? AND document_type = 'SOUL'"
    ).get(agent_id)
    const agentRow = db.prepare('SELECT display_name, job_title FROM agents WHERE id = ?').get(agent_id)
    systemPrompt = `/no_think 你是一个 OpenClaw Agent。`
    if (agentRow) systemPrompt += ` 你的名字是 ${agentRow.display_name}`
    if (agentRow?.job_title) systemPrompt += `，职位是 ${agentRow.job_title}`
    systemPrompt += '。'
    if (docRow?.content?.trim()) systemPrompt = `/no_think\n\n${docRow.content}`
  }

  // Get configured provider
  const row = dao.getEnabledProviderByName('bailian')
  if (!row?.api_key) return res.status(400).json({ error: 'BAILIAN 未配置 API Key，请先在模型管理页完成配置' })

  const MODEL = 'qwen3.5-plus'
  // Derive the OpenAI-compatible endpoint using the same logic as model.js
  const endpoint = row.is_coding_plan
    ? 'https://coding.dashscope.aliyuncs.com/v1/chat/completions'
    : `${(row.base_url || 'https://coding.dashscope.aliyuncs.com/v1').replace(/\/$/, '')}/chat/completions`

  log.info(`chat_with_agent: agent=${agent_id} model=${MODEL} msgs=${messages.length}`)

  try {
    const r = await fetch(endpoint, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${decrypt(row.api_key)}`,
      },
      body: JSON.stringify({
        model: MODEL,
        messages: [
          { role: 'system', content: systemPrompt },
          ...messages.map(m => ({ role: m.role, content: m.content })),
        ],
        max_tokens: 2048,
        stream: false,
        enable_thinking: false,
      }),
      signal: AbortSignal.timeout(60000),
    })
    if (!r.ok) {
      const t = await r.text()
      return res.status(502).json({ error: `API 错误 ${r.status}: ${t.slice(0, 200)}` })
    }
    const data = await r.json()
    const reply = data.choices?.[0]?.message?.content ?? ''
    res.json({ reply })
  } catch (e) {
    res.status(502).json({ error: `请求失败：${e.message}` })
  }
})

  return router
}

// Backward compatibility
export default createAiRouter
