/**
 * Snapshot 路由测试
 */
import { describe, it, expect, beforeEach } from 'vitest'
import request from 'supertest'
import { createTestDb, makeOpc, makeAgent, makeChannel, makeBinding } from '../helpers/db.js'
import { createTestApp } from '../helpers/app.js'

describe('Snapshot Routes', () => {
  let db, app, opc

  beforeEach(() => {
    db = createTestDb()
    app = createTestApp(db)
    opc = makeOpc(db)
  })

  // --- get_snapshots ---
  describe('get_snapshots', () => {
    it('返回空数组（无快照）', async () => {
      const res = await request(app).post('/api/get_snapshots').send({ opc_id: opc.id })
      expect(res.status).toBe(200)
      expect(res.body).toEqual([])
    })

    it('返回 OPC 的所有快照', async () => {
      await request(app).post('/api/create_snapshot').send({
        opc_id: opc.id,
        label: 'Snapshot 1'
      })
      await request(app).post('/api/create_snapshot').send({
        opc_id: opc.id,
        label: 'Snapshot 2'
      })

      const res = await request(app).post('/api/get_snapshots').send({ opc_id: opc.id })
      expect(res.status).toBe(200)
      expect(res.body).toHaveLength(2)
    })
  })

  // --- create_snapshot ---
  describe('create_snapshot', () => {
    it('创建配置快照', async () => {
      const agent = makeAgent(db, opc.id)
      makeAgent(db, opc.id)
      const channel = makeChannel(db, opc.id)
      makeBinding(db, opc.id, agent.id, channel.id)

      const res = await request(app).post('/api/create_snapshot').send({
        opc_id: opc.id,
        label: 'Full Config Snapshot'
      })
      expect(res.status).toBe(200)
      expect(res.body).toBeTruthy()
    })

    it('创建空配置快照', async () => {
      const res = await request(app).post('/api/create_snapshot').send({
        opc_id: opc.id,
        label: 'Empty Snapshot'
      })
      expect(res.status).toBe(200)
      expect(res.body).toBeTruthy()
    })

    it('快照包含 OPC 配置', async () => {
      const res = await request(app).post('/api/create_snapshot').send({
        opc_id: opc.id,
        label: 'Test Snapshot'
      })
      expect(res.status).toBe(200)

      const snapshotsRes = await request(app).post('/api/get_snapshots').send({ opc_id: opc.id })
      const snapshot = snapshotsRes.body[0]
      expect(snapshot.opc_name).toBe(opc.name)
    })

    it('快照包含 Agent 配置', async () => {
      makeAgent(db, opc.id, { display_name: 'Agent 1' })
      makeAgent(db, opc.id, { display_name: 'Agent 2' })

      const createRes = await request(app).post('/api/create_snapshot').send({
        opc_id: opc.id,
        label: 'With Agents'
      })

      const snapshotRes = await request(app).post('/api/get_snapshot').send({ id: createRes.body })
      const config = JSON.parse(snapshotRes.body.config_data)
      expect(config.agents).toHaveLength(2)
    })

    it('快照包含 Binding 配置', async () => {
      const agent = makeAgent(db, opc.id)
      const channel = makeChannel(db, opc.id)
      makeBinding(db, opc.id, agent.id, channel.id)

      const createRes = await request(app).post('/api/create_snapshot').send({
        opc_id: opc.id,
        label: 'With Bindings'
      })

      const snapshotRes = await request(app).post('/api/get_snapshot').send({ id: createRes.body })
      expect(snapshotRes.body.config_data).toBeTruthy()
      const config = JSON.parse(snapshotRes.body.config_data)
      expect(config).toHaveProperty('bindings')
    })
  })

  // --- restore_snapshot ---
  describe('restore_snapshot', () => {
    it('恢复快照到之前的状态', async () => {
      // 创建初始配置
      makeAgent(db, opc.id, { display_name: 'Agent 1' })
      makeAgent(db, opc.id, { display_name: 'Agent 2' })

      // 创建快照
      await request(app).post('/api/create_snapshot').send({
        opc_id: opc.id,
        label: 'Restore Point'
      })

      // 修改配置（删除一个 Agent）
      const agents = await request(app).post('/api/get_agents').send({ opc_id: opc.id })
      await request(app).post('/api/delete_agent').send({ id: agents.body[0].id })

      // 验证修改
      const agentsAfterDelete = await request(app).post('/api/get_agents').send({ opc_id: opc.id })
      expect(agentsAfterDelete.body).toHaveLength(1)

      // 恢复快照
      const snapshots = await request(app).post('/api/get_snapshots').send({ opc_id: opc.id })
      await request(app).post('/api/restore_snapshot').send({ id: snapshots.body[0].id })

      // 验证恢复成功
      const agentsAfterRestore = await request(app).post('/api/get_agents').send({ opc_id: opc.id })
      expect(agentsAfterRestore.body).toHaveLength(2)
    })

    it('恢复快照恢复 Binding 配置', async () => {
      const agent = makeAgent(db, opc.id)
      const channel = makeChannel(db, opc.id)
      makeBinding(db, opc.id, agent.id, channel.id)

      // 创建快照
      await request(app).post('/api/create_snapshot').send({
        opc_id: opc.id,
        label: 'With Binding'
      })

      // 删除 Binding
      const bindings = await request(app).post('/api/get_bindings').send({ opc_id: opc.id })
      await request(app).post('/api/delete_binding').send({ id: bindings.body[0].id })

      // 验证删除
      const bindingsAfterDelete = await request(app).post('/api/get_bindings').send({ opc_id: opc.id })
      expect(bindingsAfterDelete.body).toHaveLength(0)

      // 恢复快照
      const snapshots = await request(app).post('/api/get_snapshots').send({ opc_id: opc.id })
      await request(app).post('/api/restore_snapshot').send({ id: snapshots.body[0].id })

      // 验证恢复
      const bindingsAfterRestore = await request(app).post('/api/get_bindings').send({ opc_id: opc.id })
      expect(bindingsAfterRestore.body).toHaveLength(1)
    })

    it('恢复不存在的快照应失败', async () => {
      const res = await request(app).post('/api/restore_snapshot').send({ id: 'non-existent' })
      expect(res.status).toBe(500)
    })
  })

  // --- delete_snapshot ---
  describe('delete_snapshot', () => {
    it('删除快照', async () => {
      await request(app).post('/api/create_snapshot').send({
        opc_id: opc.id,
        label: 'To Delete'
      })

      const snapshots = await request(app).post('/api/get_snapshots').send({ opc_id: opc.id })
      await request(app).post('/api/delete_snapshot').send({ id: snapshots.body[0].id })

      const snapshotsAfterDelete = await request(app).post('/api/get_snapshots').send({ opc_id: opc.id })
      expect(snapshotsAfterDelete.body).toHaveLength(0)
    })
  })

  // --- 自动快照 ---
  describe('Auto Snapshots', () => {
    it('创建自动标记的快照', async () => {
      const res = await request(app).post('/api/create_snapshot').send({
        opc_id: opc.id,
        label: 'Auto Backup',
        is_auto: true
      })
      expect(res.status).toBe(200)

      const snapshots = await request(app).post('/api/get_snapshots').send({ opc_id: opc.id })
      expect([1, true]).toContain(snapshots.body[0].is_auto)
    })
  })
})
