/**
 * deploy.js — 一键部署页
 */
import { opc, deployment, log } from '../api.js';
import { showToast, confirmDialog, escapeHtml, relativeTime } from '../main.js';

let currentOpcName = null;
let currentTaskId = null;
let pollTimer = null;

document.addEventListener('DOMContentLoaded', async () => {
  await loadCurrentOpc();
  await loadRecentDeployments();
  bindDeployButton();
});

// ─── 加载当前 OPC ─────────────────────────────────────────────────────────────

async function loadCurrentOpc() {
  try {
    const current = await opc.getCurrent();
    if (current) {
      currentOpcName = current.name;
      const nameEl = document.getElementById('deploy-opc-name');
      if (nameEl) nameEl.textContent = current.name;
    }
  } catch (_) {}
}

// ─── 最近部署记录 ─────────────────────────────────────────────────────────────

async function loadRecentDeployments() {
  if (!currentOpcName) return;
  try {
    const records = await deployment.getRecent(currentOpcName, 5);
    renderRecentDeployments(records);
  } catch (_) {}
}

function renderRecentDeployments(records) {
  const container = document.getElementById('recent-deployments');
  if (!container) return;
  if (!records?.length) {
    container.innerHTML = '<div class="group-row text-xs text-dimmer" style="justify-content:center;">暂无部署记录</div>';
    return;
  }
  container.innerHTML = records.map(r => {
    const statusColor = r.status === 'success' ? '#34c759' : r.status === 'failed' ? '#ff453a' : '#f59e0b';
    const statusLabel = r.status === 'success' ? '成功' : r.status === 'failed' ? '失败' : '进行中';
    return `
      <div class="group-row">
        <div style="width:8px;height:8px;border-radius:50%;background:${statusColor};flex-shrink:0;"></div>
        <div style="flex:1;margin-left:8px;">
          <div class="text-xs text-medium" style="color:#EBEBF5;">${escapeHtml(r.opc_name)}</div>
          <div class="text-xs text-dimmer">${relativeTime(r.created_at)}</div>
        </div>
        <span style="font-size:11px;color:${statusColor};">${statusLabel}</span>
      </div>
    `;
  }).join('');
}

// ─── 部署按钮 ─────────────────────────────────────────────────────────────────

function bindDeployButton() {
  document.addEventListener('click', async (e) => {
    const btn = e.target.closest('#btn-deploy');
    if (!btn) return;
    if (!currentOpcName) {
      showToast('请先选择一个 OPC 公司', 'warning');
      return;
    }
    const ok = await confirmDialog(`确定要部署「${currentOpcName}」吗？这将重启 OpenClaw 服务。`);
    if (!ok) return;
    await startDeploy();
  });

  document.addEventListener('click', async (e) => {
    if (e.target.closest('#btn-cancel-deploy') && currentTaskId) {
      try {
        await deployment.cancel(currentTaskId);
        clearInterval(pollTimer);
        pollTimer = null;
        showToast('已取消部署', 'info');
        updateProgress(0, 'cancelled');
      } catch (err) {
        showToast('取消失败: ' + err.message, 'error');
      }
    }
  });
}

async function startDeploy() {
  const btn = document.getElementById('btn-deploy');
  if (btn) { btn.disabled = true; btn.textContent = '部署中...'; }
  try {
    const task = await deployment.start(currentOpcName);
    currentTaskId = task.task_id;
    updateProgress(0, 'running');
    pollStatus();
  } catch (err) {
    showToast('部署启动失败: ' + err.message, 'error');
    if (btn) { btn.disabled = false; btn.textContent = '立即部署'; }
  }
}

function pollStatus() {
  if (pollTimer) clearInterval(pollTimer);
  pollTimer = setInterval(async () => {
    try {
      const status = await deployment.getStatus(currentTaskId);
      updateProgress(status.progress ?? 0, status.status);
      renderDeployLog(status.logs ?? []);

      if (status.status === 'success' || status.status === 'failed' || status.status === 'cancelled') {
        clearInterval(pollTimer);
        pollTimer = null;
        const btn = document.getElementById('btn-deploy');
        if (btn) { btn.disabled = false; btn.textContent = '立即部署'; }
        if (status.status === 'success') {
          showToast('部署成功！', 'success');
          const lastDeploy = document.getElementById('last-deploy-time');
          if (lastDeploy) lastDeploy.textContent = '刚刚';
        } else if (status.status === 'failed') {
          showToast('部署失败，请查看日志', 'error');
        }
        await loadRecentDeployments();
      }
    } catch (err) {
      clearInterval(pollTimer);
      pollTimer = null;
    }
  }, 1500);
}

function updateProgress(percent, status) {
  const bar = document.getElementById('deploy-progress-bar');
  if (bar) {
    bar.style.width = `${percent}%`;
    if (status === 'failed') bar.style.background = '#ff453a';
    else if (status === 'success') bar.style.background = '#34c759';
    else bar.style.background = 'linear-gradient(90deg,#8b5cf6,#06b6d4)';
  }
  // 更新步骤状态
  updateStepStatus(status, percent);
}

function updateStepStatus(status, percent) {
  const steps = document.querySelectorAll('.step-card');
  if (!steps.length) return;
  const stepCount = steps.length;
  steps.forEach((step, i) => {
    const threshold = ((i + 1) / stepCount) * 100;
    if (percent >= threshold) {
      step.classList.add('done');
      step.classList.remove('running', 'error');
    } else if (percent >= threshold - (100 / stepCount) && status === 'running') {
      step.classList.add('running');
      step.classList.remove('done', 'error');
    } else if (status === 'failed' && i === Math.floor(percent / (100 / stepCount))) {
      step.classList.add('error');
      step.classList.remove('done', 'running');
    }
  });
}

function renderDeployLog(logs) {
  const container = document.getElementById('deploy-log');
  if (!container || !logs.length) return;
  container.innerHTML = logs.map(line =>
    `<div class="log-line log-info">${escapeHtml(line)}</div>`
  ).join('');
  container.scrollTop = container.scrollHeight;
}
