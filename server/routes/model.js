import { Router } from 'express'
import { createLogger } from '../logger.js'

const now = () => Math.floor(Date.now() / 1000)

function getEndpoints(baseUrl, isCodingPlan) {
  if (isCodingPlan) {
    return {
      openai: 'https://coding.dashscope.aliyuncs.com/v1',
      anthropic: 'https://coding.dashscope.aliyuncs.com/apps/anthropic',
    }
  }
  const b = (baseUrl || '').replace(/\/$/, '')
  return {
    openai: b || 'https://dashscope.aliyuncs.com/compatible-mode/v1',
    anthropic: 'https://dashscope.aliyuncs.com/anthropic',
  }
}

function rowToProvider(row) {
  if (!row) return null
  return {
    ...row,
    id: String(row.id),
    is_enabled: row.is_enabled === 1,
    is_available: row.is_available === 1,
    is_coding_plan: row.is_coding_plan === 1,
  }
}

function rowToModel(row) {
  if (!row) return null
  return {
    ...row,
    id: String(row.id),
    supports_vision: row.supports_vision === 1,
    supports_function_calling: row.supports_function_calling === 1,
    supports_streaming: row.supports_streaming === 1,
  }
}

export function createModelRouter(db) {
  const log = createLogger('model')
  const router = Router()

  // get_providers
  router.post('/get_providers', (req, res) => {
    try {
      const rows = db.prepare('SELECT * FROM model_providers ORDER BY id').all()
      res.json(rows.map(rowToProvider))
    } catch (err) {
      res.status(500).send(err.message)
    }
  })

  // get_provider
  router.post('/get_provider', (req, res) => {
    try {
      const { provider_type } = req.body
      const row = db.prepare('SELECT * FROM model_providers WHERE provider_type = ?').get(provider_type)
      if (!row) throw new Error(`Not found: ${provider_type}`)
      res.json(rowToProvider(row))
    } catch (err) {
      res.status(500).send(err.message)
    }
  })

  // update_provider
  router.post('/update_provider', (req, res) => {
    try {
      const { config } = req.body
      db.prepare(`
        INSERT INTO model_providers (provider_type, api_key, base_url, is_coding_plan, is_enabled, is_available, created_at, updated_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?)
        ON CONFLICT(provider_type) DO UPDATE SET
          api_key = excluded.api_key,
          base_url = excluded.base_url,
          is_coding_plan = excluded.is_coding_plan,
          is_enabled = excluded.is_enabled,
          is_available = excluded.is_available,
          updated_at = excluded.updated_at
      `).run(
        config.provider_type,
        config.api_key ?? '',
        config.base_url ?? '',
        config.is_coding_plan ? 1 : 0,
        config.is_enabled ? 1 : 0,
        config.is_available ? 1 : 0,
        now(), now()
      )
      res.json(null)
    } catch (err) {
      res.status(500).send(err.message)
    }
  })

  // get_models
  router.post('/get_models', (req, res) => {
    try {
      const rows = db.prepare('SELECT * FROM model_info ORDER BY provider_type, name').all()
      res.json(rows.map(rowToModel))
    } catch (err) {
      res.status(500).send(err.message)
    }
  })

  // test_provider
  router.post('/test_provider', async (req, res) => {
    const { provider_type } = req.body
    const row = db.prepare('SELECT * FROM model_providers WHERE provider_type = ?').get(provider_type)

    if (provider_type !== 'BAILIAN') {
      const hasKey = !!(row?.api_key)
      const ok = hasKey ? 1 : 0
      db.prepare('UPDATE model_providers SET is_available = ?, last_tested = ? WHERE provider_type = ?')
        .run(ok, now(), provider_type)
      return res.json({ openai_ok: hasKey, anthropic_ok: false })
    }

    const apiKey = row?.api_key ?? ''
    const baseUrl = (row?.base_url ?? '').replace(/\/$/, '')
    const isAnthropicUrl = baseUrl.includes('anthropic')

    console.log(`[test_provider] baseUrl=${baseUrl} format=${isAnthropicUrl ? 'anthropic' : 'openai'}`)

    const TEST_MODEL = 'qwen3.5-plus'
    const TIMEOUT_MS = 15000

    let openai_ok = false, anthropic_ok = false
    let openai_error, anthropic_error

    if (isAnthropicUrl) {
      try {
        const r = await fetch(`${baseUrl}/v1/messages`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'x-api-key': apiKey,
            'anthropic-version': '2023-06-01',
            'User-Agent': 'anthropic-sdk-node/0.32.1',
          },
          body: JSON.stringify({
            model: TEST_MODEL,
            system: '/no_think',
            messages: [{ role: 'user', content: [{ type: 'text', text: 'hi' }] }],
            max_tokens: 5,
            thinking: { type: 'disabled' },
          }),
          signal: AbortSignal.timeout(TIMEOUT_MS),
        })
        if (r.ok) {
          anthropic_ok = true
          console.log('[test_provider] anthropic OK')
        } else {
          const text = await r.text().catch(() => '')
          anthropic_error = `HTTP ${r.status}: ${text.slice(0, 120)}`
          console.log(`[test_provider] anthropic FAIL: ${anthropic_error}`)
        }
      } catch (e) {
        anthropic_error = e.message?.slice(0, 120)
        console.log(`[test_provider] anthropic ERROR: ${anthropic_error}`)
      }
    } else {
      try {
        const r = await fetch(`${baseUrl}/chat/completions`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${apiKey}`,
            'User-Agent': 'anthropic-sdk-node/0.32.1',
          },
          body: JSON.stringify({
            model: TEST_MODEL,
            messages: [
              { role: 'system', content: '/no_think' },
              { role: 'user', content: 'hi' },
            ],
            max_tokens: 5,
            stream: false,
            enable_thinking: false,
          }),
          signal: AbortSignal.timeout(TIMEOUT_MS),
        })
        if (r.ok) {
          openai_ok = true
          console.log('[test_provider] openai OK')
        } else {
          const text = await r.text().catch(() => '')
          openai_error = `HTTP ${r.status}: ${text.slice(0, 120)}`
          console.log(`[test_provider] openai FAIL: ${openai_error}`)
        }
      } catch (e) {
        openai_error = e.message?.slice(0, 120)
        console.log(`[test_provider] openai ERROR: ${openai_error}`)
      }
    }

    const ok = openai_ok || anthropic_ok
    db.prepare('UPDATE model_providers SET is_available = ?, last_tested = ? WHERE provider_type = ?')
      .run(ok ? 1 : 0, now(), provider_type)

    res.json({ openai_ok, anthropic_ok, openai_error, anthropic_error })
  })

  return router
}

// Backward compatibility
export default createModelRouter
