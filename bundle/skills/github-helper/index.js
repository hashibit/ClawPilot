// GitHub Helper Skill
// GitHub 助手实现

const { execSync } = require('child_process');

/**
 * 执行 gh 命令
 */
function runGhCommand(args) {
  try {
    return execSync(`gh ${args.join(' ')}`, { encoding: 'utf8' });
  } catch (e) {
    return { error: e.message };
  }
}

/**
 * 列出仓库
 */
function listRepos(limit = 10) {
  const result = runGhCommand(['repo', 'list', '--limit', String(limit), '--json', 'name,owner,description']);
  return JSON.parse(result);
}

/**
 * 查看 Issue 列表
 */
function listIssues(owner, repo, limit = 10) {
  const result = runGhCommand(['issue', 'list', '--repo', `${owner}/${repo}`, '--limit', String(limit)]);
  return result;
}

/**
 * 创建 Issue
 */
function createIssue(owner, repo, title, body) {
  const result = runGhCommand(['issue', 'create', '--repo', `${owner}/${repo}`, '--title', title, '--body', body]);
  return result;
}

/**
 * 查看 PR 列表
 */
function listPRs(owner, repo) {
  const result = runGhCommand(['pr', 'list', '--repo', `${owner}/${repo}`]);
  return result;
}

/**
 * 创建 PR
 */
function createPR(owner, repo, title, branch, base = 'main') {
  const result = runGhCommand(['pr', 'create', '--repo', `${owner}/${repo}`, '--title', title, '--body', 'PR created by ClawPilot', '--head', branch, '--base', base]);
  return result;
}

/**
 * 查看 CI 运行状态
 */
function listRuns(owner, repo, limit = 5) {
  const result = runGhCommand(['run', 'list', '--repo', `${owner}/${repo}`, '--limit', String(limit)]);
  return result;
}

/**
 * 查看仓库信息
 */
function getRepoInfo(owner, repo) {
  const result = runGhCommand(['repo', 'view', `${owner}/${repo}`, '--json', 'name,description,stars,forks']);
  return JSON.parse(result);
}

module.exports = {
  runGhCommand,
  listRepos,
  listIssues,
  createIssue,
  listPRs,
  createPR,
  listRuns,
  getRepoInfo
};
