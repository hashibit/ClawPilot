import { describe, it, expect, beforeEach } from 'vitest'
import request from 'supertest'
import { createTestDb, makeOpc, makeAgent } from '../helpers/db.js'
import { createTestApp } from '../helpers/app.js'

describe('Agent Routes', () => {
  let db, app, opc

  beforeEach(() => {
    db = createTestDb()
    app = createTestApp(db)
    opc = makeOpc(db)
  })

  // --- get_agents ---
  describe('get_agents', () => {
    it('返回空数组（无Agent）', async () => {
      const res = await request(app).post('/api/get_agents').send({ opc_id: opc.id })
      expect(res.status).toBe(200)
      expect(res.body).toEqual([])
    })

    it('返回OPC下的所有Agent', async () => {
      makeAgent(db, opc.id, { display_name: 'Agent 1' })
      makeAgent(db, opc.id, { display_name: 'Agent 2' })

      const res = await request(app).post('/api/get_agents').send({ opc_id: opc.id })
      expect(res.status).toBe(200)
      expect(res.body).toHaveLength(2)
    })
  })

  // --- get_agent ---
  describe('get_agent', () => {
    it('返回指定Agent详情', async () => {
      const agent = makeAgent(db, opc.id, { display_name: 'Detail Agent' })

      const res = await request(app).post('/api/get_agent').send({ id: agent.id })
      expect(res.status).toBe(200)
      expect(res.body.display_name).toBe('Detail Agent')
    })
  })

  // --- create_agent ---
  describe('create_agent', () => {
    it('创建新Agent', async () => {
      const agentData = {
        opc_id: opc.id,
        name: 'new_agent',
        display_name: 'New Agent',
        job_title: 'Developer'
      }

      const res = await request(app).post('/api/create_agent').send({ config: agentData })
      expect(res.status).toBe(200)
      expect(typeof res.body).toBe('string')

      const getRes = await request(app).post('/api/get_agents').send({ opc_id: opc.id })
      expect(getRes.body).toHaveLength(1)
      expect(getRes.body[0].display_name).toBe('New Agent')
    })
  })

  // --- update_agent ---
  describe('update_agent', () => {
    it('更新Agent信息', async () => {
      const agent = makeAgent(db, opc.id, { display_name: 'Old Name' })

      const res = await request(app).post('/api/update_agent').send({
        id: agent.id,
        config: { ...agent, display_name: 'New Name', job_title: 'Senior Dev' }
      })
      expect(res.status).toBe(200)

      const getRes = await request(app).post('/api/get_agent').send({ id: agent.id })
      expect(getRes.body.display_name).toBe('New Name')
      expect(getRes.body.job_title).toBe('Senior Dev')
    })
  })

  // --- delete_agent ---
  describe('delete_agent', () => {
    it('删除Agent', async () => {
      const agent = makeAgent(db, opc.id)

      const res = await request(app).post('/api/delete_agent').send({ id: agent.id })
      expect(res.status).toBe(200)

      const getRes = await request(app).post('/api/get_agents').send({ opc_id: opc.id })
      expect(getRes.body).toHaveLength(0)
    })
  })

  // --- get_agent_documents ---
  describe('get_agent_documents', () => {
    it('返回Agent的所有文档', async () => {
      const agent = makeAgent(db, opc.id)

      const res = await request(app).post('/api/get_agent_documents').send({ agent_id: agent.id })
      expect(res.status).toBe(200)
      expect(res.body).toHaveLength(7) // SOUL, IDENTITY, AGENTS, USER, MEMORY, HEARTBEAT, TOOLS
    })
  })

  // --- update_agent_document ---
  describe('update_agent_document', () => {
    it('更新Agent文档', async () => {
      const agent = makeAgent(db, opc.id)

      const res = await request(app).post('/api/update_agent_document').send({
        agent_id: agent.id,
        doc_type: 'SOUL',
        content: '# New SOUL Content'
      })
      expect(res.status).toBe(200)

      const getRes = await request(app).post('/api/get_agent_documents').send({ agent_id: agent.id })
      const soulDoc = getRes.body.find(d => d.document_type === 'SOUL')
      expect(soulDoc.content).toBe('# New SOUL Content')
    })
  })

  // --- reorder_agents ---
  describe('reorder_agents', () => {
    it('重新排序Agent', async () => {
      const agent1 = makeAgent(db, opc.id, { order_index: 0, display_name: 'A1' })
      const agent2 = makeAgent(db, opc.id, { order_index: 1, display_name: 'A2' })

      const res = await request(app).post('/api/reorder_agents').send({
        opc_id: opc.id,
        agent_ids: [agent2.id, agent1.id]
      })
      expect(res.status).toBe(200)

      const getRes = await request(app).post('/api/get_agents').send({ opc_id: opc.id })
      expect(getRes.body[0].id).toBe(agent2.id)
      expect(getRes.body[1].id).toBe(agent1.id)
    })
  })
})
