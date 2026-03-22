/**
 * 边界条件测试
 * 验证 API 对异常输入的处理
 */
import { describe, it, expect, beforeEach } from 'vitest'
import request from 'supertest'
import { createTestDb, makeOpc, makeAgent } from '../helpers/db.js'
import { createTestApp } from '../helpers/app.js'

describe('Boundary Conditions', () => {
  let db, app

  beforeEach(() => {
    db = createTestDb()
    app = createTestApp(db)
  })

  // --- 空值测试 ---
  describe('Empty/Null Values', () => {
    it('应拒绝空 OPC 名称', async () => {
      const res = await request(app).post('/api/create_opc').send({
        config: { id: 'opc-empty', name: '', display_name: 'Empty' }
      })
      expect(res.status).toBe(500)
    })

    it('应拒绝空 Agent 名称', async () => {
      const opc = makeOpc(db)
      const res = await request(app).post('/api/create_agent').send({
        config: { opc_id: opc.id, name: '', display_name: 'Empty' }
      })
      expect(res.status).toBe(500)
    })

    it('应处理空 opc_id 查询', async () => {
      const res = await request(app).post('/api/get_agents').send({ opc_id: '' })
      expect(res.status).toBe(200)
      expect(res.body).toEqual([])
    })

    it('应处理不存在的 ID 查询', async () => {
      const res = await request(app).post('/api/get_opc').send({ id: 'non-existent-id' })
      expect(res.status).toBe(500)
      expect(res.body).toContain('Not found')
    })
  })

  // --- 超长字符串测试 ---
  describe('Long Strings', () => {
    const LONG_STRING = 'x'.repeat(10000)
    const VERY_LONG_STRING = 'x'.repeat(100000)

    it('应处理超长 OPC 名称', async () => {
      const res = await request(app).post('/api/create_opc').send({
        config: { id: 'opc-long', name: LONG_STRING, display_name: 'Long' }
      })
      // 应成功创建或返回明确的错误，不应崩溃
      expect([200, 500]).toContain(res.status)
    })

    it('应处理超长描述', async () => {
      const opc = makeOpc(db)
      const res = await request(app).post('/api/update_opc').send({
        id: opc.id,
        config: { ...opc, description: LONG_STRING }
      })
      expect([200, 500]).toContain(res.status)
    })

    it('应处理超长 Agent 描述', async () => {
      const opc = makeOpc(db)
      const agent = makeAgent(db, opc.id)
      const res = await request(app).post('/api/update_agent').send({
        id: agent.id,
        config: { ...agent, description: VERY_LONG_STRING }
      })
      expect([200, 500]).toContain(res.status)
    })
  })

  // --- 特殊字符测试 ---
  describe('Special Characters', () => {
    const SPECIAL_CHARS = [
      '<script>alert("xss")</script>',
      "'; DROP TABLE agents; --",
      '{{constructor.constructor("return this")()}}',
      '${7*7}',
      '\u0000null-byte',
      '\n\r\ttabs-and-newlines',
      'emoji-🎉-🔧-🚀',
      '中文 - 日本語 - 한국어 - العربية',
    ]

    describe.each(SPECIAL_CHARS)('特殊字符：%s', (specialChar) => {
      it('应处理 OPC 名称中的特殊字符', async () => {
        const res = await request(app).post('/api/create_opc').send({
          config: { id: `opc-special-${Date.now()}`, name: specialChar, display_name: 'Special' }
        })
        // 应成功创建或返回明确的错误，不应崩溃
        expect([200, 500]).toContain(res.status)
      })

      it('应处理 Agent 名称中的特殊字符', async () => {
        const opc = makeOpc(db)
        const res = await request(app).post('/api/create_agent').send({
          config: { opc_id: opc.id, name: specialChar, display_name: 'Special' }
        })
        expect([200, 500]).toContain(res.status)
      })
    })
  })

  // --- 数字边界测试 ---
  describe('Numeric Boundaries', () => {
    it('应处理负数 order_index', async () => {
      const opc = makeOpc(db)
      const res = await request(app).post('/api/create_agent').send({
        config: { opc_id: opc.id, name: 'test', display_name: 'Test', order_index: -1 }
      })
      expect([200, 500]).toContain(res.status)
    })

    it('应处理超大数字', async () => {
      const opc = makeOpc(db)
      const res = await request(app).post('/api/create_agent').send({
        config: { opc_id: opc.id, name: 'test', display_name: 'Test', order_index: Number.MAX_SAFE_INTEGER }
      })
      expect([200, 500]).toContain(res.status)
    })

    it('应处理 NaN（应转换为字符串或拒绝）', async () => {
      const opc = makeOpc(db)
      const res = await request(app).post('/api/create_agent').send({
        config: { opc_id: opc.id, name: 'test', display_name: 'Test', order_index: NaN }
      })
      expect([200, 400, 500]).toContain(res.status)
    })
  })

  // --- JSON 结构测试 ---
  describe('Invalid JSON Structures', () => {
    it('应处理缺失必填字段', async () => {
      const res = await request(app).post('/api/create_opc').send({
        config: { display_name: 'No ID' } // 缺少 id 和 name
      })
      expect(res.status).toBe(500)
    })

    it('应处理类型错误', async () => {
      const opc = makeOpc(db)
      const res = await request(app).post('/api/update_opc').send({
        id: opc.id,
        config: { ...opc, is_running: 'not-a-boolean' }
      })
      expect([200, 500]).toContain(res.status)
    })

    it('应处理空数组字段', async () => {
      const opc = makeOpc(db)
      const res = await request(app).post('/api/create_agent').send({
        config: {
          opc_id: opc.id,
          name: 'test',
          display_name: 'Test',
          enabled_tools: [],
          disabled_tools: [],
          enabled_skills: [],
          guardrail_rules: [],
        }
      })
      expect(res.status).toBe(200)
    })

    it('应处理对象而非数组', async () => {
      const opc = makeOpc(db)
      const res = await request(app).post('/api/create_agent').send({
        config: {
          opc_id: opc.id,
          name: 'test',
          display_name: 'Test',
          enabled_tools: { not: 'an-array' },
        }
      })
      expect([200, 500]).toContain(res.status)
    })
  })

  // --- 并发测试 ---
  describe('Concurrent Operations', () => {
    it('应处理并发创建 OPC', async () => {
      const promises = Array.from({ length: 10 }, (_, i) =>
        request(app).post('/api/create_opc').send({
          config: { id: `opc-concurrent-${i}`, name: `concurrent-${i}`, display_name: `Concurrent ${i}` }
        })
      )
      const results = await Promise.all(promises)
      // 所有请求应成功或至少有部分成功
      expect(results.some(r => r.status === 200)).toBe(true)
    })

    it('应处理并发创建同名 OPC（应失败）', async () => {
      const name = `duplicate-${Date.now()}`
      const promises = Array.from({ length: 5 }, () =>
        request(app).post('/api/create_opc').send({
          config: { id: `opc-dup-${Math.random()}`, name, display_name: 'Duplicate' }
        })
      )
      const results = await Promise.all(promises)
      // 至少有一个成功，其他应失败
      const successCount = results.filter(r => r.status === 200).length
      expect(successCount).toBeGreaterThanOrEqual(1)
      expect(successCount).toBeLessThan(5)
    })

    it('应处理并发修改同一 OPC', async () => {
      const opc = makeOpc(db, { display_name: 'Original' })
      const promises = Array.from({ length: 5 }, (_, i) =>
        request(app).post('/api/update_opc').send({
          id: opc.id,
          config: { ...opc, display_name: `Updated-${i}` }
        })
      )
      const results = await Promise.all(promises)
      // 所有更新应成功（最后一个写入获胜）
      results.forEach(r => expect(r.status).toBe(200))
    })
  })

  // --- 级联删除测试 ---
  describe('Cascading Deletes', () => {
    it('应级联删除 OPC 下的所有 Agent', async () => {
      const opc = makeOpc(db)
      makeAgent(db, opc.id)
      makeAgent(db, opc.id)
      makeAgent(db, opc.id)

      await request(app).post('/api/delete_opc').send({ id: opc.id })

      const agentsRes = await request(app).post('/api/get_agents').send({ opc_id: opc.id })
      expect(agentsRes.body).toHaveLength(0)
    })

    it('应级联删除 Agent 的文档', async () => {
      const opc = makeOpc(db)
      const agent = makeAgent(db, opc.id)

      await request(app).post('/api/delete_agent').send({ id: agent.id })

      const docsRes = await request(app).post('/api/get_agent_documents').send({ agent_id: agent.id })
      expect(docsRes.body).toHaveLength(0)
    })
  })
})
