import { Router } from 'express'
import { createLogger } from '../logger.js'
import { decrypt } from '../utils/crypto.js'

const SYSTEM_PROMPT = `/no_think 你是一个 OpenClaw Agent 人格配置生成器。根据用户的描述，生成完整的 Agent 配置。

可选工具 ID（enabled_tools 从中选择合适的，数组）：
web_search（网页搜索）、web_reader（网页阅读）、feishu_message（发飞书消息）、code_interpreter（代码解释器）、file_reader（文件读取）、image_gen（图像生成）、image_analysis（视觉理解）、http_request（HTTP请求）、asr（语音识别）、tts（语音合成）

可选技能 slug（enabled_skills 从中选择合适的，数组）：
multi-round-memory（多轮记忆）、proactive-speak（主动发言）、scheduled-heartbeat（定时心跳）、mention-response（被@响应）、direct-response（私信响应）、message-routing（消息路由）、context-compression（上下文压缩）、tool-calling（工具调用）、memory-persistence（记忆持久化）、emotional-aware（情绪感知）

严格以 JSON 格式返回，包含以下字段：
{
  "display_name": "显示名称（2-8字，中文）",
  "name": "英文标识（小写字母+下划线，如 ux_designer）",
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
  "memory": "MEMORY.md 内容（Markdown，包含置信度图例 + 关于Boss/项目/经验教训三个空章节）",
  "heartbeat": "HEARTBEAT.md 内容（注释说明 heartbeat 用途，默认为空）",
  "tools": "TOOLS.md 内容（说明用途：记录常用工具和使用心得）"
}

guardrail 规范：每条 3-10 字的短语，允许 3-6 条，禁止 3-5 条，按角色职能定制。
只输出 JSON，不要有任何其他内容。`

export function createAiRouter(db) {
  const log = createLogger('ai')
  const router = Router()

// ai_generate_agent
router.post('/ai_generate_agent', async (req, res) => {
  const { prompt } = req.body
  log.info(`ai_generate_agent: prompt="${(prompt ?? '').slice(0, 60)}${(prompt?.length ?? 0) > 60 ? '...' : ''}"`)

  if (!prompt?.trim()) return res.status(400).json({ error: 'prompt is required' })

  const row = db.prepare("SELECT * FROM model_providers_v2 WHERE name = 'bailian'").get()
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
    return res.status(502).json({ error: `请求失败: ${e.message}` })
  }

  log.debug(`ai_generate_agent: raw response (${rawText.length} chars): ${rawText.slice(0, 120)}`)

  let parsed
  try {
    const match = rawText.match(/```(?:json)?\s*([\s\S]*?)```/)
    const jsonStr = match ? match[1] : rawText.trim()
    parsed = JSON.parse(jsonStr)
  } catch {
    log.error(`ai_generate_agent: JSON parse failed, raw: ${rawText.slice(0, 300)}`)
    return res.status(502).json({ error: `AI 返回格式错误，无法解析 JSON:\n${rawText.slice(0, 300)}` })
  }

  const validToolIds = new Set(['web_search','web_reader','feishu_message','code_interpreter','file_reader','image_gen','image_analysis','http_request','asr','tts'])
  const validSkillSlugs = new Set(['multi-round-memory','proactive-speak','scheduled-heartbeat','mention-response','direct-response','message-routing','context-compression','tool-calling','memory-persistence','emotional-aware'])

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
  const row = db.prepare("SELECT * FROM model_providers_v2 WHERE name = 'bailian' AND is_enabled = 1").get()
  if (!row?.api_key) return res.status(400).json({ error: 'BAILIAN 未配置 API Key，请先在模型管理页完成配置' })

  const MODEL = 'qwen3.5-plus'
  // Derive the OpenAI-compatible endpoint using the same logic as model.js
  const endpoint = row.is_coding_plan
    ? 'https://coding.dashscope.aliyuncs.com/v1/chat/completions'
    : `${(row.base_url || 'https://dashscope.aliyuncs.com/compatible-mode/v1').replace(/\/$/, '')}/chat/completions`

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
    res.status(502).json({ error: `请求失败: ${e.message}` })
  }
})

  return router
}

// Backward compatibility
export default createAiRouter
