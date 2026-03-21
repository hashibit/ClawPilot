import { describe, it, expect, beforeEach } from 'vitest'
import request from 'supertest'
import { createTestDb } from '../helpers/db.js'
import { createTestApp } from '../helpers/app.js'

describe('Log Routes', () => {
  let db, app

  beforeEach(() => {
    db = createTestDb()
    app = createTestApp(db)
  })

  describe('get_logs', () => {
    it('返回空数组（无日志）', async () => {
      const res = await request(app).post('/api/get_logs').send({})
      expect(res.status).toBe(200)
      expect(res.body).toEqual([])
    })

    it('按级别过滤日志', async () => {
      // 先写入日志
      await request(app).post('/api/write_log').send({
        level: 'INFO',
        component: 'test',
        message: 'Test info message'
      })
      await request(app).post('/api/write_log').send({
        level: 'ERROR',
        component: 'test',
        message: 'Test error message'
      })

      const res = await request(app).post('/api/get_logs').send({ level: 'ERROR' })
      expect(res.status).toBe(200)
      expect(res.body).toHaveLength(1)
      expect(res.body[0].level).toBe('ERROR')
    })

    it('按组件过滤日志', async () => {
      await request(app).post('/api/write_log').send({
        level: 'INFO',
        component: 'component-a',
        message: 'Message A'
      })
      await request(app).post('/api/write_log').send({
        level: 'INFO',
        component: 'component-b',
        message: 'Message B'
      })

      const res = await request(app).post('/api/get_logs').send({ component: 'component-a' })
      expect(res.status).toBe(200)
      expect(res.body).toHaveLength(1)
      expect(res.body[0].component).toBe('component-a')
    })

    it('限制返回数量', async () => {
      for (let i = 0; i < 10; i++) {
        await request(app).post('/api/write_log').send({
          level: 'INFO',
          component: 'test',
          message: `Message ${i}`
        })
      }

      const res = await request(app).post('/api/get_logs').send({ limit: 5 })
      expect(res.status).toBe(200)
      expect(res.body).toHaveLength(5)
    })
  })

  describe('write_log', () => {
    it('写入日志成功', async () => {
      const res = await request(app).post('/api/write_log').send({
        level: 'INFO',
        component: 'test',
        message: 'Test message',
        agent_id: 'agent-123',
        channel: 'test-channel'
      })
      expect(res.status).toBe(200)
      expect(typeof res.body).toBe('number')

      const getRes = await request(app).post('/api/get_logs').send({})
      expect(getRes.body).toHaveLength(1)
      expect(getRes.body[0].message).toBe('Test message')
    })
  })
})
