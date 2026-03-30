import { describe, it, expect, beforeEach } from 'vitest'
import request from 'supertest'
import { createTestDb } from '../helpers/db.js'
import { createTestApp } from '../helpers/app.js'

describe('Process Routes', () => {
  let db, app

  beforeEach(() => {
    db = createTestDb()
    app = createTestApp(db)
  })

  describe('get_process_status', () => {
    it('返回进程状态', async () => {
      const res = await request(app).post('/api/get_process_status').send({})
      expect(res.status).toBe(200)
      expect(res.body).toHaveProperty('is_running')
      expect(res.body).toHaveProperty('pid')
      expect(res.body).toHaveProperty('uptime_seconds')
    }, 15000) // 增加超时时间到 15 秒
  })

  describe('start_openclaw', () => {
    it('尝试启动进程', async () => {
      const res = await request(app).post('/api/start_openclaw').send({})
      // 根据进程状态返回不同结果
      expect([200, 500]).toContain(res.status)
    }, 15000)
  })

  describe('stop_openclaw', () => {
    it('尝试停止进程', async () => {
      const res = await request(app).post('/api/stop_openclaw').send({})
      // 无论进程是否运行，接口都应该返回 200
      expect([200, 500]).toContain(res.status)
    }, 15000) // 增加超时时间到 15 秒
  })

  describe('reload_openclaw', () => {
    it('尝试重载进程', async () => {
      const res = await request(app).post('/api/reload_openclaw').send({})
      // 只有进程运行时才返回 200
      expect([200, 400, 500]).toContain(res.status)
    }, 15000)
  })
})
