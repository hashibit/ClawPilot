// Direct Response Skill
// 私聊直接响应实现

/**
 * 检查是否是私聊消息
 * @param {Object} channel - 频道信息
 * @returns {boolean}
 */
function isDirectMessage(channel) {
  return channel.type === 'direct' || channel.type === 'dm';
}

/**
 * 检查是否需要响应（私聊中总是响应）
 */
function shouldRespond(message, channel) {
  return isDirectMessage(channel);
}

module.exports = {
  isDirectMessage,
  shouldRespond
};
