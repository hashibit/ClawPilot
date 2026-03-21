import { describe, it, expect, beforeEach } from 'vitest'
import request from 'supertest'
import { createTestDb, makeTool } from '../helpers/db.js'
import { createTestApp } from '../helpers/app.js'

describe('Tool Routes', () => {
  let db, app

  beforeEach(() => {
    db = createTestDb()
    app = createTestApp(db)
  })

  describe('get_tools', () => {
    it('返回工具列表', async () => {
      makeTool(db, { name: 'tool-1', display_name: 'Tool 1' })
      makeTool(db, { name: 'tool-2', display_name: 'Tool 2' })

      const res = await request(app).post('/api/get_tools').send({})
      expect(res.status).toBe(200)
      expect(res.body.length).toBeGreaterThanOrEqual(2)
    })
  })

  describe('create_tool', () => {
    it('创建新工具', async () => {
      const toolData = {
        name: 'test_tool',
        display_name: 'Test Tool',
        description: 'A test tool'
      }

      const res = await request(app).post('/api/create_tool').send({ tool: toolData })
      expect(res.status).toBe(200)
      expect(typeof res.body).toBe('number')
    })

    it('拒绝空名称', async () => {
      const res = await request(app).post('/api/create_tool').send({
        tool: { name: '', display_name: 'Test' }
      })
      expect(res.status).toBe(400)
    })

    it('拒绝重复名称', async () => {
      makeTool(db, { name: 'duplicate-tool' })

      const res = await request(app).post('/api/create_tool').send({
        tool: { name: 'duplicate-tool', display_name: 'Duplicate' }
      })
      expect(res.status).toBe(400)
    })
  })

  describe('delete_tool', () => {
    it('删除本地工具', async () => {
      const tool = makeTool(db, { is_local: 1 })

      const res = await request(app).post('/api/delete_tool').send({ id: tool.id })
      expect(res.status).toBe(200)
      expect(res.body.ok).toBe(true)
    })
  })
})
