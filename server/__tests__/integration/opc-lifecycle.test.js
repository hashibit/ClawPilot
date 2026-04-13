import { describe, it, expect, beforeEach } from 'vitest'
import request from 'supertest'
import { createTestDb, makeOpc, makeAgent, makeChannel, makeBinding, makeOffice } from '../helpers/db.js'
import { createTestApp } from '../helpers/app.js'

describe('OPC Lifecycle Integration', () => {
  let db, app

  beforeEach(() => {
    db = createTestDb()
    app = createTestApp(db)
  })

  it('完整OPC创建和删除流程', async () => {
    // 1. 创建OPC
    const opcData = {
      id: `opc-integration-${Date.now()}`,
      name: 'Integration Test OPC',
      display_name: 'Integration Test'
    }
    const createRes = await request(app).post('/api/create_opc').send({ config: opcData })
    expect(createRes.status).toBe(200)

    // 2. 验证创建成功
    const getRes = await request(app).post('/api/get_opc').send({ id: opcData.id })
    expect(getRes.body.display_name).toBe('Integration Test')

    // 3. 设置当前OPC
    const setRes = await request(app).post('/api/set_current_opc').send({ id: opcData.id })
    expect(setRes.body.ok).toBe(true)

    // 4. 获取当前OPC
    const currentRes = await request(app).post('/api/get_current_opc').send({})
    expect(currentRes.body.id).toBe(opcData.id)

    // 5. 删除OPC
    const deleteRes = await request(app).post('/api/delete_opc').send({ id: opcData.id })
    expect(deleteRes.status).toBe(200)

    // 6. 验证删除成功
    const getAfterDelete = await request(app).post('/api/get_opc').send({ id: opcData.id })
    expect(getAfterDelete.status).toBe(500)
  })

  it('OPC包含Agent时的级联删除', async () => {
    // 创建OPC和Agent
    const opc = makeOpc(db)
    makeAgent(db, opc.id)
    makeAgent(db, opc.id)

    // 验证Agent存在
    const agentsRes = await request(app).post('/api/get_agents').send({ opc_id: opc.id })
    expect(agentsRes.body).toHaveLength(2)

    // 删除OPC
    await request(app).post('/api/delete_opc').send({ id: opc.id })

    // 验证Agent也被删除（级联）
    const agentsAfterDelete = await request(app).post('/api/get_agents').send({ opc_id: opc.id })
    expect(agentsAfterDelete.body).toHaveLength(0)
  })

  it('OPC统计信息自动更新', async () => {
    const opc = makeOpc(db)

    // 初始状态
    let getRes = await request(app).post('/api/get_opc').send({ id: opc.id })
    expect(getRes.body.agent_count).toBe(0)
    expect(getRes.body.channel_count).toBe(0)

    // 添加Agent和Channel
    makeAgent(db, opc.id)
    makeAgent(db, opc.id)
    makeChannel(db, opc.id)

    // 更新统计
    await request(app).post('/api/update_opc_stats').send({ id: opc.id })

    // 验证统计更新
    getRes = await request(app).post('/api/get_opc').send({ id: opc.id })
    expect(getRes.body.agent_count).toBe(2)
    expect(getRes.body.channel_count).toBe(1)
  })
})

describe('Agent-Binding Integration', () => {
  let db, app, opc, agent, channel

  beforeEach(() => {
    db = createTestDb()
    app = createTestApp(db)
    opc = makeOpc(db)
    agent = makeAgent(db, opc.id)
    channel = makeChannel(db, opc.id)
  })

  it('创建Agent并绑定到Channel', async () => {
    // 创建Binding
    const bindingData = {
      opc_id: opc.id,
      channel_id: channel.id,
      channel_name: channel.channel_type,
      channel_type: channel.channel_type,
      agent_id: agent.id,
      agent_name: agent.display_name,
      trigger_mode: 'MENTION'
    }

    const createRes = await request(app).post('/api/create_binding').send({ binding: bindingData })
    expect(createRes.status).toBe(200)

    // 验证Binding创建
    const bindingsRes = await request(app).post('/api/get_bindings').send({ opc_id: opc.id })
    expect(bindingsRes.body).toHaveLength(1)
    expect(bindingsRes.body[0].agent_id).toBe(agent.id)

    // 删除Agent，验证Binding是否被级联删除
    await request(app).post('/api/delete_agent').send({ id: agent.id })

    const bindingsAfterDelete = await request(app).post('/api/get_bindings').send({ opc_id: opc.id })
    expect(bindingsAfterDelete.body).toHaveLength(0)
  })

  it('Channel删除时级联删除Binding', async () => {
    makeBinding(db, opc.id, agent.id, channel.id)

    // 验证Binding存在
    const bindingsRes = await request(app).post('/api/get_bindings').send({ opc_id: opc.id })
    expect(bindingsRes.body).toHaveLength(1)

    // 删除Channel
    await request(app).post('/api/delete_channel').send({ id: channel.id })

    // 验证Binding也被删除
    const bindingsAfterDelete = await request(app).post('/api/get_bindings').send({ opc_id: opc.id })
    expect(bindingsAfterDelete.body).toHaveLength(0)
  })
})

describe('Snapshot-Restore Integration', () => {
  let db, app, opc

  beforeEach(() => {
    db = createTestDb()
    app = createTestApp(db)
    opc = makeOpc(db)
  })

  it('创建快照并恢复完整配置', async () => {
    // 创建完整配置
    const agent1 = makeAgent(db, opc.id, { display_name: 'Agent 1' })
    const agent2 = makeAgent(db, opc.id, { display_name: 'Agent 2' })
    const channel = makeChannel(db, opc.id)
    makeBinding(db, opc.id, agent1.id, channel.id)

    // 创建快照
    const snapshotRes = await request(app).post('/api/create_snapshot').send({
      opc_id: opc.id,
      label: 'Full Config Snapshot'
    })
    const snapshotId = snapshotRes.body
    expect(snapshotRes.status).toBe(200)

    // 修改配置（删除一个Agent）
    await request(app).post('/api/delete_agent').send({ id: agent2.id })

    // 验证修改
    const agentsBeforeRestore = await request(app).post('/api/get_agents').send({ opc_id: opc.id })
    expect(agentsBeforeRestore.body).toHaveLength(1)

    // 恢复快照
    const restoreRes = await request(app).post('/api/restore_snapshot').send({ id: snapshotId })
    expect(restoreRes.status).toBe(200)

    // 验证恢复成功
    const agentsAfterRestore = await request(app).post('/api/get_agents').send({ opc_id: opc.id })
    expect(agentsAfterRestore.body).toHaveLength(2)

    const bindingsAfterRestore = await request(app).post('/api/get_bindings').send({ opc_id: opc.id })
    expect(bindingsAfterRestore.body).toHaveLength(1)
  })
})

describe('Deployment Flow Integration', () => {
  let db, app, opc, office

  beforeEach(() => {
    db = createTestDb()
    app = createTestApp(db)
    opc = makeOpc(db)
    office = makeOffice(db)
  })

  it('构建部署包流程', async () => {
    // 创建一些Agent
    makeAgent(db, opc.id)
    makeAgent(db, opc.id)

    // 构建部署包
    const buildRes = await request(app).post('/api/build_deploy_package').send({
      opc_id: opc.id
    })
    expect(buildRes.status).toBe(200)
    expect(buildRes.body.ok).toBe(true)
    expect(buildRes.body).toHaveProperty('checksum')
    expect(buildRes.body).toHaveProperty('size')
  })

  it('生成OpenClaw配置', async () => {
    makeAgent(db, opc.id, { name: 'test_agent', display_name: 'Test Agent' })

    const res = await request(app).post('/api/generate_openclaw_config').send({
      opc_id: opc.id
    })
    expect(res.status).toBe(200)
    expect(res.body).toHaveProperty('agents')
    // agents now uses $include format; actual list is in _sections
    expect(res.body.agents).toHaveProperty('$include')
    expect(res.body._sections.agents).toHaveProperty('list')
    expect(res.body._sections.agents.list).toHaveLength(1)
  })

  it('部署任务生命周期', async () => {
    // 开始部署（无daemon配置，将使用stub模式）
    const deployRes = await request(app).post('/api/start_deployment').send({
      opc_id: opc.id,
      office_id: office.id
    })
    expect(deployRes.status).toBe(200)

    const taskId = deployRes.body
    expect(typeof taskId).toBe('string')

    // 获取部署状态
    const statusRes = await request(app).post('/api/get_deployment_status').send({
      task_id: taskId
    })
    expect(statusRes.status).toBe(200)
    expect(statusRes.body).toHaveProperty('status')

    // 取消部署
    const cancelRes = await request(app).post('/api/cancel_deployment').send({
      task_id: taskId
    })
    expect(cancelRes.status).toBe(200)
  })

  it('获取部署历史', async () => {
    // 创建一些部署记录
    await request(app).post('/api/start_deployment').send({
      opc_id: opc.id,
      office_id: office.id
    })

    const historyRes = await request(app).post('/api/get_recent_deployments').send({
      opc_id: opc.id,
      limit: 10
    })
    expect(historyRes.status).toBe(200)
    expect(historyRes.body.length).toBeGreaterThan(0)
  })
})
