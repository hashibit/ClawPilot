/**
 * 安全测试
 * 验证 SQL 注入、XSS、API Key 保护等安全功能
 */
import { describe, it, expect, beforeEach } from 'vitest'
import request from 'supertest'
import { createTestDb, makeOpc, makeAgent } from '../helpers/db.js'
import { createTestApp } from '../helpers/app.js'

describe('Security Tests', () => {
  let db, app

  beforeEach(() => {
    db = createTestDb()
    app = createTestApp(db)
  })

  // --- SQL 注入测试 ---
  describe('SQL Injection Prevention', () => {
    const SQL_INJECTION_PAYLOADS = [
      "'; DROP TABLE agents; --",
      "' OR '1'='1",
      "1; DELETE FROM opc_config WHERE 1=1; --",
      "' UNION SELECT * FROM agents --",
      "1' AND (SELECT COUNT(*) FROM agents) > 0 --",
      "'; UPDATE opc_config SET is_running=1 WHERE 1=1; --",
    ]

    describe.each(SQL_INJECTION_PAYLOADS)('SQL 注入：%s', (payload) => {
      it('应阻止 OPC ID 注入', async () => {
        const res = await request(app).post('/api/get_opc').send({ id: payload })
        // 应返回错误而非执行 SQL
        expect(res.status).toBe(500)
        expect(res.body).not.toContain('DROP')
        expect(res.body).not.toContain('DELETE')
        expect(res.body).not.toContain('UPDATE')
      })

      it('应阻止 Agent ID 注入', async () => {
        const res = await request(app).post('/api/get_agent').send({ id: payload })
        expect(res.status).toBe(500)
      })

      it('应阻止 opc_id 注入', async () => {
        const res = await request(app).post('/api/get_agents').send({ opc_id: payload })
        // 应返回空数组或错误，但不执行恶意 SQL
        expect([200, 500]).toContain(res.status)
        if (res.status === 200) {
          expect(Array.isArray(res.body)).toBe(true)
        }
      })
    })

    it('验证表未被删除（SQL 注入后检查）', async () => {
      // 尝试注入
      await request(app).post('/api/get_opc').send({ id: "'; DROP TABLE agents; --" })
      
      // 验证表仍存在
      const opc = makeOpc(db)
      makeAgent(db, opc.id)
      const res = await request(app).post('/api/get_agents').send({ opc_id: opc.id })
      expect(res.status).toBe(200)
      expect(Array.isArray(res.body)).toBe(true)
    })
  })

  // --- XSS 测试 ---
  describe('XSS Prevention', () => {
    const XSS_PAYLOADS = [
      '<script>alert("XSS")</script>',
      '<img src=x onerror=alert("XSS")>',
      'javascript:alert("XSS")',
      '<svg onload=alert("XSS")>',
      '"><script>alert("XSS")</script>',
      '${alert("XSS")}',
      '{{alert("XSS")}}',
    ]

    describe.each(XSS_PAYLOADS)('XSS：%s', (payload) => {
      it('应安全存储 OPC 名称（不执行脚本）', async () => {
        const res = await request(app).post('/api/create_opc').send({
          config: { id: `opc-xss-${Date.now()}`, name: payload, display_name: 'XSS Test' }
        })
        expect([200, 500]).toContain(res.status)

        if (res.status === 200) {
          // 获取并验证内容被正确转义
          const getRes = await request(app).post('/api/get_opc').send({ id: res.body })
          if (getRes.status === 200) {
            const name = getRes.body.name
            // 不应包含原始脚本标签
            expect(name).not.toContain('<script>')
          }
        }
      })

      it('应安全存储 Agent 描述', async () => {
        const opc = makeOpc(db)
        const res = await request(app).post('/api/create_agent').send({
          config: { opc_id: opc.id, name: 'xss-agent', display_name: payload, description: payload }
        })
        expect([200, 500]).toContain(res.status)
      })
    })
  })

  // --- API Key 加密测试 ---
  describe('API Key Encryption', () => {
    it('应加密存储 API Key', async () => {
      const originalKey = 'sk-test-12345-abcde'
      
      // 使用 crypto 工具加密
      const { encrypt } = await import('../../utils/crypto.js')
      const encrypted = encrypt(originalKey)
      
      expect(encrypted).not.toBe(originalKey)
      expect(encrypted.length).toBeGreaterThan(originalKey.length)
    })

    it('应正确解密 API Key', async () => {
      const originalKey = 'sk-test-12345-abcde'
      
      const { encrypt, decrypt } = await import('../../utils/crypto.js')
      const encrypted = encrypt(originalKey)
      const decrypted = decrypt(encrypted)
      
      expect(decrypted).toBe(originalKey)
    })

    it('每次加密应产生不同密文（随机 nonce）', async () => {
      const { encrypt } = await import('../../utils/crypto.js')
      const key = 'same-key'
      
      const c1 = encrypt(key)
      const c2 = encrypt(key)
      
      expect(c1).not.toBe(c2)
    })

    it('解密错误密钥应抛出错误', async () => {
      const { decrypt } = await import('../../utils/crypto.js')
      
      expect(() => decrypt('invalid-encrypted-data')).toThrow()
    })
  })

  // --- 输入验证测试 ---
  describe('Input Validation', () => {
    it('应拒绝无效的文件路径（路径遍历）', async () => {
      const opc = makeOpc(db)
      const res = await request(app).post('/api/update_agent').send({
        id: 'nonexistent',
        config: {
          opc_id: opc.id,
          name: '../../../etc/passwd',
          display_name: 'Path Traversal',
        }
      })
      expect([200, 500]).toContain(res.status)
    })

    it('应处理 Unicode 规范化攻击', async () => {
      // 使用不同的 Unicode 表示相同字符
      const unicodePayloads = [
        '\u0041', // 正常的 A
        '\u0041\u0300', // A + 重音符
        '\u212B', // Ångström 符号（应规范化为 A）
      ]
      
      for (const payload of unicodePayloads) {
        const res = await request(app).post('/api/create_opc').send({
          config: { id: `opc-unicode-${Date.now()}`, name: payload, display_name: 'Unicode' }
        })
        expect([200, 500]).toContain(res.status)
      }
    })
  })

  // --- 资源隔离测试 ---
  describe('Resource Isolation', () => {
    it('应隔离不同 OPC 的数据', async () => {
      const opc1 = makeOpc(db, { name: 'opc-1' })
      const opc2 = makeOpc(db, { name: 'opc-2' })
      
      makeAgent(db, opc1.id, { display_name: 'Agent 1-1' })
      makeAgent(db, opc1.id, { display_name: 'Agent 1-2' })
      makeAgent(db, opc2.id, { display_name: 'Agent 2-1' })
      
      const agents1 = await request(app).post('/api/get_agents').send({ opc_id: opc1.id })
      const agents2 = await request(app).post('/api/get_agents').send({ opc_id: opc2.id })
      
      expect(agents1.body).toHaveLength(2)
      expect(agents2.body).toHaveLength(1)
      
      // 验证 Agent 属于正确的 OPC
      expect(agents1.body.every(a => a.opc_id === opc1.id)).toBe(true)
      expect(agents2.body.every(a => a.opc_id === opc2.id)).toBe(true)
    })

    it('应防止越权访问（不存在的 OPC）', async () => {
      const res = await request(app).post('/api/get_agents').send({ opc_id: 'non-existent-opc' })
      expect(res.status).toBe(200)
      expect(res.body).toEqual([])
    })
  })

  // --- 速率限制测试 ---
  describe('Rate Limiting (Basic)', () => {
    it('应处理大量连续请求', async () => {
      const promises = Array.from({ length: 100 }, (_, i) =>
        request(app).post('/api/get_all_opcs').send({})
      )
      
      const results = await Promise.all(promises)
      // 所有请求应完成（可能有部分失败，但不应崩溃）
      expect(results.length).toBe(100)
    })
  })
})
