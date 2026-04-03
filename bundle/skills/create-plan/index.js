// create-plan skill
// 多智能体任务计划创建

const fs = require('fs');
const path = require('path');
const http = require('http');
const os = require('os');

const DAEMON_BASE_URL = 'http://127.0.0.1:16668';

/**
 * 读取 daemon API key
 */
function loadDaemonKey() {
  const keyPath = path.join(os.homedir(), '.clawpilot', 'daemon.key');
  try {
    return fs.readFileSync(keyPath, 'utf8').trim();
  } catch {
    throw new Error(`无法读取 daemon key：${keyPath} 不存在`);
  }
}

/**
 * 从 OpenClaw 系统提示中提取 sender_id
 * 系统提示格式：Conversation info: "sender_id": "ou_xxx"
 */
function extractSenderId(systemPrompt) {
  const match = systemPrompt.match(/"sender_id":\s*"([^"]+)"/);
  return match ? match[1] : null;
}

/**
 * 生成 Plan ID
 * 格式：{prefix}-{YYYYMMDDTHHmm}
 */
function generatePlanId(prefix) {
  const now = new Date();
  const pad = (n) => String(n).padStart(2, '0');
  const timestamp = `${now.getFullYear()}${pad(now.getMonth() + 1)}${pad(now.getDate())}T${pad(now.getHours())}${pad(now.getMinutes())}`;
  return `${prefix}-${timestamp}`;
}

/**
 * 调用 daemon HTTP API
 */
function daemonRequest(method, pathname, body, apiKey) {
  return new Promise((resolve, reject) => {
    const payload = body ? JSON.stringify(body) : null;
    const options = {
      hostname: '127.0.0.1',
      port: 16668,
      path: pathname,
      method,
      headers: {
        'Authorization': `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
        ...(payload ? { 'Content-Length': Buffer.byteLength(payload) } : {}),
      },
    };

    const req = http.request(options, (res) => {
      let data = '';
      res.on('data', (chunk) => data += chunk);
      res.on('end', () => {
        try {
          const json = JSON.parse(data);
          if (res.statusCode >= 400) {
            reject(new Error(json.error || `HTTP ${res.statusCode}`));
          } else {
            resolve(json);
          }
        } catch {
          reject(new Error(`无法解析响应：${data}`));
        }
      });
    });

    req.on('error', reject);
    if (payload) req.write(payload);
    req.end();
  });
}

/**
 * 创建 Plan
 *
 * @param {object} opts
 * @param {string} opts.idPrefix        - Plan ID 前缀，如 "develop-crm-website"
 * @param {string} opts.publisherAgentId - 领队 agent id
 * @param {string} opts.systemPrompt    - OpenClaw 注入的系统提示（用于提取 sender_id）
 * @param {string} opts.content         - 计划内容摘要
 * @param {Array}  opts.tasks           - 任务列表，每项：{ id, receiverAgentId, type, params, resultSchema, timeoutSeconds }
 * @param {Array}  opts.dependencies    - 依赖列表，每项：{ taskId, dependsOnTaskId }
 * @returns {Promise<object>} 创建的 Plan 对象
 */
async function createPlan({ idPrefix, publisherAgentId, systemPrompt, content, tasks, dependencies = [] }) {
  const apiKey = loadDaemonKey();
  const senderId = extractSenderId(systemPrompt);
  const planId = generatePlanId(idPrefix);

  const body = {
    id: planId,
    publisher_agent_id: publisherAgentId,
    reply_channel: senderId ? 'feishu' : null,
    reply_to: senderId,
    content,
    tasks: tasks.map((t) => ({
      id: t.id,
      receiver_agent_id: t.receiverAgentId,
      type: t.type,
      priority: t.priority ?? 0,
      params: typeof t.params === 'string' ? t.params : JSON.stringify(t.params),
      result_schema: typeof t.resultSchema === 'string' ? t.resultSchema : JSON.stringify(t.resultSchema ?? {}),
      timeout_seconds: t.timeoutSeconds ?? 3600,
    })),
    dependencies: dependencies.map((d) => ({
      task_id: d.taskId,
      depends_on_task_id: d.dependsOnTaskId,
    })),
  };

  return daemonRequest('POST', '/api/plans', body, apiKey);
}

/**
 * 审批执行 Plan
 */
async function approvePlan(planId) {
  const apiKey = loadDaemonKey();
  return daemonRequest('PATCH', `/api/plans/${planId}/approve`, null, apiKey);
}

/**
 * 取消 Plan
 */
async function cancelPlan(planId) {
  const apiKey = loadDaemonKey();
  return daemonRequest('PATCH', `/api/plans/${planId}/cancel`, null, apiKey);
}

/**
 * 查询 Plan 状态
 */
async function getPlan(planId) {
  const apiKey = loadDaemonKey();
  return daemonRequest('GET', `/api/plans/${planId}`, null, apiKey);
}

/**
 * 将 Plan 格式化为飞书展示文本
 */
function formatPlanForFeishu(plan, tasks) {
  const lines = [
    `📋 任务计划：${plan.id}`,
    '',
    plan.content,
    '',
    '步骤：',
  ];

  tasks.forEach((t, i) => {
    const deps = t.depends_on?.length ? `（依赖步骤 ${t.depends_on.join('、')}）` : '';
    lines.push(`${i + 1}. [${t.type}] → ${t.receiver_agent_id}${deps}`);
  });

  lines.push('', '回复「确认」开始执行，回复「取消」放弃。');
  return lines.join('\n');
}

module.exports = {
  createPlan,
  approvePlan,
  cancelPlan,
  getPlan,
  extractSenderId,
  generatePlanId,
  formatPlanForFeishu,
};
