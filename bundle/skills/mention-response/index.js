// Mention Response Skill
// 群聊 @ 响应实现

/**
 * 检查是否需要响应
 * @param {string} message - 消息内容
 * @param {string} agentName - Agent 名称
 * @returns {boolean}
 */
function shouldRespond(message, agentName) {
  // 检查 @mention
  if (message.includes('@' + agentName)) {
    return true;
  }

  // 检查昵称变体
  const variants = [
    agentName.toLowerCase(),
    agentName.replace(/_/g, ' '),
    agentName.replace(/-/g, ' ')
  ];

  for (const variant of variants) {
    if (message.toLowerCase().includes(variant)) {
      return true;
    }
  }

  return false;
}

/**
 * 提取 @ 的用户
 */
function extractMentions(message) {
  const mentions = [];
  const regex = /@(\w+)/g;
  let match;

  while ((match = regex.exec(message)) !== null) {
    mentions.push(match[1]);
  }

  return mentions;
}

module.exports = {
  shouldRespond,
  extractMentions
};
