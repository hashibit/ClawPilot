import { describe, it, expect, beforeEach } from 'vitest'
import request from 'supertest'
import { createTestDb, makeOffice } from '../helpers/db.js'
import { createTestApp } from '../helpers/app.js'

describe('Office Routes', () => {
  let db, app

  beforeEach(() => {
    db = createTestDb()
    app = createTestApp(db)
    // 清空预置的"本机办公室"数据，确保测试隔离
    db.prepare('DELETE FROM offices').run()
  })

  describe('get_offices', () => {
    it('返回空数组（无Office）', async () => {
      const res = await request(app).post('/api/get_offices').send({})
      expect(res.status).toBe(200)
      expect(res.body).toEqual([])
    })

    it('返回所有Office', async () => {
      makeOffice(db, { name: 'Office 1' })
      makeOffice(db, { name: 'Office 2' })

      const res = await request(app).post('/api/get_offices').send({})
      expect(res.status).toBe(200)
      expect(res.body).toHaveLength(2)
    })
  })

  describe('get_office', () => {
    it('返回指定Office详情', async () => {
      const office = makeOffice(db, { name: 'Detail Office' })

      const res = await request(app).post('/api/get_office').send({ id: office.id })
      expect(res.status).toBe(200)
      expect(res.body.name).toBe('Detail Office')
    })

    it('返回500（不存在）', async () => {
      const res = await request(app).post('/api/get_office').send({ id: 'non-existent' })
      expect(res.status).toBe(500)
    })
  })

  describe('create_office', () => {
    it('创建新Office', async () => {
      const officeData = {
        id: `office-${Date.now()}`,
        name: 'New Office'
      }

      const res = await request(app).post('/api/create_office').send({ office: officeData })
      expect(res.status).toBe(200)

      const getRes = await request(app).post('/api/get_offices').send({})
      expect(getRes.body).toHaveLength(1)
      expect(getRes.body[0].name).toBe('New Office')
    })
  })

  describe('update_office', () => {
    it('更新Office信息', async () => {
      const office = makeOffice(db, { name: 'Old Name' })

      const res = await request(app).post('/api/update_office').send({
        id: office.id,
        office: { name: 'New Name', address: 'New Address' }
      })
      expect(res.status).toBe(200)

      const getRes = await request(app).post('/api/get_office').send({ id: office.id })
      expect(getRes.body.name).toBe('New Name')
      expect(getRes.body.address).toBe('New Address')
    })
  })

  describe('delete_office', () => {
    it('删除Office', async () => {
      const office = makeOffice(db)

      const res = await request(app).post('/api/delete_office').send({ id: office.id })
      expect(res.status).toBe(200)

      const getRes = await request(app).post('/api/get_offices').send({})
      expect(getRes.body).toHaveLength(0)
    })
  })

  describe('check_daemon_health', () => {
    it('返回未配置错误（无daemon_url）', async () => {
      const res = await request(app).post('/api/check_daemon_health').send({})
      expect(res.status).toBe(200)
      expect(res.body.ok).toBe(false)
      expect(res.body.error).toContain('未配置')
    })
  })
})
