import { describe, it, expect, beforeEach } from 'vitest'
import request from 'supertest'
import { createTestDb, makeOpc, makeAgent, makeChannel, makeBinding } from '../helpers/db.js'
import { createTestApp } from '../helpers/app.js'

describe('Binding Routes', () => {
  let db, app, opc, agent, channel

  beforeEach(() => {
    db = createTestDb()
    app = createTestApp(db)
    opc = makeOpc(db)
    agent = makeAgent(db, opc.id)
    channel = makeChannel(db, opc.id)
  })

  describe('get_bindings', () => {
    it('返回空数组（无Binding）', async () => {
      const res = await request(app).post('/api/get_bindings').send({ opc_id: opc.id })
      expect(res.status).toBe(200)
      expect(res.body).toEqual([])
    })

    it('返回OPC下的所有Binding', async () => {
      makeBinding(db, opc.id, agent.id, channel.id)

      const res = await request(app).post('/api/get_bindings').send({ opc_id: opc.id })
      expect(res.status).toBe(200)
      expect(res.body).toHaveLength(1)
    })
  })

  describe('create_binding', () => {
    it('创建新Binding', async () => {
      const bindingData = {
        opc_id: opc.id,
        channel_id: channel.id,
        channel_name: channel.channel_type,
        channel_type: channel.channel_type,
        agent_id: agent.id,
        agent_name: agent.display_name,
        trigger_mode: 'MENTION'
      }

      const res = await request(app).post('/api/create_binding').send({ binding: bindingData })
      expect(res.status).toBe(200)

      const getRes = await request(app).post('/api/get_bindings').send({ opc_id: opc.id })
      expect(getRes.body).toHaveLength(1)
      expect(getRes.body[0].trigger_mode).toBe('MENTION')
    })
  })

  describe('update_binding', () => {
    it('更新Binding', async () => {
      const binding = makeBinding(db, opc.id, agent.id, channel.id, { is_enabled: 1 })

      const res = await request(app).post('/api/update_binding').send({
        id: binding.id,
        binding: {
          channel_id: binding.channel_id,
          channel_name: binding.channel_name,
          channel_type: binding.channel_type,
          agent_id: binding.agent_id,
          agent_name: binding.agent_name,
          trigger_mode: binding.trigger_mode,
          is_enabled: 0
        }
      })
      expect(res.status).toBe(200)

      const getRes = await request(app).post('/api/get_bindings').send({ opc_id: opc.id })
      expect(getRes.body[0].is_enabled).toBe(false)
    })
  })

  describe('delete_binding', () => {
    it('删除Binding', async () => {
      const binding = makeBinding(db, opc.id, agent.id, channel.id)

      const res = await request(app).post('/api/delete_binding').send({ id: binding.id })
      expect(res.status).toBe(200)

      const getRes = await request(app).post('/api/get_bindings').send({ opc_id: opc.id })
      expect(getRes.body).toHaveLength(0)
    })
  })
})
