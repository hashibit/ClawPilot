/**
 * 性能测试
 * 验证大数据量下的查询性能
 */
import { describe, it, expect, beforeEach } from 'vitest'
import request from 'supertest'
import { createTestDb, makeOpc, makeAgent, makeChannel, makeBinding } from '../helpers/db.js'
import { createTestApp } from '../helpers/app.js'

describe('Performance Tests', () => {
  let db, app

  beforeEach(() => {
    db = createTestDb()
    app = createTestApp(db)
  })

  // --- 大量数据查询测试 ---
  describe('Large Dataset Queries', () => {
    it('应处理 100 个 OPC 查询', async () => {
      // 创建 100 个 OPC
      for (let i = 0; i < 100; i++) {
        makeOpc(db, { name: `perf-opc-${i}` })
      }

      const startTime = Date.now()
      const res = await request(app).post('/api/get_all_opcs').send({})
      const endTime = Date.now()

      expect(res.status).toBe(200)
      expect(res.body).toHaveLength(100)
      expect(endTime - startTime).toBeLessThan(5000) // 5 秒内完成
    })

    it('应处理单个 OPC 下 100 个 Agent 查询', async () => {
      const opc = makeOpc(db)
      
      // 创建 100 个 Agent
      for (let i = 0; i < 100; i++) {
        makeAgent(db, opc.id, { name: `agent-${i}` })
      }

      const startTime = Date.now()
      const res = await request(app).post('/api/get_agents').send({ opc_id: opc.id })
      const endTime = Date.now()

      expect(res.status).toBe(200)
      expect(res.body).toHaveLength(100)
      expect(endTime - startTime).toBeLessThan(2000) // 2 秒内完成
    })

    it('应处理复杂关联查询（OPC + Agent + Binding）', async () => {
      // 创建 10 个 OPC，每个 10 个 Agent，每个 Agent 1 个 Binding
      for (let i = 0; i < 10; i++) {
        const opc = makeOpc(db, { name: `perf-opc-${i}` })
        for (let j = 0; j < 10; j++) {
          const agent = makeAgent(db, opc.id, { name: `agent-${i}-${j}` })
          const channel = makeChannel(db, opc.id)
          makeBinding(db, opc.id, agent.id, channel.id)
        }
      }

      const startTime = Date.now()
      const res = await request(app).post('/api/get_all_opcs').send({})
      const endTime = Date.now()

      expect(res.status).toBe(200)
      expect(res.body).toHaveLength(10)
      expect(endTime - startTime).toBeLessThan(5000)
    })
  })

  // --- 快照性能测试 ---
  describe('Snapshot Performance', () => {
    it('应快速创建配置快照', async () => {
      const opc = makeOpc(db)
      
      // 创建一些 Agent 和 Binding
      for (let i = 0; i < 20; i++) {
        const agent = makeAgent(db, opc.id)
        const channel = makeChannel(db, opc.id)
        makeBinding(db, opc.id, agent.id, channel.id)
      }

      const startTime = Date.now()
      const res = await request(app).post('/api/create_snapshot').send({
        opc_id: opc.id,
        label: 'Performance Test Snapshot'
      })
      const endTime = Date.now()

      expect(res.status).toBe(200)
      expect(endTime - startTime).toBeLessThan(3000) // 3 秒内完成
    })

    it('应快速恢复快照', async () => {
      const opc = makeOpc(db)
      
      // 创建配置
      for (let i = 0; i < 10; i++) {
        makeAgent(db, opc.id)
      }

      // 创建快照
      const snapshotRes = await request(app).post('/api/create_snapshot').send({
        opc_id: opc.id,
        label: 'Restore Test'
      })
      const snapshotId = snapshotRes.body

      // 修改配置（删除所有 Agent）
      const agents = await request(app).post('/api/get_agents').send({ opc_id: opc.id })
      for (const agent of agents.body) {
        await request(app).post('/api/delete_agent').send({ id: agent.id })
      }

      // 恢复快照
      const startTime = Date.now()
      const restoreRes = await request(app).post('/api/restore_snapshot').send({ id: snapshotId })
      const endTime = Date.now()

      expect(restoreRes.status).toBe(200)
      expect(endTime - startTime).toBeLessThan(5000)

      // 验证恢复成功
      const restoredAgents = await request(app).post('/api/get_agents').send({ opc_id: opc.id })
      expect(restoredAgents.body).toHaveLength(10)
    })
  })

  // --- 部署性能测试 ---
  describe('Deployment Performance', () => {
    it('应快速构建部署包', async () => {
      const opc = makeOpc(db)
      
      // 创建配置
      for (let i = 0; i < 10; i++) {
        makeAgent(db, opc.id)
      }

      const startTime = Date.now()
      const res = await request(app).post('/api/build_deploy_package').send({
        opc_id: opc.id
      })
      const endTime = Date.now()

      expect(res.status).toBe(200)
      expect(res.body.ok).toBe(true)
      expect(endTime - startTime).toBeLessThan(5000)
    })

    it('应快速生成 OpenClaw 配置', async () => {
      const opc = makeOpc(db)
      
      for (let i = 0; i < 20; i++) {
        makeAgent(db, opc.id, { name: `agent-${i}` })
      }

      const startTime = Date.now()
      const res = await request(app).post('/api/generate_openclaw_config').send({
        opc_id: opc.id
      })
      const endTime = Date.now()

      expect(res.status).toBe(200)
      expect(res.body).toHaveProperty('agents')
      expect(endTime - startTime).toBeLessThan(2000)
    })
  })

  // --- 并发性能测试 ---
  describe('Concurrent Performance', () => {
    it('应处理 50 个并发读取请求', async () => {
      const opc = makeOpc(db)
      for (let i = 0; i < 50; i++) {
        makeAgent(db, opc.id)
      }

      const startTime = Date.now()
      const promises = Array.from({ length: 50 }, () =>
        request(app).post('/api/get_agents').send({ opc_id: opc.id })
      )
      const results = await Promise.all(promises)
      const endTime = Date.now()

      results.forEach(r => expect(r.status).toBe(200))
      expect(endTime - startTime).toBeLessThan(10000) // 10 秒内完成
    })

    it('应处理 20 个并发写入请求', async () => {
      const opc = makeOpc(db)
      
      const startTime = Date.now()
      const promises = Array.from({ length: 20 }, (_, i) =>
        request(app).post('/api/create_agent').send({
          config: { opc_id: opc.id, name: `concurrent-${i}`, display_name: `Concurrent ${i}` }
        })
      )
      const results = await Promise.all(promises)
      const endTime = Date.now()

      const successCount = results.filter(r => r.status === 200).length
      expect(successCount).toBeGreaterThan(10) // 至少一半成功
      expect(endTime - startTime).toBeLessThan(10000)
    })
  })
})
