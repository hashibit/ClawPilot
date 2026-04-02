// Message Routing Skill
// 消息路由实现

/**
 * 路由消息到合适的 Agent
 * @param {string} message - 消息内容
 * @param {Array} routes - 路由规则
 * @returns {string} 目标 Agent ID
 */
function routeMessage(message, routes) {
  for (const route of routes) {
    const patterns = route.pattern.split('|');
    for (const pattern of patterns) {
      if (message.toLowerCase().includes(pattern.trim().toLowerCase())) {
        return route.agent;
      }
    }
  }
  return 'default';
}

/**
 * 分析消息意图
 */
function analyzeIntent(message) {
  const intents = {
    code: /代码 | 编程|bug|错误 | 调试/i,
    doc: /文档 | 帮助 | 说明 | 教程/i,
    question: /为什么 | 怎么 | 如何 | 什么/i,
    command: /执行 | 运行 | 创建 | 删除/i
  };

  for (const [intent, regex] of Object.entries(intents)) {
    if (regex.test(message)) {
      return intent;
    }
  }

  return 'general';
}

module.exports = {
  routeMessage,
  analyzeIntent
};
