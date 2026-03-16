/**
 * logs.js — 运行日志页
 */
import { log } from '../api.js';
import { showToast, escapeHtml } from '../main.js';

let currentLevel = null;
let currentComponent = null;
let autoRefresh = false;
let refreshTimer = null;
const LIMIT = 200;

document.addEventListener('DOMContentLoaded', () => {
  setupFilters();
  loadLogs();
});

// ─── 筛选器 ───────────────────────────────────────────────────────────────────

function setupFilters() {
  const levelSel = document.getElementById('log-level-filter');
  const compSel = document.getElementById('log-component-filter');

  levelSel?.addEventListener('change', () => {
    currentLevel = levelSel.value || null;
    loadLogs();
  });
  compSel?.addEventListener('change', () => {
    currentComponent = compSel.value || null;
    loadLogs();
  });

  // 自动刷新切换
  document.addEventListener('click', (e) => {
    if (e.target.closest('#btn-toggle-refresh')) {
      autoRefresh = !autoRefresh;
      const btn = document.getElementById('btn-toggle-refresh');
      const dot = document.getElementById('refresh-dot');
      const label = document.getElementById('refresh-label');
      if (autoRefresh) {
        refreshTimer = setInterval(loadLogs, 3000);
        if (dot) { dot.style.background = '#34c759'; }
        if (label) label.textContent = '实时';
        if (btn) btn.title = '停止自动刷新';
      } else {
        clearInterval(refreshTimer);
        refreshTimer = null;
        if (dot) dot.style.background = '#48484A';
        if (label) label.textContent = '已暂停';
      }
    }

    // 清空
    if (e.target.closest('#btn-clear-logs')) {
      const container = document.getElementById('log-container');
      if (container) container.innerHTML = '';
    }

    // 导出
    if (e.target.closest('#btn-export-logs')) {
      exportLogs();
    }
  });
}

// ─── 加载日志 ─────────────────────────────────────────────────────────────────

async function loadLogs() {
  try {
    const logs = await log.get(currentLevel, currentComponent, LIMIT);
    renderLogs(logs);
  } catch (err) {
    showToast('加载日志失败: ' + err.message, 'error');
  }
}

function renderLogs(logs) {
  const container = document.getElementById('log-container');
  if (!container) return;

  if (!logs?.length) {
    container.innerHTML = '<div style="padding:10px;font-size:12px;color:#636366;text-align:center;">暂无日志</div>';
    return;
  }

  const levelClass = { info: 'log-info', warn: 'log-warn', error: 'log-error', debug: 'log-debug' };
  container.innerHTML = logs.map(entry => {
    const lvl = (entry.level ?? 'info').toLowerCase();
    const cls = levelClass[lvl] ?? 'log-info';
    const ts = entry.timestamp ? new Date(entry.timestamp).toLocaleString('zh-CN', { hour12: false }) : '';
    const comp = entry.component ? `[${entry.component}] ` : '';
    return `<div class="log-line ${cls}">[${ts}] [${lvl.toUpperCase().padEnd(5)}] ${escapeHtml(comp)}${escapeHtml(entry.message ?? '')}</div>`;
  }).join('');

  // 自动滚动到底部
  container.scrollTop = container.scrollHeight;
}

// ─── 导出日志 ─────────────────────────────────────────────────────────────────

async function exportLogs() {
  try {
    const logs = await log.get(currentLevel, currentComponent, 1000);
    const text = logs.map(e => {
      const ts = e.timestamp ? new Date(e.timestamp).toISOString() : '';
      return `[${ts}] [${(e.level ?? 'INFO').toUpperCase()}] ${e.component ?? ''} ${e.message ?? ''}`;
    }).join('\n');
    const blob = new Blob([text], { type: 'text/plain' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `clawpilot-logs-${new Date().toISOString().slice(0, 10)}.txt`;
    a.click();
    showToast('日志已导出', 'success');
  } catch (err) {
    showToast('导出失败: ' + err.message, 'error');
  }
}
