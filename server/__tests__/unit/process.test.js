import { describe, it, expect, beforeEach, vi } from 'vitest'
import request from 'supertest'
import { createTestDb } from '../helpers/db.js'
import { createTestApp } from '../helpers/app.js'

// Mock child_process so stop/start/reload never touch the real openclaw
vi.mock('child_process', async (importOriginal) => {
  const actual = await importOriginal()
  return {
    ...actual,
    execSync: vi.fn(() => ''),
    spawn: vi.fn(() => ({ unref: vi.fn() })),
  }
})

// Mock global fetch so get_process_status / restart_openclaw never hit the daemon
vi.stubGlobal('fetch', vi.fn(() =>
  Promise.resolve({
    ok: true,
    json: () => Promise.resolve({ openclaw_status: 'running', openclaw_pid: 12345 }),
  })
))

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
    })
  })

  describe('start_openclaw', () => {
    it('返回启动成功', async () => {
      const res = await request(app).post('/api/start_openclaw').send({})
      expect(res.status).toBe(200)
      expect(res.body.ok).toBe(true)
    })
  })

  describe('stop_openclaw', () => {
    it('返回停止成功', async () => {
      const res = await request(app).post('/api/stop_openclaw').send({})
      expect(res.status).toBe(200)
      expect(res.body.ok).toBe(true)
    })
  })

  describe('reload_openclaw', () => {
    it('返回重载成功', async () => {
      const res = await request(app).post('/api/reload_openclaw').send({})
      expect(res.status).toBe(200)
      expect(res.body.ok).toBe(true)
    })
  })
})
