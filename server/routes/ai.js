import { Router } from 'express'
import db from '../db.js'

const router = Router()

const SYSTEM_PROMPT = `/no_think 你是一个 OpenClaw Agent 人格配置生成器。根据用户的描述，生成完整的 Agent 配置，包含 7 个人格文档。

严格以 JSON 格式返回，包含以下字段：
{
  "display_name": "显示名称（2-8字，中文）",
  "name": "英文标识（小写字母+下划线，如 ux_designer）",
  "job_title": "职位名称",
  "description": "一句话描述",
  "personality": "性格关键词，逗号分隔，如：细腻、严谨、主动",
  "soul": "SOUL.md 完整内容（Markdown，包含：身份定位 + 核心职责列表 + Boss/定位/emoji + 记忆管理规则 + 权限护栏，按角色特点详细撰写）",
  "identity": "IDENTITY.md 内容（列出 Name/Title/Persona/Role/Emoji/Boss 字段）",
  "agents": "AGENTS.md 内容（Markdown，包含成员编制表占位 + Every Session 阅读清单 + Memory 规则 + Safety 原则）",
  "user": "USER.md 内容（简短：Boss 是唯一汇报对象，可加一句 Boss 偏好）",
  "memory": "MEMORY.md 内容（Markdown，包含置信度图例 + 关于Boss/项目/经验教训三个空章节）",
  "heartbeat": "HEARTBEAT.md 内容（注释说明 heartbeat 用途，默认为空）",
  "tools": "TOOLS.md 内容（说明用途：记录常用工具和使用心得）"
}

SOUL.md 重要规范：
- 权限护栏内允许：查询搜索读取、写日记/记忆、生成报告草稿、发飞书消息、加角色专属自主范围
- 权限护栏外须请示：删除数据文件、不可逆操作、对外正式文件、加角色专属限制
- 按角色类型适配护栏内容（财务类：生成报告允许，转账禁止；合规类：查阅法规允许，发正式意见禁止等）

只输出 JSON，不要有任何其他内容。`

// ai_generate_agent
router.post('/ai_generate_agent', async (req, res) => {
  const { prompt } = req.body
  console.log(`[ai_generate_agent] prompt="${(prompt ?? '').slice(0, 60)}${(prompt?.length ?? 0) > 60 ? '...' : ''}"`)

  if (!prompt?.trim()) return res.status(400).send('prompt is required')

  const row = db.prepare("SELECT * FROM model_providers WHERE provider_type = 'BAILIAN'").get()
  if (!row?.api_key) return res.status(400).send('BAILIAN 未配置 API Key，请先在模型管理页完成配置并测试连接')
  if (!row?.base_url) return res.status(400).send('BAILIAN 未配置 Base URL，请先在模型管理页完成配置并测试连接')

  const apiKey = row.api_key
  const baseUrl = row.base_url.replace(/\/$/, '')
  const isAnthropicUrl = baseUrl.includes('anthropic')
  const MODEL = 'qwen3.5-plus'

  const endpoint = isAnthropicUrl ? `${baseUrl}/v1/messages` : `${baseUrl}/chat/completions`
  const format = isAnthropicUrl ? 'anthropic' : 'openai'
  console.log(`[ai_generate_agent] → ${format} POST ${endpoint} model=${MODEL}`)

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
      console.log(`[ai_generate_agent] ← HTTP ${r.status}`)
      if (!r.ok) {
        const t = await r.text()
        console.log(`[ai_generate_agent] error body: ${t.slice(0, 200)}`)
        return res.status(502).send(`Anthropic API 错误 ${r.status}: ${t.slice(0, 200)}`)
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
      console.log(`[ai_generate_agent] ← HTTP ${r.status}`)
      if (!r.ok) {
        const t = await r.text()
        console.log(`[ai_generate_agent] error body: ${t.slice(0, 200)}`)
        return res.status(502).send(`OpenAI API 错误 ${r.status}: ${t.slice(0, 200)}`)
      }
      const data = await r.json()
      rawText = data.choices?.[0]?.message?.content ?? ''
    }
  } catch (e) {
    console.log(`[ai_generate_agent] fetch exception: ${e.message}`)
    return res.status(502).send(`请求失败: ${e.message}`)
  }

  console.log(`[ai_generate_agent] raw response (${rawText.length} chars): ${rawText.slice(0, 120)}`)

  let parsed
  try {
    const match = rawText.match(/```(?:json)?\s*([\s\S]*?)```/)
    const jsonStr = match ? match[1] : rawText.trim()
    parsed = JSON.parse(jsonStr)
  } catch {
    console.log(`[ai_generate_agent] JSON parse failed, raw: ${rawText.slice(0, 300)}`)
    return res.status(502).send(`AI 返回格式错误，无法解析 JSON:\n${rawText.slice(0, 300)}`)
  }

  const result = {
    display_name: parsed.display_name ?? '',
    name: (parsed.name ?? '').replace(/[^\w]/g, '_').toLowerCase(),
    job_title: parsed.job_title ?? '',
    description: parsed.description ?? '',
    personality: parsed.personality ?? '',
    soul: parsed.soul ?? '',
    identity: parsed.identity ?? '',
    agents: parsed.agents ?? '',
    user: parsed.user ?? '',
    memory: parsed.memory ?? '',
    heartbeat: parsed.heartbeat ?? '',
    tools: parsed.tools ?? '',
  }
  console.log(`[ai_generate_agent] OK → display_name="${result.display_name}" name="${result.name}"`)
  res.json(result)
})

// ── chat_with_agent ──────────────────────────────────────
// POST /api/chat_with_agent { agent_id, messages: [{role, content}] }
router.post('/chat_with_agent', async (req, res) => {
  const { agent_id, messages } = req.body
  if (!agent_id) return res.status(400).send('agent_id is required')
  if (!Array.isArray(messages) || messages.length === 0) return res.status(400).send('messages is required')

  // Load agent SOUL.md as system prompt
  const docRow = db.prepare(
    "SELECT content FROM agent_documents WHERE agent_id = ? AND document_type = 'SOUL'"
  ).get(agent_id)
  const agentRow = db.prepare('SELECT display_name, job_title FROM agents WHERE id = ?').get(agent_id)

  let systemPrompt = `/no_think 你是一个 OpenClaw Agent。`
  if (agentRow) systemPrompt += ` 你的名字是 ${agentRow.display_name}`
  if (agentRow?.job_title) systemPrompt += `，职位是 ${agentRow.job_title}`
  systemPrompt += '。'
  if (docRow?.content?.trim()) systemPrompt = `/no_think\n\n${docRow.content}`

  // Get configured provider
  const row = db.prepare("SELECT * FROM model_providers WHERE provider_type = 'BAILIAN' AND is_enabled = 1").get()
  if (!row?.api_key) return res.status(400).send('BAILIAN 未配置 API Key，请先在模型管理页完成配置')

  const MODEL = 'qwen3.5-plus'
  // Derive the OpenAI-compatible endpoint using the same logic as model.js
  const endpoint = row.is_coding_plan
    ? 'https://coding.dashscope.aliyuncs.com/v1/chat/completions'
    : `${(row.base_url || 'https://dashscope.aliyuncs.com/compatible-mode/v1').replace(/\/$/, '')}/chat/completions`

  console.log(`[chat_with_agent] agent=${agent_id} model=${MODEL} msgs=${messages.length}`)

  try {
    const r = await fetch(endpoint, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${row.api_key}`,
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
      return res.status(502).send(`API 错误 ${r.status}: ${t.slice(0, 200)}`)
    }
    const data = await r.json()
    const reply = data.choices?.[0]?.message?.content ?? ''
    res.json({ reply })
  } catch (e) {
    res.status(502).send(`请求失败: ${e.message}`)
  }
})

export default router
