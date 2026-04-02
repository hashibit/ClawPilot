// Memory Persistence Skill
// 记忆持久化实现

/**
 * 保存记忆
 * @param {string} category - 记忆分类
 * @param {string} key - 记忆键
 * @param {any} value - 记忆值
 */
async function saveMemory(category, key, value) {
  const memory = {
    category,
    key,
    value,
    createdAt: Date.now(),
    updatedAt: Date.now()
  };

  await storeToDatabase(memory);
  return memory;
}

/**
 * 加载记忆
 * @param {string} category - 记忆分类
 * @param {string} key - 记忆键
 * @returns {any}
 */
async function loadMemory(category, key) {
  const memory = await loadFromDatabase(category, key);
  return memory ? memory.value : null;
}

/**
 * 删除记忆
 */
async function deleteMemory(category, key) {
  await removeFromDatabase(category, key);
  return true;
}

/**
 * 列出某分类下的所有记忆
 */
async function listMemories(category) {
  return await listFromDatabase(category);
}

/**
 * 搜索记忆
 */
async function searchMemories(query) {
  const all = await listFromDatabase(null);
  return all.filter(m =>
    m.key.toLowerCase().includes(query.toLowerCase()) ||
    JSON.stringify(m.value).toLowerCase().includes(query.toLowerCase())
  );
}

// 数据库操作（由运行时实现）
function storeToDatabase(memory) { return Promise.resolve(); }
function loadFromDatabase(category, key) { return Promise.resolve(null); }
function removeFromDatabase(category, key) { return Promise.resolve(); }
function listFromDatabase(category) { return Promise.resolve([]); }

module.exports = {
  saveMemory,
  loadMemory,
  deleteMemory,
  listMemories,
  searchMemories
};
