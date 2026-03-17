import { Router } from 'express'
import db from '../db.js'

const router = Router()

const SYSTEM_PROMPT = `/no_think 你是一个 AI Agent 配置生成器。根据用户的一句话描述，生成完整的智能体配置。

请严格以 JSON 格式返回，包含以下字段：
{
  "display_name": "智能体显示名称（2-8字，中文）",
  "name": "英文标识（小写字母+下划线，如 ux_designer）",
  "job_title": "职位名称",
  "description": "一句话描述",
  "personality": "人格特征关键词，逗号分隔",
  "soul": "SOUL 文档（Markdown，描述人格、沟通风格与行为边界，200字以内）"
}

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
          max_tokens: 1024,
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
  }
  console.log(`[ai_generate_agent] OK → display_name="${result.display_name}" name="${result.name}"`)
  res.json(result)
})

export default router
