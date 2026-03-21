import { describe, it, expect, beforeEach } from 'vitest'
import request from 'supertest'
import { createTestDb } from '../helpers/db.js'
import { createTestApp } from '../helpers/app.js'

describe('Model Routes', () => {
  let db, app

  beforeEach(() => {
    db = createTestDb()
    app = createTestApp(db)
  })

  describe('get_providers', () => {
    it('返回所有模型提供商', async () => {
      const res = await request(app).post('/api/get_providers').send({})
      expect(res.status).toBe(200)
      expect(res.body.length).toBeGreaterThanOrEqual(3) // BAILIAN, VOLCENGINE, MINIMAX
    })
  })

  describe('get_models', () => {
    it('返回可用模型列表', async () => {
      const res = await request(app).post('/api/get_models').send({})
      expect(res.status).toBe(200)
      expect(res.body.length).toBeGreaterThanOrEqual(1)
    })
  })

  describe('update_provider', () => {
    it('更新模型提供商配置', async () => {
      const res = await request(app).post('/api/update_provider').send({
        config: {
          provider_type: 'BAILIAN',
          api_key: 'test-api-key',
          base_url: 'https://test.example.com'
        }
      })
      expect(res.status).toBe(200)

      const getRes = await request(app).post('/api/get_providers').send({})
      const bailian = getRes.body.find(p => p.provider_type === 'BAILIAN')
      expect(bailian.api_key).toBe('test-api-key')
      expect(bailian.base_url).toBe('https://test.example.com')
    })
  })

  describe('test_provider', () => {
    it('测试连接（模拟模式）', async () => {
      // 由于无法访问真实API，测试将返回错误，但验证接口正常工作
      const res = await request(app).post('/api/test_provider').send({
        provider_type: 'BAILIAN'
      })
      // 期望返回502或200，取决于是否能连接到真实API
      expect([200, 502, 400]).toContain(res.status)
    })
  })
})
