import { Router } from 'express'
import { v4 as uuidv4 } from 'uuid'
import { detectProvider, KNOWN_PROVIDERS } from '../known-providers.js'

const now = () => Math.floor(Date.now() / 1000)

function rowToProvider(row) {
  if (!row) return null
  return { ...row, is_enabled: row.is_enabled === 1, is_available: row.is_available === 1 }
}

function rowToModel(row) {
  if (!row) return null
  return {
    ...row,
    supports_vision: row.supports_vision === 1,
    supports_function_calling: row.supports_function_calling === 1,
    supports_streaming: row.supports_streaming === 1,
    is_custom: row.is_custom === 1,
  }
}

export function createModelRouter(db) {
  const router = Router()

  // GET /get_providers — 所有 provider 实例
  router.post('/get_providers', (req, res) => {
    try {
      const rows = db.prepare('SELECT * FROM model_providers_v2 ORDER BY created_at').all()
      res.json(rows.map(rowToProvider))
    } catch (err) { res.status(500).send(err.message) }
  })

  // POST /suggest_provider — 根据 baseUrl 推断配置
  router.post('/suggest_provider', (req, res) => {
    const { base_url } = req.body
    const match = detectProvider(base_url)
    if (!match) return res.json(null)
    // 检查 name 是否已被占用，如果是，加数字后缀
    let name = match.suggestName
    let suffix = 2
    while (db.prepare('SELECT id FROM model_providers_v2 WHERE name = ?').get(name)) {
      name = `${match.suggestName}-${suffix++}`
    }
    res.json({ name, api: match.api, models: match.models })
  })

  // POST /create_provider
  router.post('/create_provider', (req, res) => {
    try {
      const { name, api, base_url, api_key } = req.body
      if (!name || !api || !base_url) return res.status(400).send('name, api, base_url required')
      const id = uuidv4()
      const n = now()
      db.prepare(`
        INSERT INTO model_providers_v2 (id, name, api, base_url, api_key, is_enabled, is_available, created_at, updated_at)
        VALUES (?, ?, ?, ?, ?, 1, 0, ?, ?)
      `).run(id, name, api, base_url, api_key ?? '', n, n)
      const row = db.prepare('SELECT * FROM model_providers_v2 WHERE id = ?').get(id)
      res.json(rowToProvider(row))
    } catch (err) {
      if (err.message.includes('UNIQUE')) return res.status(409).send(`Provider name "${req.body.name}" already exists`)
      res.status(500).send(err.message)
    }
  })

  // POST /update_provider
  router.post('/update_provider', (req, res) => {
    try {
      const { id, name, api, base_url, api_key, is_enabled } = req.body
      if (!id) return res.status(400).send('id required')
      db.prepare(`
        UPDATE model_providers_v2
        SET name=?, api=?, base_url=?, api_key=?, is_enabled=?, updated_at=?
        WHERE id=?
      `).run(name, api, base_url, api_key ?? '', is_enabled ? 1 : 0, now(), id)
      const row = db.prepare('SELECT * FROM model_providers_v2 WHERE id = ?').get(id)
      if (!row) return res.status(404).send('Not found')
      res.json(rowToProvider(row))
    } catch (err) {
      if (err.message.includes('UNIQUE')) return res.status(409).send(`Provider name "${req.body.name}" already exists`)
      res.status(500).send(err.message)
    }
  })

  // POST /delete_provider
  router.post('/delete_provider', (req, res) => {
    try {
      const { id } = req.body
      if (!id) return res.status(400).send('id required')
      db.prepare('DELETE FROM model_providers_v2 WHERE id = ?').run(id)
      res.json(null)
    } catch (err) { res.status(500).send(err.message) }
  })

  // POST /get_models — 获取某 provider 的所有模型
  router.post('/get_models', (req, res) => {
    try {
      const { provider_name } = req.body
      const rows = provider_name
        ? db.prepare('SELECT * FROM model_info_v2 WHERE provider_name = ? ORDER BY sort_order, model_id').all(provider_name)
        : db.prepare('SELECT * FROM model_info_v2 ORDER BY provider_name, sort_order, model_id').all()
      res.json(rows.map(rowToModel))
    } catch (err) { res.status(500).send(err.message) }
  })

  // POST /set_models — 批量设置某 provider 的模型列表（覆盖写）
  router.post('/set_models', (req, res) => {
    try {
      const { provider_name, models } = req.body
      if (!provider_name || !Array.isArray(models)) return res.status(400).send('provider_name and models[] required')
      const n = now()
      const upsert = db.prepare(`
        INSERT INTO model_info_v2
          (id, provider_name, model_id, display_name, context_window, max_tokens, input_types,
           cost_input, cost_output, supports_vision, supports_function_calling, supports_streaming,
           is_custom, sort_order, updated_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        ON CONFLICT(provider_name, model_id) DO UPDATE SET
          display_name=excluded.display_name,
          context_window=excluded.context_window,
          max_tokens=excluded.max_tokens,
          input_types=excluded.input_types,
          cost_input=excluded.cost_input,
          cost_output=excluded.cost_output,
          supports_vision=excluded.supports_vision,
          is_custom=excluded.is_custom,
          sort_order=excluded.sort_order,
          updated_at=excluded.updated_at
      `)
      // 删除不在新列表里的模型（仅限当前 provider）
      const keepIds = models.map(m => m.model_id)
      if (keepIds.length > 0) {
        const placeholders = keepIds.map(() => '?').join(',')
        db.prepare(`DELETE FROM model_info_v2 WHERE provider_name = ? AND model_id NOT IN (${placeholders})`).run(provider_name, ...keepIds)
      } else {
        db.prepare('DELETE FROM model_info_v2 WHERE provider_name = ?').run(provider_name)
      }
      models.forEach((m, idx) => {
        upsert.run(
          uuidv4(), provider_name, m.model_id, m.display_name ?? m.model_id,
          m.context_window ?? 0, m.max_tokens ?? 0, m.input_types ?? '["text"]',
          m.cost_input ?? 0, m.cost_output ?? 0,
          m.supports_vision ? 1 : 0, m.supports_function_calling ? 1 : 0, 1,
          m.is_custom ? 1 : 0, idx, n
        )
      })
      const rows = db.prepare('SELECT * FROM model_info_v2 WHERE provider_name = ? ORDER BY sort_order, model_id').all(provider_name)
      res.json(rows.map(rowToModel))
    } catch (err) { res.status(500).send(err.message) }
  })

  // POST /test_provider — 测试 API Key 连通性
  router.post('/test_provider', async (req, res) => {
    const { base_url, api_key, api } = req.body
    if (!base_url || !api) return res.status(400).send('base_url and api required')
    const start = Date.now()
    try {
      let url, headers = {}
      if (api === 'anthropic-messages') {
        url = base_url.replace(/\/$/, '') + '/models'
        headers = { 'x-api-key': api_key ?? '', 'anthropic-version': '2023-06-01' }
      } else if (api === 'gemini') {
        // Gemini uses query param key; base_url is typically the base API root
        const base = base_url.replace(/\/$/, '')
        url = `${base}/models?key=${encodeURIComponent(api_key ?? '')}`
      } else {
        // openai-completions compatible
        url = base_url.replace(/\/$/, '') + '/models'
        headers = { 'Authorization': `Bearer ${api_key ?? ''}` }
      }
      const controller = new AbortController()
      const timer = setTimeout(() => controller.abort(), 10000)
      const r = await fetch(url, { headers, signal: controller.signal })
      clearTimeout(timer)
      const latency_ms = Date.now() - start
      if (r.ok) {
        res.json({ ok: true, latency_ms })
      } else {
        const body = await r.text().catch(() => '')
        res.json({ ok: false, latency_ms, error: `HTTP ${r.status}: ${body.slice(0, 200)}` })
      }
    } catch (err) {
      res.json({ ok: false, latency_ms: Date.now() - start, error: err.message })
    }
  })

  // POST /get_known_providers — 返回注册表（不含 api_key）
  router.post('/get_known_providers', (req, res) => {
    res.json(KNOWN_PROVIDERS.map(p => ({ suggestName: p.suggestName, api: p.api, matchUrls: p.matchUrls, models: p.models })))
  })

  return router
}

export default createModelRouter
