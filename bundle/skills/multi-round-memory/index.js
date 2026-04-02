// Multi-Round Memory Skill
// 多轮对话记忆实现

const MEMORY_WINDOW = 10; // 保留最近 10 轮对话

/**
 * 存储对话记忆
 * @param {string} sessionId - 会话 ID
 * @param {string} role - 角色 (user/assistant)
 * @param {string} content - 消息内容
 */
async function storeMemory(sessionId, role, content) {
  const memories = await getMemories(sessionId);
  memories.push({ role, content, timestamp: Date.now() });

  // 保持记忆窗口大小
  while (memories.length > MEMORY_WINDOW) {
    memories.shift();
  }

  await saveMemories(sessionId, memories);
}

/**
 * 获取对话上下文
 * @param {string} sessionId - 会话 ID
 * @returns {Array} 对话历史
 */
async function getContext(sessionId) {
  return await getMemories(sessionId);
}

/**
 * 提取关键信息
 * @param {string} content - 消息内容
 * @returns {Array} 关键信息列表
 */
function extractKeyPoints(content) {
  const keypoints = [];

  // 提取命名实体
  const nameMatch = content.match(/我叫 (\w+)/);
  if (nameMatch) keypoints.push({ type: 'name', value: nameMatch[1] });

  // 提取偏好
  const prefMatch = content.match(/我喜欢 (\w+)/);
  if (prefMatch) keypoints.push({ type: 'preference', value: prefMatch[1] });

  return keypoints;
}

// 内部存储函数（由 OpenClaw 运行时提供）
function getMemories(sessionId) {
  // 由运行时实现
  return Promise.resolve([]);
}

function saveMemories(sessionId, memories) {
  // 由运行时实现
  return Promise.resolve();
}

module.exports = {
  storeMemory,
  getContext,
  extractKeyPoints
};
