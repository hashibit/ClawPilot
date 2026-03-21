import { describe, it, expect, beforeEach } from 'vitest'
import request from 'supertest'
import { createTestDb, makeOpc } from '../helpers/db.js'
import { createTestApp } from '../helpers/app.js'

describe('OPC Routes', () => {
  let db, app

  beforeEach(() => {
    db = createTestDb()
    app = createTestApp(db)
  })

  // --- get_all_opcs ---
  describe('get_all_opcs', () => {
    it('返回空数组（无数据）', async () => {
      const res = await request(app).post('/api/get_all_opcs').send({})
      expect(res.status).toBe(200)
      expect(res.body).toEqual([])
    })

    it('返回所有OPC列表', async () => {
      const opc1 = makeOpc(db, { name: `opc-1-${Date.now()}`, display_name: 'OPC 1' })
      const opc2 = makeOpc(db, { name: `opc-2-${Date.now()}`, display_name: 'OPC 2' })

      const res = await request(app).post('/api/get_all_opcs').send({})
      expect(res.status).toBe(200)
      expect(res.body).toHaveLength(2)
      expect(res.body.map(o => o.display_name)).toContain('OPC 1')
      expect(res.body.map(o => o.display_name)).toContain('OPC 2')
    })
  })

  // --- get_opc ---
  describe('get_opc', () => {
    it('返回指定OPC详情', async () => {
      const opc = makeOpc(db, { display_name: 'Test OPC Detail' })

      const res = await request(app).post('/api/get_opc').send({ id: opc.id })
      expect(res.status).toBe(200)
      expect(res.body.display_name).toBe('Test OPC Detail')
    })

    it('返回404（不存在）', async () => {
      const res = await request(app).post('/api/get_opc').send({ id: 'non-existent' })
      expect(res.status).toBe(500)
    })
  })

  // --- create_opc ---
  describe('create_opc', () => {
    it('创建新OPC', async () => {
      const ts = Math.floor(Date.now() / 1000)
      const newOpc = {
        id: `opc-new-${ts}`,
        name: `opc-new-${ts}`,
        display_name: 'New OPC'
      }

      const res = await request(app).post('/api/create_opc').send({ config: newOpc })
      expect(res.status).toBe(200)

      const getRes = await request(app).post('/api/get_opc').send({ id: newOpc.id })
      expect(getRes.body.display_name).toBe('New OPC')
    })

    it('拒绝重复名称', async () => {
      const opc = makeOpc(db)
      const newOpc = {
        id: 'opc-duplicate',
        name: opc.name,
        display_name: 'Duplicate'
      }

      const res = await request(app).post('/api/create_opc').send({ config: newOpc })
      expect(res.status).toBe(500)
    })
  })

  // --- update_opc ---
  describe('update_opc', () => {
    it('更新OPC信息', async () => {
      const opc = makeOpc(db, { display_name: 'Old Name' })

      const res = await request(app).post('/api/update_opc').send({
        id: opc.id,
        config: { ...opc, display_name: 'New Name' }
      })
      expect(res.status).toBe(200)

      const getRes = await request(app).post('/api/get_opc').send({ id: opc.id })
      expect(getRes.body.display_name).toBe('New Name')
    })
  })

  // --- delete_opc ---
  describe('delete_opc', () => {
    it('删除OPC', async () => {
      const opc = makeOpc(db)

      const res = await request(app).post('/api/delete_opc').send({ id: opc.id })
      expect(res.status).toBe(200)

      const getRes = await request(app).post('/api/get_opc').send({ id: opc.id })
      expect(getRes.status).toBe(500)
    })
  })

  // --- set_current_opc ---
  describe('set_current_opc', () => {
    it('设置当前OPC', async () => {
      const opc = makeOpc(db)

      const res = await request(app).post('/api/set_current_opc').send({ id: opc.id })
      expect(res.status).toBe(200)
    })
  })

  // --- get_current_opc ---
  describe('get_current_opc', () => {
    it('获取当前OPC（未设置时返回空对象）', async () => {
      const res = await request(app).post('/api/get_current_opc').send({})
      expect(res.status).toBe(200)
      expect(res.body).toEqual({})
    })
  })
})
