import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import express from 'express'
import request from 'supertest'
import { createAiRouter } from '../../routes/ai.js'
import { createDao } from '../../dao.js'
import { encrypt } from '../../utils/crypto.js'
import Database from 'better-sqlite3'

// Mock fetch globally
global.fetch = vi.fn()

describe('AI Routes', () => {
  let app, db

  beforeEach(() => {
    db = new Database(':memory:')

    // Create required tables
    db.exec(`
      CREATE TABLE model_providers_v2 (
        id TEXT PRIMARY KEY,
        name TEXT UNIQUE NOT NULL,
        api TEXT,
        base_url TEXT,
        api_key TEXT,
        is_enabled INTEGER DEFAULT 1,
        is_coding_plan INTEGER DEFAULT 0
      );

      CREATE TABLE agents (
        id TEXT PRIMARY KEY,
        opc_id TEXT,
        display_name TEXT,
        job_title TEXT
      );

      CREATE TABLE agent_documents (
        id TEXT PRIMARY KEY,
        agent_id TEXT,
        document_type TEXT,
        content TEXT
      );
    `)

    // Insert default bailian provider with properly encrypted key
    const encryptedKey = encrypt('test-api-key')
    db.exec(`
      INSERT INTO model_providers_v2 (id, name, api, base_url, api_key, is_enabled)
      VALUES ('test-bailian', 'bailian', 'openai', 'https://dashscope.aliyuncs.com/compatible-mode/v1', '${encryptedKey}', 1)
    `)

    app = express()
    app.use(express.json())
    const dao = createDao(db)
    app.use('/api', createAiRouter(db, dao))

    vi.clearAllMocks()
  })

  afterEach(() => {
    db.close()
    vi.resetAllMocks()
  })

  describe('POST /api/ai_generate_agent', () => {
    it('应拒绝空 prompt', async () => {
      const res = await request(app)
        .post('/api/ai_generate_agent')
        .send({ prompt: '' })

      expect(res.status).toBe(400)
      expect(res.body.error).toContain('prompt is required')
    })

    it('应拒绝没有 prompt 的请求', async () => {
      const res = await request(app)
        .post('/api/ai_generate_agent')
        .send({})

      expect(res.status).toBe(400)
      expect(res.body.error).toContain('prompt is required')
    })

    it('应在缺少 API Key 时返回错误', async () => {
      // Remove the provider
      db.exec("DELETE FROM model_providers_v2 WHERE name = 'bailian'")

      const res = await request(app)
        .post('/api/ai_generate_agent')
        .send({ prompt: '创建一个产品经理 Agent' })

      expect(res.status).toBe(400)
      expect(res.body.error).toContain('BAILIAN 未配置 API Key')
    })

    it('应成功生成 Agent 配置（OpenAI 格式）', async () => {
      const mockResponse = {
        choices: [{
          message: {
            content: JSON.stringify({
              display_name: '产品经理',
              name: 'product_manager',
              job_title: '产品经理',
              description: '负责产品规划和需求分析',
              personality: '细心、严谨、有远见',
              guardrail_allow: ['撰写需求文档', '收集用户反馈'],
              guardrail_deny: ['修改代码', '发布功能'],
              enabled_tools: ['web_search', 'file_reader'],
              enabled_skills: ['multi-round-memory', 'proactive-speak'],
              soul: '# SOUL\n## 身份定位\n产品经理',
              identity: 'Name: 产品经理\nTitle: PM',
              agents: '# AGENTS\n## 编制表',
              user: '# USER\nBoss 是唯一汇报对象',
              memory: '# MEMORY\n## 关于Boss',
              heartbeat: '# HEARTBEAT',
              tools: '# TOOLS'
            })
          }
        }]
      }

      global.fetch.mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: async () => mockResponse
      })

      const res = await request(app)
        .post('/api/ai_generate_agent')
        .send({ prompt: '创建一个产品经理 Agent' })

      expect(res.status).toBe(200)
      expect(res.body.display_name).toBe('产品经理')
      expect(res.body.name).toBe('product_manager')
      expect(res.body.enabled_tools).toContain('web_search')
      expect(res.body.enabled_skills).toContain('multi-round-memory')
    })

    it('应过滤无效的工具和技能 ID', async () => {
      const mockResponse = {
        choices: [{
          message: {
            content: JSON.stringify({
              display_name: '测试',
              name: 'test',
              enabled_tools: ['web_search', 'invalid_tool', 'another_invalid'],
              enabled_skills: ['multi-round-memory', 'invalid_skill']
            })
          }
        }]
      }

      global.fetch.mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: async () => mockResponse
      })

      const res = await request(app)
        .post('/api/ai_generate_agent')
        .send({ prompt: '创建 Agent' })

      expect(res.status).toBe(200)
      expect(res.body.enabled_tools).toEqual(['web_search'])
      expect(res.body.enabled_skills).toEqual(['multi-round-memory'])
    })

    it('应处理 AI 返回的代码块格式', async () => {
      const mockResponse = {
        choices: [{
          message: {
            content: '```json\n{"display_name":"测试","name":"test"}\n```'
          }
        }]
      }

      global.fetch.mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: async () => mockResponse
      })

      const res = await request(app)
        .post('/api/ai_generate_agent')
        .send({ prompt: '创建 Agent' })

      expect(res.status).toBe(200)
      expect(res.body.display_name).toBe('测试')
    })

    it('应处理 API 错误', async () => {
      global.fetch.mockResolvedValueOnce({
        ok: false,
        status: 500,
        text: async () => 'Internal Server Error'
      })

      const res = await request(app)
        .post('/api/ai_generate_agent')
        .send({ prompt: '创建 Agent' })

      expect(res.status).toBe(502)
      expect(res.body.error).toContain('API 错误')
    })

    it('应处理网络错误', async () => {
      global.fetch.mockRejectedValueOnce(new Error('Network error'))

      const res = await request(app)
        .post('/api/ai_generate_agent')
        .send({ prompt: '创建 Agent' })

      expect(res.status).toBe(502)
      expect(res.body.error).toContain('请求失败')
    })

    it('应处理无效 JSON 响应', async () => {
      const mockResponse = {
        choices: [{
          message: {
            content: '这不是有效的 JSON'
          }
        }]
      }

      global.fetch.mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: async () => mockResponse
      })

      const res = await request(app)
        .post('/api/ai_generate_agent')
        .send({ prompt: '创建 Agent' })

      expect(res.status).toBe(502)
      expect(res.body.error).toContain('JSON')
    })
  })

  describe('POST /api/chat_with_agent', () => {
    it('应拒绝没有 agent_id 和 soul_override 的请求', async () => {
      const res = await request(app)
        .post('/api/chat_with_agent')
        .send({ messages: [{ role: 'user', content: '你好' }] })

      expect(res.status).toBe(400)
      expect(res.body.error).toContain('agent_id is required')
    })

    it('应拒绝空 messages', async () => {
      const res = await request(app)
        .post('/api/chat_with_agent')
        .send({ agent_id: 'test-agent', messages: [] })

      expect(res.status).toBe(400)
      expect(res.body.error).toContain('messages is required')
    })

    it('应拒绝非数组 messages', async () => {
      const res = await request(app)
        .post('/api/chat_with_agent')
        .send({ agent_id: 'test-agent', messages: 'invalid' })

      expect(res.status).toBe(400)
      expect(res.body.error).toContain('messages is required')
    })

    it('应使用 soul_override 进行聊天', async () => {
      const mockResponse = {
        choices: [{
          message: {
            content: '你好，我是测试 Agent'
          }
        }]
      }

      global.fetch.mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: async () => mockResponse
      })

      const res = await request(app)
        .post('/api/chat_with_agent')
        .send({
          soul_override: '你是一个测试 Agent',
          messages: [{ role: 'user', content: '你好' }]
        })

      expect(res.status).toBe(200)
      expect(res.body.reply).toBe('你好，我是测试 Agent')
    })

    it('应从数据库加载 Agent SOUL 进行聊天', async () => {
      // Insert agent and document
      db.exec(`
        INSERT INTO agents (id, opc_id, display_name, job_title)
        VALUES ('test-agent', 'test-opc', '测试Agent', '测试工程师');

        INSERT INTO agent_documents (id, agent_id, document_type, content)
        VALUES ('doc-1', 'test-agent', 'SOUL', '# SOUL\n你是一个测试工程师 Agent');
      `)

      const mockResponse = {
        choices: [{
          message: {
            content: '我已准备好执行测试'
          }
        }]
      }

      global.fetch.mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: async () => mockResponse
      })

      const res = await request(app)
        .post('/api/chat_with_agent')
        .send({
          agent_id: 'test-agent',
          messages: [{ role: 'user', content: '准备好了吗' }]
        })

      expect(res.status).toBe(200)
      expect(res.body.reply).toBe('我已准备好执行测试')
    })

    it('应在缺少 API Key 时返回错误', async () => {
      // Disable the provider
      db.exec("UPDATE model_providers_v2 SET api_key = NULL WHERE name = 'bailian'")

      const res = await request(app)
        .post('/api/chat_with_agent')
        .send({
          agent_id: 'test-agent',
          messages: [{ role: 'user', content: '你好' }]
        })

      expect(res.status).toBe(400)
      expect(res.body.error).toContain('BAILIAN 未配置 API Key')
    })

    it('应处理 API 错误', async () => {
      global.fetch.mockResolvedValueOnce({
        ok: false,
        status: 429,
        text: async () => 'Rate limit exceeded'
      })

      const res = await request(app)
        .post('/api/chat_with_agent')
        .send({
          soul_override: '你是测试 Agent',
          messages: [{ role: 'user', content: '你好' }]
        })

      expect(res.status).toBe(502)
      expect(res.body.error).toContain('API 错误')
    })

    it('应处理网络超时', async () => {
      global.fetch.mockRejectedValueOnce(new Error('AbortError: The operation was aborted'))

      const res = await request(app)
        .post('/api/chat_with_agent')
        .send({
          soul_override: '你是测试 Agent',
          messages: [{ role: 'user', content: '你好' }]
        })

      expect(res.status).toBe(502)
      expect(res.body.error).toContain('请求失败')
    })
  })
})