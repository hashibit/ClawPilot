import { http, HttpResponse } from 'msw'

// 模拟数据
const mockOpcs = [
  { id: 'opc-1', name: 'Test OPC 1', display_name: 'Test OPC 1', description: '', is_active: 1, is_running: 0, agent_count: 2, channel_count: 1 },
  { id: 'opc-2', name: 'Test OPC 2', display_name: 'Test OPC 2', description: '', is_active: 0, is_running: 0, agent_count: 0, channel_count: 0 }
]

const mockAgents = [
  { id: 'agent-1', opc_id: 'opc-1', name: 'test_agent', display_name: 'Test Agent', job_title: 'Developer', order_index: 0 },
  { id: 'agent-2', opc_id: 'opc-1', name: 'assistant', display_name: 'Assistant', job_title: 'Helper', order_index: 1 }
]

const mockChannels = [
  { id: 1, opc_id: 'opc-1', channel_type: 'FEISHU', is_enabled: 1, is_connected: 0 }
]

const mockOffices = [
  { id: 'office-1', name: 'Test Office', address: 'Test Address', ownership: 'RENTED' }
]

const mockSkills = [
  { id: 1, name: 'test-skill', display_name: 'Test Skill', description: 'A test skill', is_local: 1, is_installed: 1 },
  { id: 2, name: 'remote-skill', display_name: 'Remote Skill', description: 'A remote skill', is_local: 0, is_installed: 0 }
]

const mockTools = [
  { id: 1, name: 'test-tool', display_name: 'Test Tool', description: 'A test tool', is_local: 1 }
]

export const handlers = [
  // OPC routes
  http.post('/api/get_all_opcs', () => {
    return HttpResponse.json(mockOpcs)
  }),

  http.post('/api/get_opc', async ({ request }) => {
    const { id } = await request.json()
    const opc = mockOpcs.find(o => o.id === id)
    return opc ? HttpResponse.json(opc) : HttpResponse.json({ error: 'Not found' }, { status: 404 })
  }),

  http.post('/api/create_opc', async ({ request }) => {
    const { opc } = await request.json()
    return HttpResponse.json(opc.id)
  }),

  http.post('/api/update_opc', async () => {
    return HttpResponse.json({ ok: true })
  }),

  http.post('/api/delete_opc', async () => {
    return HttpResponse.json({ ok: true })
  }),

  // Agent routes
  http.post('/api/get_agents', async ({ request }) => {
    const { opc_id } = await request.json()
    const agents = mockAgents.filter(a => a.opc_id === opc_id)
    return HttpResponse.json(agents)
  }),

  http.post('/api/get_agent', async ({ request }) => {
    const { id } = await request.json()
    const agent = mockAgents.find(a => a.id === id)
    return agent ? HttpResponse.json(agent) : HttpResponse.json({ error: 'Not found' }, { status: 404 })
  }),

  http.post('/api/create_agent', async ({ request }) => {
    const { agent } = await request.json()
    return HttpResponse.json(`agent-${Date.now()}`)
  }),

  http.post('/api/update_agent', async () => {
    return HttpResponse.json({ ok: true })
  }),

  http.post('/api/delete_agent', async () => {
    return HttpResponse.json({ ok: true })
  }),

  // Channel routes
  http.post('/api/get_channels', async ({ request }) => {
    const { opc_id } = await request.json()
    const channels = mockChannels.filter(c => c.opc_id === opc_id)
    return HttpResponse.json(channels)
  }),

  http.post('/api/create_channel', async ({ request }) => {
    const { channel } = await request.json()
    return HttpResponse.json({ id: Date.now(), ...channel })
  }),

  http.post('/api/update_channel', async () => {
    return HttpResponse.json({ ok: true })
  }),

  http.post('/api/delete_channel', async () => {
    return HttpResponse.json({ ok: true })
  }),

  // Office routes
  http.post('/api/get_offices', () => {
    return HttpResponse.json(mockOffices)
  }),

  http.post('/api/get_office', async ({ request }) => {
    const { id } = await request.json()
    const office = mockOffices.find(o => o.id === id)
    return office ? HttpResponse.json(office) : HttpResponse.json({ error: 'Not found' }, { status: 404 })
  }),

  http.post('/api/create_office', async ({ request }) => {
    const { office } = await request.json()
    return HttpResponse.json(office.id)
  }),

  http.post('/api/update_office', async () => {
    return HttpResponse.json({ ok: true })
  }),

  http.post('/api/delete_office', async () => {
    return HttpResponse.json({ ok: true })
  }),

  // Skill routes
  http.post('/api/get_skills', () => {
    return HttpResponse.json(mockSkills)
  }),

  http.post('/api/create_skill', async ({ request }) => {
    const { skill } = await request.json()
    return HttpResponse.json(Date.now())
  }),

  http.post('/api/delete_skill', async () => {
    return HttpResponse.json({ ok: true })
  }),

  // Tool routes
  http.post('/api/get_tools', () => {
    return HttpResponse.json(mockTools)
  }),

  http.post('/api/create_tool', async ({ request }) => {
    const { tool } = await request.json()
    return HttpResponse.json(Date.now())
  }),

  http.post('/api/delete_tool', async () => {
    return HttpResponse.json({ ok: true })
  }),

  // Current OPC
  http.post('/api/get_current_opc', () => {
    return HttpResponse.json({ current_opc: 'opc-1' })
  }),

  http.post('/api/set_current_opc', async () => {
    return HttpResponse.json({ ok: true })
  })
]

export const serverErrorHandlers = [
  http.post('/api/get_all_opcs', () => {
    return HttpResponse.json({ error: 'Server Error' }, { status: 500 })
  })
]
