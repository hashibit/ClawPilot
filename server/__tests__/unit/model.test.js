import { describe, it, expect, beforeEach } from 'vitest'
import { createTestDb } from '../helpers/db.js'
import { createTestApp, apiPost } from '../helpers/app.js'

describe('Model Routes (v2)', () => {
  let db, app

  beforeEach(() => {
    db = createTestDb()
    app = createTestApp(db)
  })

  // ── 1. get_providers - 空列表 ────────────────────────────
  describe('get_providers', () => {
    it('returns empty array when no providers exist', async () => {
      const res = await apiPost(app, 'get_providers', {})
      expect(res.status).toBe(200)
      expect(Array.isArray(res.body)).toBe(true)
      expect(res.body.length).toBe(0)
    })
  })

  // ── 2. create_provider - 正常创建 ───────────────────────
  describe('create_provider', () => {
    it('creates a provider and returns it', async () => {
      const res = await apiPost(app, 'create_provider', {
        name: 'bailian',
        api: 'openai-completions',
        base_url: 'https://dashscope.aliyuncs.com/compatible-mode/v1',
        api_key: 'sk-test-123',
      })
      expect(res.status).toBe(200)
      expect(res.body.name).toBe('bailian')
      expect(res.body.api).toBe('openai-completions')
      expect(res.body.base_url).toBe('https://dashscope.aliyuncs.com/compatible-mode/v1')
      expect(res.body.api_key).toBe('sk-test-123')
      expect(res.body.is_enabled).toBe(true)
      expect(res.body.is_available).toBe(false)
      expect(typeof res.body.id).toBe('string')
      expect(typeof res.body.created_at).toBe('number')
    })

    // ── 3. create_provider - name 重复返回 409 ────────────
    it('returns 409 when name already exists', async () => {
      await apiPost(app, 'create_provider', {
        name: 'bailian',
        api: 'openai-completions',
        base_url: 'https://example.com',
      })
      const res = await apiPost(app, 'create_provider', {
        name: 'bailian',
        api: 'openai-completions',
        base_url: 'https://example2.com',
      })
      expect(res.status).toBe(409)
    })

    // ── 4. create_provider - 缺少必填字段返回 400 ─────────
    it('returns 400 when required fields are missing', async () => {
      const res = await apiPost(app, 'create_provider', {
        name: 'test',
        // missing api and base_url
      })
      expect(res.status).toBe(400)
    })

    it('returns 400 when name is missing', async () => {
      const res = await apiPost(app, 'create_provider', {
        api: 'openai-completions',
        base_url: 'https://example.com',
      })
      expect(res.status).toBe(400)
    })
  })

  // ── 5. update_provider - 正常更新 ───────────────────────
  describe('update_provider', () => {
    it('updates an existing provider', async () => {
      const created = await apiPost(app, 'create_provider', {
        name: 'openai',
        api: 'openai-completions',
        base_url: 'https://api.openai.com',
        api_key: 'sk-old',
      })
      const id = created.body.id

      const res = await apiPost(app, 'update_provider', {
        id,
        name: 'openai',
        api: 'openai-completions',
        base_url: 'https://api.openai.com',
        api_key: 'sk-new-key',
        is_enabled: true,
      })
      expect(res.status).toBe(200)
      expect(res.body.api_key).toBe('sk-new-key')
    })

    // ── 6. update_provider - 不存在的 id 返回 404 ─────────
    it('returns 404 when id does not exist', async () => {
      const res = await apiPost(app, 'update_provider', {
        id: 'nonexistent-id-00000',
        name: 'x',
        api: 'openai-completions',
        base_url: 'https://example.com',
        api_key: '',
        is_enabled: true,
      })
      expect(res.status).toBe(404)
    })
  })

  // ── 7. delete_provider - 级联删除 model_info_v2 ─────────
  describe('delete_provider', () => {
    it('deletes provider and cascades to models', async () => {
      const created = await apiPost(app, 'create_provider', {
        name: 'anthropic',
        api: 'anthropic-messages',
        base_url: 'https://api.anthropic.com',
        api_key: 'sk-ant-test',
      })
      const { id, name } = created.body

      // Add some models
      await apiPost(app, 'set_models', {
        provider_name: name,
        models: [
          { model_id: 'claude-sonnet-4-6', display_name: 'Claude Sonnet 4.6', context_window: 200000, max_tokens: 64000, input_types: '["text","image"]', supports_vision: 1 },
        ],
      })

      // Verify models exist
      const beforeModels = await apiPost(app, 'get_models', { provider_name: name })
      expect(beforeModels.body.length).toBe(1)

      // Delete provider
      const delRes = await apiPost(app, 'delete_provider', { id })
      expect(delRes.status).toBe(200)

      // Models should be gone (cascade)
      const afterModels = await apiPost(app, 'get_models', { provider_name: name })
      expect(afterModels.body.length).toBe(0)

      // Provider should not appear in list
      const providers = await apiPost(app, 'get_providers', {})
      expect(providers.body.find(p => p.id === id)).toBeUndefined()
    })
  })

  // ── 8-11. suggest_provider ──────────────────────────────
  describe('suggest_provider', () => {
    it('returns bailian suggestion for dashscope URL', async () => {
      const res = await apiPost(app, 'suggest_provider', {
        base_url: 'https://dashscope.aliyuncs.com/compatible-mode/v1',
      })
      expect(res.status).toBe(200)
      expect(res.body).not.toBeNull()
      expect(res.body.name).toBe('bailian')
      expect(res.body.api).toBe('openai-completions')
      expect(Array.isArray(res.body.models)).toBe(true)
      expect(res.body.models.length).toBeGreaterThan(0)
    })

    it('returns anthropic suggestion for api.anthropic.com', async () => {
      const res = await apiPost(app, 'suggest_provider', {
        base_url: 'https://api.anthropic.com',
      })
      expect(res.status).toBe(200)
      expect(res.body).not.toBeNull()
      expect(res.body.name).toBe('anthropic')
      expect(res.body.api).toBe('anthropic-messages')
    })

    it('returns null for unknown URL', async () => {
      const res = await apiPost(app, 'suggest_provider', {
        base_url: 'https://unknown-provider.example.com/v1',
      })
      expect(res.status).toBe(200)
      expect(res.body).toBeNull()
    })

    it('returns bailian-2 when bailian name is already taken', async () => {
      // Create a provider with name 'bailian' first
      await apiPost(app, 'create_provider', {
        name: 'bailian',
        api: 'openai-completions',
        base_url: 'https://dashscope.aliyuncs.com/compatible-mode/v1',
      })

      const res = await apiPost(app, 'suggest_provider', {
        base_url: 'https://coding.dashscope.aliyuncs.com/v1',
      })
      expect(res.status).toBe(200)
      expect(res.body.name).toBe('bailian-2')
    })
  })

  // ── 12-13. set_models ───────────────────────────────────
  describe('set_models', () => {
    let providerName

    beforeEach(async () => {
      const res = await apiPost(app, 'create_provider', {
        name: 'gemini',
        api: 'gemini',
        base_url: 'https://generativelanguage.googleapis.com',
        api_key: 'AIza-test',
      })
      providerName = res.body.name
    })

    it('writes models and returns them', async () => {
      const models = [
        { model_id: 'gemini-2.5-pro', display_name: 'Gemini 2.5 Pro', context_window: 1048576, max_tokens: 65536, input_types: '["text","image"]', supports_vision: 1 },
        { model_id: 'gemini-2.5-flash', display_name: 'Gemini 2.5 Flash', context_window: 1048576, max_tokens: 65536, input_types: '["text","image"]', supports_vision: 1 },
      ]
      const res = await apiPost(app, 'set_models', { provider_name: providerName, models })
      expect(res.status).toBe(200)
      expect(res.body.length).toBe(2)
      // ordered by sort_order (insertion order), so first inserted is first
      expect(res.body[0].model_id).toBe('gemini-2.5-pro')
      expect(res.body[0].supports_vision).toBe(true)
      expect(res.body[1].model_id).toBe('gemini-2.5-flash')
    })

    it('overwrites old models not in new list', async () => {
      // Write 2 models
      await apiPost(app, 'set_models', {
        provider_name: providerName,
        models: [
          { model_id: 'gemini-2.5-pro', display_name: 'Pro', context_window: 1000000, max_tokens: 65536, input_types: '["text"]', supports_vision: 0 },
          { model_id: 'gemini-2.0-flash', display_name: 'Flash', context_window: 1000000, max_tokens: 8192, input_types: '["text"]', supports_vision: 0 },
        ],
      })

      // Overwrite with only 1 model
      const res = await apiPost(app, 'set_models', {
        provider_name: providerName,
        models: [
          { model_id: 'gemini-2.5-pro', display_name: 'Pro Updated', context_window: 1000000, max_tokens: 65536, input_types: '["text","image"]', supports_vision: 1 },
        ],
      })
      expect(res.status).toBe(200)
      expect(res.body.length).toBe(1)
      expect(res.body[0].model_id).toBe('gemini-2.5-pro')
      expect(res.body[0].display_name).toBe('Pro Updated')
    })
  })

  // ── 14-15. get_models ───────────────────────────────────
  describe('get_models', () => {
    beforeEach(async () => {
      // Create two providers with models
      await apiPost(app, 'create_provider', {
        name: 'openai',
        api: 'openai-completions',
        base_url: 'https://api.openai.com',
        api_key: 'sk-oai',
      })
      await apiPost(app, 'create_provider', {
        name: 'anthropic',
        api: 'anthropic-messages',
        base_url: 'https://api.anthropic.com',
        api_key: 'sk-ant',
      })
      await apiPost(app, 'set_models', {
        provider_name: 'openai',
        models: [{ model_id: 'gpt-4o', display_name: 'GPT-4o', context_window: 128000, max_tokens: 16384, input_types: '["text","image"]', supports_vision: 1 }],
      })
      await apiPost(app, 'set_models', {
        provider_name: 'anthropic',
        models: [{ model_id: 'claude-sonnet-4-6', display_name: 'Claude Sonnet', context_window: 200000, max_tokens: 64000, input_types: '["text","image"]', supports_vision: 1 }],
      })
    })

    it('filters models by provider_name', async () => {
      const res = await apiPost(app, 'get_models', { provider_name: 'openai' })
      expect(res.status).toBe(200)
      expect(res.body.length).toBe(1)
      expect(res.body[0].model_id).toBe('gpt-4o')
      expect(res.body[0].provider_name).toBe('openai')
    })

    it('returns all models when provider_name is not specified', async () => {
      const res = await apiPost(app, 'get_models', {})
      expect(res.status).toBe(200)
      expect(res.body.length).toBe(2)
      const modelIds = res.body.map(m => m.model_id)
      expect(modelIds).toContain('gpt-4o')
      expect(modelIds).toContain('claude-sonnet-4-6')
    })
  })

  // ── 16. get_known_providers ─────────────────────────────
  describe('get_known_providers', () => {
    it('returns the known provider registry with 7 providers', async () => {
      const res = await apiPost(app, 'get_known_providers', {})
      expect(res.status).toBe(200)
      expect(Array.isArray(res.body)).toBe(true)
      expect(res.body.length).toBe(7)

      const names = res.body.map(p => p.suggestName)
      expect(names).toContain('bailian')
      expect(names).toContain('volcengine')
      expect(names).toContain('zai')
      expect(names).toContain('minimax')
      expect(names).toContain('openai')
      expect(names).toContain('anthropic')
      expect(names).toContain('gemini')

      // Each entry has required fields
      for (const p of res.body) {
        expect(typeof p.suggestName).toBe('string')
        expect(typeof p.api).toBe('string')
        expect(Array.isArray(p.matchUrls)).toBe(true)
        expect(Array.isArray(p.models)).toBe(true)
      }
    })
  })
})
