// Tool Calling Skill
// 工具调用实现

/**
 * 选择最合适的工具
 * @param {string} task - 任务描述
 * @param {Array} availableTools - 可用工具列表
 * @returns {string} 选中的工具名称
 */
function selectTool(task, availableTools) {
  const taskLower = task.toLowerCase();

  const toolKeywords = {
    'search': ['搜索', '查找', '查询', 'search'],
    'file_read': ['读取', '打开', '查看', 'file', 'read'],
    'file_write': ['写入', '保存', '创建', 'write', 'save'],
    'code_exec': ['执行', '运行', '代码', 'code', 'run'],
    'web_fetch': ['网页', 'URL', 'fetch', 'http']
  };

  for (const [tool, keywords] of Object.entries(toolKeywords)) {
    if (availableTools.includes(tool)) {
      for (const keyword of keywords) {
        if (taskLower.includes(keyword)) {
          return tool;
        }
      }
    }
  }

  return availableTools[0] || null;
}

/**
 * 构建工具调用参数
 */
function buildToolParams(toolName, task) {
  switch (toolName) {
    case 'search':
      return { query: extractSearchQuery(task) };
    case 'file_read':
      return { path: extractFilePath(task) };
    case 'code_exec':
      return { code: extractCode(task), language: 'javascript' };
    default:
      return {};
  }
}

function extractSearchQuery(task) {
  const match = task.match(/搜索 (.+)/);
  return match ? match[1] : task;
}

function extractFilePath(task) {
  const match = task.match(/([\/\w.-]+\.\w+)/);
  return match ? match[1] : '';
}

function extractCode(task) {
  const match = task.match(/```[\w]*\n?([\s\S]*?)```/);
  return match ? match[1] : '';
}

module.exports = {
  selectTool,
  buildToolParams,
  extractSearchQuery,
  extractFilePath,
  extractCode
};
