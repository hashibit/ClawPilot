import { describe, it, expect, beforeEach } from 'vitest'
import request from 'supertest'
import { createTestDb, makeOpc, makeAgent, makeChannel, makeBinding, makeSnapshot } from '../helpers/db.js'
import { createTestApp } from '../helpers/app.js'

describe('Snapshot Routes', () => {
  let db, app, opc

  beforeEach(() => {
    db = createTestDb()
    app = createTestApp(db)
    opc = makeOpc(db)
  })

  describe('create_snapshot', () => {
    it('创建新快照', async () => {
      const res = await request(app).post('/api/create_snapshot').send({
        opc_id: opc.id,
        label: 'Test Snapshot'
      })
      expect(res.status).toBe(200)
      expect(typeof res.body).toBe('string')
    })

    it('拒绝空标签', async () => {
      const res = await request(app).post('/api/create_snapshot').send({
        opc_id: opc.id,
        label: ''
      })
      expect(res.status).toBe(400)
    })
  })

  describe('get_snapshots', () => {
    it('返回OPC的所有快照', async () => {
      makeSnapshot(db, opc.name, { label: 'Snapshot 1' })
      makeSnapshot(db, opc.name, { label: 'Snapshot 2' })

      const res = await request(app).post('/api/get_snapshots').send({ opc_id: opc.id })
      expect(res.status).toBe(200)
      expect(res.body).toHaveLength(2)
    })
  })

  describe('get_snapshot', () => {
    it('返回指定快照详情', async () => {
      const snapshot = makeSnapshot(db, opc.name, { label: 'Detail Snapshot', config_data: '{"test": true}' })

      const res = await request(app).post('/api/get_snapshot').send({ id: snapshot.id })
      expect(res.status).toBe(200)
      expect(res.body.label).toBe('Detail Snapshot')
    })
  })

  describe('restore_snapshot', () => {
    it('恢复快照', async () => {
      const agent = makeAgent(db, opc.id)
      const channel = makeChannel(db, opc.id)
      makeBinding(db, opc.id, agent.id, channel.id)

      // 创建快照
      const createRes = await request(app).post('/api/create_snapshot').send({
        opc_id: opc.id,
        label: 'Before Restore'
      })
      const snapshotId = createRes.body

      // 删除agent
      await request(app).post('/api/delete_agent').send({ id: agent.id })

      // 验证agent已删除
      let getRes = await request(app).post('/api/get_agents').send({ opc_id: opc.id })
      expect(getRes.body).toHaveLength(0)

      // 恢复快照
      const restoreRes = await request(app).post('/api/restore_snapshot').send({ id: snapshotId })
      expect(restoreRes.status).toBe(200)
      expect(typeof restoreRes.body).toBe('string') // 返回opc_id
    })
  })

  describe('delete_snapshot', () => {
    it('删除快照', async () => {
      const snapshot = makeSnapshot(db, opc.name)

      const res = await request(app).post('/api/delete_snapshot').send({ id: snapshot.id })
      expect(res.status).toBe(200)

      const getRes = await request(app).post('/api/get_snapshot').send({ id: snapshot.id })
      expect(getRes.status).toBe(500)
    })
  })
})
