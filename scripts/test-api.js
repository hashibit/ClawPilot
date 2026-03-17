import assert from 'node:assert'
import { randomUUID } from 'crypto'

const BASE_URL = 'http://localhost:3001/api'

async function call(cmd, args = {}) {
  const res = await fetch(`${BASE_URL}/${cmd}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(args),
  })
  if (!res.ok) throw new Error(await res.text())
  return res.json()
}

let passed = 0
let failed = 0

function ok(label) {
  console.log(`✓ ${label}`)
  passed++
}

function fail(label, err) {
  console.log(`✗ ${label} → ${err.message}`)
  failed++
}

// ── Test Data ─────────────────────────────────────────────
const opcId = randomUUID()
const agentId = randomUUID()
const bindingId = randomUUID()
const now = () => Math.floor(Date.now() / 1000)

const opcConfig = {
  id: opcId,
  name: `test-opc-${opcId.slice(0, 8)}`,
  display_name: 'Test OPC',
  description: 'A test OPC',
  avatar_color: '#4f46e5',
  avatar_initials: 'TO',
  is_active: false,
  is_running: false,
  agent_count: 0,
  channel_count: 0,
  group_count: 0,
  dm_count: 0,
  message_count_today: 0,
  message_growth: 0.0,
  created_at: now(),
  updated_at: now(),
}

const agentConfig = {
  id: agentId,
  opc_id: opcId,
  name: `agent-${agentId.slice(0, 8)}`,
  display_name: 'Test Agent',
  job_title: 'Engineer',
  personality: 'Helpful',
  description: 'Test agent',
  initials: 'TA',
  gradient_start: '#4f46e5',
  gradient_end: '#7c3aed',
  is_default: false,
  order_index: 0,
  model_provider: 'BAILIAN',
  model_name: 'qwen-max',
  enabled_tools: ['search', 'code'],
  disabled_tools: [],
  enabled_skills: [],
  guardrail_rules: [],
  reports_to: [],
  manages: [],
  created_at: now(),
  updated_at: now(),
}

// ── Tests ─────────────────────────────────────────────────
async function runTests() {
  // OPC CRUD
  try {
    await call('create_opc', { config: opcConfig })
    ok('create_opc')
  } catch (err) { fail('create_opc', err) }

  try {
    const opcs = await call('get_all_opcs')
    assert(Array.isArray(opcs))
    const found = opcs.find(o => o.id === opcId)
    assert(found, 'opc not found in list')
    ok(`get_all_opcs (found ${opcs.filter(o => o.id === opcId).length} test opc)`)
  } catch (err) { fail('get_all_opcs', err) }

  try {
    const opc = await call('get_opc', { id: opcId })
    assert.strictEqual(opc.id, opcId)
    ok('get_opc')
  } catch (err) { fail('get_opc', err) }

  try {
    await call('set_current_opc', { id: opcId })
    ok('set_current_opc')
  } catch (err) { fail('set_current_opc', err) }

  try {
    const stats = await call('get_opc_stats', { opc_id: opcId })
    assert('agent_count' in stats)
    assert('message_growth' in stats)
    ok('get_opc_stats')
  } catch (err) { fail('get_opc_stats', err) }

  // Agent CRUD
  try {
    await call('create_agent', { config: agentConfig })
    ok('create_agent')
  } catch (err) { fail('create_agent', err) }

  try {
    const agents = await call('get_agents', { opc_id: opcId })
    assert(Array.isArray(agents))
    assert(agents.length >= 1, `expected >= 1 agent, got ${agents.length}`)
    assert(Array.isArray(agents[0].enabled_tools), 'enabled_tools should be array')
    ok(`get_agents (found ${agents.length})`)
  } catch (err) { fail('get_agents', err) }

  // Agent document
  try {
    const content = await call('get_agent_document', { agent_id: agentId, doc_type: 'SOUL' })
    assert.strictEqual(content, '', `expected empty string, got: ${content}`)
    ok('get_agent_document (empty)')
  } catch (err) { fail('get_agent_document (empty)', err) }

  try {
    await call('update_agent_document', { agent_id: agentId, doc_type: 'SOUL', content: 'You are a helpful agent.' })
    ok('update_agent_document')
  } catch (err) { fail('update_agent_document', err) }

  try {
    const content = await call('get_agent_document', { agent_id: agentId, doc_type: 'SOUL' })
    assert.strictEqual(content, 'You are a helpful agent.')
    ok('get_agent_document (has content)')
  } catch (err) { fail('get_agent_document (has content)', err) }

  try {
    await call('reorder_agents', { opc_id: opcId, agent_ids: [agentId] })
    ok('reorder_agents')
  } catch (err) { fail('reorder_agents', err) }

  // Providers
  try {
    const providers = await call('get_providers')
    assert(Array.isArray(providers))
    assert(providers.length >= 3, `expected >= 3 providers, got ${providers.length}`)
    ok(`get_providers (found ${providers.length})`)
  } catch (err) { fail('get_providers', err) }

  try {
    // Reset BAILIAN key to empty so test is deterministic
    const p = (await call('get_providers')).find(p => p.provider_type === 'BAILIAN')
    await call('update_provider', { config: { ...p, api_key: '', is_available: false } })
    const result = await call('test_provider', { provider_type: 'BAILIAN' })
    assert.strictEqual(result, false, `expected false (no api_key), got ${result}`)
    ok('test_provider (BAILIAN → false, no api_key)')
  } catch (err) { fail('test_provider (BAILIAN → false, no api_key)', err) }

  // Channel
  let channelId
  try {
    channelId = await call('upsert_channel', {
      config: {
        id: '0',
        opc_id: opcId,
        channel_type: 'FEISHU',
        is_enabled: true,
        feishu_config: { app_id: 'cli_xxx', app_secret: 'secret_xxx' },
        is_connected: false,
        created_at: now(),
        updated_at: now(),
      }
    })
    assert(typeof channelId === 'number', `expected number, got ${typeof channelId}`)
    ok('upsert_channel')
  } catch (err) { fail('upsert_channel', err) }

  try {
    const channels = await call('get_channels', { opc_id: opcId })
    assert(Array.isArray(channels))
    assert(channels.length >= 1)
    ok(`get_channels (found ${channels.length})`)
  } catch (err) { fail('get_channels', err) }

  try {
    const ok2 = await call('test_feishu_connection', { app_id: 'cli_xxx', app_secret: 'secret_xxx' })
    assert.strictEqual(ok2, true)
    ok('test_feishu_connection')
  } catch (err) { fail('test_feishu_connection', err) }

  // Binding
  const bindingData = {
    id: bindingId,
    opc_id: opcId,
    channel_id: String(channelId ?? 1),
    channel_name: 'general',
    channel_type: 'GROUP',
    agent_id: agentId,
    agent_name: 'Test Agent',
    trigger_mode: 'MENTION',
    is_enabled: true,
    created_at: now(),
    updated_at: now(),
  }

  try {
    await call('create_binding', { binding: bindingData })
    ok('create_binding')
  } catch (err) { fail('create_binding', err) }

  try {
    const bindings = await call('get_bindings', { opc_id: opcId })
    assert(Array.isArray(bindings))
    assert(bindings.length >= 1)
    ok(`get_bindings (found ${bindings.length})`)
  } catch (err) { fail('get_bindings', err) }

  try {
    await call('toggle_binding', { id: bindingId, is_enabled: false })
    const b = await call('get_binding', { id: bindingId })
    assert.strictEqual(b.is_enabled, false)
    ok('toggle_binding')
  } catch (err) { fail('toggle_binding', err) }

  // Deployment
  let taskId
  try {
    taskId = await call('start_deployment', { opc_name: opcConfig.name })
    assert(typeof taskId === 'string')
    ok('start_deployment')
  } catch (err) { fail('start_deployment', err) }

  try {
    const task = await call('get_deployment_status', { task_id: taskId })
    assert(['PENDING', 'RUNNING', 'SUCCESS'].includes(task.status), `unexpected status: ${task.status}`)
    ok(`get_deployment_status (${task.status})`)
  } catch (err) { fail('get_deployment_status (PENDING or RUNNING)', err) }

  try {
    const deployments = await call('get_recent_deployments', { opc_name: opcConfig.name, limit: 5 })
    assert(Array.isArray(deployments))
    assert(deployments.length >= 1)
    ok('get_recent_deployments')
  } catch (err) { fail('get_recent_deployments', err) }

  // Log
  try {
    await call('write_log', { level: 'INFO', component: 'test', message: 'Test log entry' })
    ok('write_log')
  } catch (err) { fail('write_log', err) }

  try {
    const logs = await call('get_logs', { limit: 50 })
    assert(Array.isArray(logs))
    assert(logs.length >= 1)
    ok(`get_logs (found ${logs.length})`)
  } catch (err) { fail('get_logs (found ≥1)', err) }

  // Snapshot
  const snapshotConfigData = JSON.stringify({
    opc: opcConfig,
    agents: [agentConfig],
    agent_documents: [],
    channels: [],
    bindings: [],
  })

  let snapshotId
  try {
    snapshotId = await call('create_snapshot', {
      opc_name: opcConfig.name,
      label: 'Test snapshot v1',
      config_data: snapshotConfigData,
    })
    assert(typeof snapshotId === 'string')
    ok('create_snapshot')
  } catch (err) { fail('create_snapshot', err) }

  try {
    const snaps = await call('get_snapshots', { opc_name: opcConfig.name })
    assert(Array.isArray(snaps))
    assert(snaps.length >= 1)
    ok(`get_snapshots (found ${snaps.length})`)
  } catch (err) { fail('get_snapshots (found 1)', err) }

  try {
    const restoredId = await call('restore_snapshot', { id: snapshotId })
    assert.strictEqual(restoredId, opcId)
    ok('restore_snapshot')
  } catch (err) { fail('restore_snapshot', err) }

  try {
    await call('delete_snapshot', { id: snapshotId })
    ok('delete_snapshot')
  } catch (err) { fail('delete_snapshot', err) }

  // Cleanup
  try {
    await call('delete_binding', { id: bindingId })
    ok('delete_binding')
  } catch (err) { fail('delete_binding', err) }

  try {
    await call('delete_agent', { id: agentId })
    ok('delete_agent')
  } catch (err) { fail('delete_agent', err) }

  // Export before delete
  try {
    const json = await call('export_opc', { opc_id: opcId })
    assert(typeof json === 'string')
    const parsed = JSON.parse(json)
    assert(parsed.opc)
    ok('export_opc (json string)')
  } catch (err) { fail('export_opc (json string)', err) }

  try {
    await call('delete_opc', { id: opcId })
    ok('delete_opc')
  } catch (err) { fail('delete_opc', err) }

  // get_opc after delete should throw
  try {
    await call('get_opc', { id: opcId })
    fail('get_opc (should throw after delete)', new Error('expected error but got success'))
  } catch (err) {
    if (err.message.includes('Not found') || err.message.includes(opcId)) {
      ok('get_opc (should throw after delete)')
    } else {
      fail('get_opc (should throw after delete)', err)
    }
  }

  // Summary
  console.log('')
  if (failed === 0) {
    console.log(`✓ All tests passed (${passed}/${passed + failed})`)
  } else {
    console.log(`Summary: ${passed} passed, ${failed} failed`)
    process.exit(1)
  }
}

runTests().catch(err => {
  console.error('Fatal error:', err)
  process.exit(1)
})
