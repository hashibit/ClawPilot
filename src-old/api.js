/**
 * ClawPilot — Tauri invoke 封装
 * 统一调用后端命令，处理错误
 */

const { invoke: _invoke } = window.__TAURI__?.core ?? {
  invoke: async (cmd, args) => {
    console.warn('[dev] Tauri not available, mocking:', cmd, args);
    return null;
  }
};

/**
 * 调用 Tauri 命令并统一处理错误
 * @param {string} command - 命令名称
 * @param {object} args - 参数
 * @returns {Promise<any>}
 */
async function invoke(command, args = {}) {
  try {
    return await _invoke(command, args);
  } catch (err) {
    console.error(`[invoke] ${command} failed:`, err);
    throw typeof err === 'string' ? new Error(err) : err;
  }
}

// ─── OPC ─────────────────────────────────────────────────────────────────────
export const opc = {
  getAll: () => invoke('get_all_opcs'),
  get: (id) => invoke('get_opc', { id }),
  create: (config) => invoke('create_opc', { config }),
  update: (id, config) => invoke('update_opc', { id, config }),
  delete: (id) => invoke('delete_opc', { id }),
  setCurrent: (id) => invoke('set_current_opc', { id }),
  getCurrent: () => invoke('get_current_opc'),
  getStats: (opcId) => invoke('get_opc_stats', { opcId }),
  export: (opcId) => invoke('export_opc', { opcId }),
  import: (json) => invoke('import_opc', { json }),
};

// ─── Agent ────────────────────────────────────────────────────────────────────
export const agent = {
  list: (opcId) => invoke('get_agents', { opcId }),
  get: (id) => invoke('get_agent', { id }),
  create: (config) => invoke('create_agent', { config }),
  update: (id, config) => invoke('update_agent', { id, config }),
  delete: (id) => invoke('delete_agent', { id }),
  reorder: (opcId, agentIds) => invoke('reorder_agents', { opcId, agentIds }),
  getDocument: (agentId, docType) => invoke('get_agent_document', { agentId, docType }),
  updateDocument: (agentId, docType, content) =>
    invoke('update_agent_document', { agentId, docType, content }),
};

// ─── Model ────────────────────────────────────────────────────────────────────
export const model = {
  getProviders: () => invoke('get_providers'),
  updateProvider: (config) => invoke('update_provider', { config }),
  getModels: () => invoke('get_models'),
  testProvider: (providerType) => invoke('test_provider', { providerType }),
};

// ─── Channel ──────────────────────────────────────────────────────────────────
export const channel = {
  list: (opcId) => invoke('get_channels', { opcId }),
  upsert: (config) => invoke('upsert_channel', { config }),
  delete: (id) => invoke('delete_channel', { id }),
  testFeishu: (appId, appSecret) =>
    invoke('test_feishu_connection', { appId, appSecret }),
};

// ─── Binding ──────────────────────────────────────────────────────────────────
export const binding = {
  list: (opcId) => invoke('get_bindings', { opcId }),
  create: (binding) => invoke('create_binding', { binding }),
  update: (id, binding) => invoke('update_binding', { id, binding }),
  delete: (id) => invoke('delete_binding', { id }),
  toggle: (id, isEnabled) => invoke('toggle_binding', { id, isEnabled }),
  getFeishuChannels: () => invoke('get_feishu_channels'),
};

// ─── Snapshot ─────────────────────────────────────────────────────────────────
export const snapshot = {
  list: (opcName) => invoke('get_snapshots', { opcName }),
  create: (opcName, label, configData) =>
    invoke('create_snapshot', { opcName, label, configData }),
  restore: (id) => invoke('restore_snapshot', { id }),
  delete: (id) => invoke('delete_snapshot', { id }),
};

// ─── Deployment ───────────────────────────────────────────────────────────────
export const deployment = {
  start: (opcName) => invoke('start_deployment', { opcName }),
  getStatus: (taskId) => invoke('get_deployment_status', { taskId }),
  cancel: (taskId) => invoke('cancel_deployment', { taskId }),
  getRecent: (opcName, limit = 20) =>
    invoke('get_recent_deployments', { opcName, limit }),
};

// ─── Log ──────────────────────────────────────────────────────────────────────
export const log = {
  get: (level = null, component = null, limit = 100) =>
    invoke('get_logs', { level, component, limit }),
  write: (level, component, message, agentId = null, channel = null) =>
    invoke('write_log', { level, component, message, agentId, channel }),
};

// ─── Tools & Skills ───────────────────────────────────────────────────────────
export const tools = {
  list: () => invoke('get_tools'),
  sync: () => invoke('sync_tools_from_clawhub'),
};

export const skills = {
  list: () => invoke('get_skills'),
  sync: () => invoke('sync_skills_from_clawhub'),
};

// Default export for convenience
export default { opc, agent, model, channel, binding, snapshot, deployment, log, tools, skills };
