// Context Compression Skill
// 上下文压缩实现

/**
 * 压缩对话上下文
 * @param {Array} messages - 对话历史
 * @param {Object} options - 配置选项
 * @returns {Array} 压缩后的对话
 */
function compressContext(messages, options = {}) {
  const { maxTokens = 4000, compressionRatio = 0.3 } = options;

  if (messages.length <= 3) {
    return messages;
  }

  // 保留最近的消息
  const recentCount = Math.ceil(messages.length * (1 - compressionRatio));
  const recent = messages.slice(-recentCount);

  // 摘要早期消息
  const earlyMessages = messages.slice(0, -recentCount);
  const summary = summarizeEarlyMessages(earlyMessages);

  return [{
    role: 'system',
    content: '早期对话摘要：' + summary
  }, ...recent];
}

/**
 * 摘要早期消息
 */
function summarizeEarlyMessages(messages) {
  const topics = new Set();
  const actions = [];

  for (const msg of messages) {
    // 提取主题
    if (msg.role === 'user') {
      const topic = msg.content.substring(0, 50);
      topics.add(topic + '...');
    }
    // 记录操作
    if (msg.role === 'assistant' && msg.content.includes('```')) {
      actions.push('提供了代码示例');
    }
  }

  return '用户询问了：' + Array.from(topics).slice(0, 3).join('; ') +
         '. 助手：' + actions.slice(0, 2).join('; ');
}

/**
 * 估算 token 数量
 */
function estimateTokens(text) {
  // 粗略估算：每 4 个字符约 1 个 token
  return Math.ceil(text.length / 4);
}

module.exports = {
  compressContext,
  summarizeEarlyMessages,
  estimateTokens
};
