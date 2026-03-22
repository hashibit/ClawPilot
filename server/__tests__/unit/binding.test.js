/**
 * Binding 路由测试
 */
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

  // --- get_bindings ---
  describe('get_bindings', () => {
    it('返回空数组（无绑定）', async () => {
      const res = await request(app).post('/api/get_bindings').send({ opc_id: opc.id })
      expect(res.status).toBe(200)
      expect(res.body).toEqual([])
    })

    it('返回 OPC 下的所有绑定', async () => {
      makeBinding(db, opc.id, agent.id, channel.id)
      makeBinding(db, opc.id, agent.id, channel.id)

      const res = await request(app).post('/api/get_bindings').send({ opc_id: opc.id })
      expect(res.status).toBe(200)
      expect(res.body).toHaveLength(2)
    })
  })

  // --- create_binding ---
  describe('create_binding', () => {
    it('创建新绑定', async () => {
      const bindingData = {
        opc_id: opc.id,
        channel_id: channel.id.toString(),
        channel_name: 'Test Channel',
        channel_type: 'FEISHU',
        agent_id: agent.id,
        agent_name: agent.display_name,
        trigger_mode: 'MENTION'
      }

      const res = await request(app).post('/api/create_binding').send({ binding: bindingData })
      expect(res.status).toBe(200)

      const bindingsRes = await request(app).post('/api/get_bindings').send({ opc_id: opc.id })
      expect(bindingsRes.body).toHaveLength(1)
      expect(bindingsRes.body[0].agent_id).toBe(agent.id)
    })

    it('拒绝无效的 agent_id', async () => {
      const bindingData = {
        opc_id: opc.id,
        channel_id: channel.id.toString(),
        channel_name: 'Test Channel',
        channel_type: 'FEISHU',
        agent_id: 'non-existent-agent',
        agent_name: 'Ghost Agent',
        trigger_mode: 'MENTION'
      }

      const res = await request(app).post('/api/create_binding').send({ binding: bindingData })
      expect(res.status).toBe(500)
    })

    it('拒绝无效的 channel_id', async () => {
      const bindingData = {
        opc_id: opc.id,
        channel_id: '99999',
        channel_name: 'Test Channel',
        channel_type: 'FEISHU',
        agent_id: agent.id,
        agent_name: agent.display_name,
        trigger_mode: 'MENTION'
      }

      const res = await request(app).post('/api/create_binding').send({ binding: bindingData })
      expect(res.status).toBe(500)
    })
  })

  // --- update_binding ---
  describe('update_binding', () => {
    it('更新绑定配置', async () => {
      const binding = makeBinding(db, opc.id, agent.id, channel.id)

      const res = await request(app).post('/api/update_binding').send({
        id: binding.id,
        binding: { ...binding, trigger_mode: 'ALL', agent_name: 'Updated Agent' }
      })
      expect(res.status).toBe(200)

      const bindingsRes = await request(app).post('/api/get_bindings').send({ opc_id: opc.id })
      expect(bindingsRes.body[0].trigger_mode).toBe('ALL')
      expect(bindingsRes.body[0].agent_name).toBe('Updated Agent')
    })

    it('更新绑定启用状态', async () => {
      const binding = makeBinding(db, opc.id, agent.id, channel.id, { is_enabled: 1 })

      const res = await request(app).post('/api/update_binding').send({
        id: binding.id,
        binding: { ...binding, is_enabled: 0 }
      })
      expect(res.status).toBe(200)

      const bindingsRes = await request(app).post('/api/get_bindings').send({ opc_id: opc.id })
      expect(bindingsRes.body[0].is_enabled).toBe(false)
    })
  })

  // --- delete_binding ---
  describe('delete_binding', () => {
    it('删除绑定', async () => {
      const binding = makeBinding(db, opc.id, agent.id, channel.id)

      const res = await request(app).post('/api/delete_binding').send({ id: binding.id })
      expect(res.status).toBe(200)

      const bindingsRes = await request(app).post('/api/get_bindings').send({ opc_id: opc.id })
      expect(bindingsRes.body).toHaveLength(0)
    })
  })

  // --- 触发模式测试 ---
  describe('Trigger Modes', () => {
    it('创建 MENTION 触发模式的绑定', async () => {
      const bindingData = {
        opc_id: opc.id,
        channel_id: channel.id.toString(),
        channel_name: 'Test Channel',
        channel_type: 'FEISHU',
        agent_id: agent.id,
        agent_name: agent.display_name,
        trigger_mode: 'MENTION'
      }

      const res = await request(app).post('/api/create_binding').send({ binding: bindingData })
      expect(res.status).toBe(200)

      const bindingsRes = await request(app).post('/api/get_bindings').send({ opc_id: opc.id })
      expect(bindingsRes.body[0].trigger_mode).toBe('MENTION')
    })

    it('创建 ALL 触发模式的绑定', async () => {
      const bindingData = {
        opc_id: opc.id,
        channel_id: channel.id.toString(),
        channel_name: 'Test Channel',
        channel_type: 'FEISHU',
        agent_id: agent.id,
        agent_name: agent.display_name,
        trigger_mode: 'ALL'
      }

      const res = await request(app).post('/api/create_binding').send({ binding: bindingData })
      expect(res.status).toBe(200)

      const bindingsRes = await request(app).post('/api/get_bindings').send({ opc_id: opc.id })
      expect(bindingsRes.body[0].trigger_mode).toBe('ALL')
    })
  })
})
