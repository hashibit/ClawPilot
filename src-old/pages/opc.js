/**
 * opc.js — 子公司（OPC）管理页
 */
import { opc, agent, channel } from '../api.js';
import { showToast, confirmDialog, escapeHtml, relativeTime, avatarColor, avatarInitial } from '../main.js';

let allOpcs = [];
let selectedOpc = null;

// ─── 初始化 ───────────────────────────────────────────────────────────────────

document.addEventListener('DOMContentLoaded', async () => {
  await loadOpcs();
  bindCreateButton();
});

// ─── 加载 OPC 列表 ────────────────────────────────────────────────────────────

async function loadOpcs() {
  try {
    allOpcs = await opc.getAll();
    renderOpcList(allOpcs);
    const active = allOpcs.find(o => o.is_active) ?? allOpcs[0];
    if (active) await selectOpc(active);
  } catch (err) {
    showToast('加载公司列表失败: ' + err.message, 'error');
  }
}

function renderOpcList(opcs) {
  const container = document.getElementById('opc-list');
  if (!container) return;
  container.innerHTML = '';

  const running = opcs.filter(o => o.is_active);
  const stopped = opcs.filter(o => !o.is_active);

  if (running.length) {
    container.innerHTML += `<div class="section-label" style="padding:8px 12px 3px;">运行中</div>`;
    running.forEach(o => container.appendChild(makeOpcRow(o)));
  }
  if (stopped.length) {
    container.innerHTML += `<div class="section-label" style="padding:10px 12px 3px;">已停止</div>`;
    stopped.forEach(o => container.appendChild(makeOpcRow(o)));
  }

  // 新建按钮
  const btn = document.createElement('div');
  btn.style.cssText = 'padding:10px 12px 4px;border-top:1px solid rgba(255,255,255,0.06);margin-top:6px;';
  btn.innerHTML = `
    <button id="btn-create-opc" style="width:100%;display:flex;align-items:center;gap:6px;padding:6px 8px;border-radius:6px;
      background:none;border:none;cursor:pointer;color:#636366;font-size:12px;transition:background 0.1s;"
      onmouseover="this.style.background='rgba(255,255,255,0.06)';this.style.color='rgba(235,235,245,0.8)'"
      onmouseout="this.style.background='none';this.style.color='#636366'">
      <svg fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24" width="13" height="13">
        <path stroke-linecap="round" stroke-linejoin="round" d="M12 6v6m0 0v6m0-6h6m-6 0H6"/>
      </svg>
      创建新OPC公司
    </button>
  `;
  container.appendChild(btn);
  document.getElementById('btn-create-opc')?.addEventListener('click', showCreateDialog);
}

function makeOpcRow(o) {
  const row = document.createElement('div');
  row.className = 'list-row' + (selectedOpc?.id === o.id ? ' selected' : '');
  row.dataset.opcId = o.id;
  row.innerHTML = `
    <div class="avatar avatar-lg" style="background:${avatarColor(o.name)}">${avatarInitial(o.name)}</div>
    <div style="flex:1;min-width:0;">
      <div class="flex-center gap-5">
        <span class="text-sm text-medium">${escapeHtml(o.name)}</span>
        ${o.is_active ? '<span class="pulse-dot" style="width:6px;height:6px;border-radius:50%;background:#34c759;"></span>' : ''}
      </div>
      <div class="text-xs text-dim" data-sub="${o.id}">加载中...</div>
    </div>
    <span class="text-xs text-dim">${relativeTime(o.updated_at)}</span>
  `;
  row.addEventListener('click', () => selectOpc(o));
  return row;
}

async function loadOpcSub(opcId) {
  try {
    const [agents, channels] = await Promise.all([
      agent.list(opcId),
      channel.list(opcId),
    ]);
    const sub = document.querySelector(`[data-sub="${opcId}"]`);
    if (sub) sub.textContent = `${agents.length} 智能体 · ${channels.length} 频道`;
  } catch (_) {}
}

// ─── 选择 OPC ─────────────────────────────────────────────────────────────────

async function selectOpc(o) {
  selectedOpc = o;
  // 高亮行
  document.querySelectorAll('.list-row').forEach(r => r.classList.remove('selected'));
  document.querySelector(`[data-opc-id="${o.id}"]`)?.classList.add('selected');
  loadOpcSub(o.id);
  await renderDetail(o);
}

async function renderDetail(o) {
  const titleEl = document.getElementById('detail-title');
  if (titleEl) titleEl.textContent = o.name;

  const statusBadge = document.getElementById('detail-status-badge');
  if (statusBadge) {
    statusBadge.textContent = o.is_active ? '运行中' : '已停止';
    statusBadge.style.color = o.is_active ? '#34c759' : '#636366';
    statusBadge.style.background = o.is_active ? 'rgba(52,199,89,0.15)' : 'rgba(99,99,102,0.15)';
  }

  try {
    const [agents, channels, stats] = await Promise.all([
      agent.list(o.id),
      channel.list(o.id),
      opc.getStats(o.id),
    ]);

    // 概览数字
    setText('detail-agent-count', `${agents.length} 个`);
    setText('detail-channel-count', `${channels.length} 个`);
    setText('detail-msg-today', stats?.today_messages ?? '—');

    // 智能体列表
    renderAgentList(agents);
  } catch (err) {
    showToast('加载详情失败: ' + err.message, 'error');
  }
}

function renderAgentList(agents) {
  const container = document.getElementById('agent-list-detail');
  if (!container) return;
  if (!agents.length) {
    container.innerHTML = '<div class="group-row text-xs text-dimmer" style="justify-content:center;">暂无智能体</div>';
    return;
  }
  container.innerHTML = agents.map(a => `
    <div class="group-row">
      <div class="avatar avatar-sm" style="background:${avatarColor(a.name)};margin-right:8px;">${avatarInitial(a.name)}</div>
      <div style="flex:1;">
        <div class="text-xs text-medium" style="color:#EBEBF5;">${escapeHtml(a.name)}</div>
        <div class="text-xs text-dimmer">${escapeHtml(a.model_provider ?? '')}${a.model_name ? '[' + a.model_name + ']' : ''}</div>
      </div>
    </div>
  `).join('');
}

function setText(id, text) {
  const el = document.getElementById(id);
  if (el) el.textContent = text;
}

// ─── 创建 OPC ─────────────────────────────────────────────────────────────────

function bindCreateButton() {
  // handled via delegation after render
}

function showCreateDialog() {
  const overlay = document.createElement('div');
  overlay.style.cssText = 'position:fixed;inset:0;background:rgba(0,0,0,0.6);z-index:9998;display:flex;align-items:center;justify-content:center;';
  overlay.innerHTML = `
    <div style="background:#1c1c1e;border:1px solid rgba(255,255,255,0.12);border-radius:12px;padding:20px;width:340px;">
      <div style="font-size:14px;font-weight:600;color:#fff;margin-bottom:14px;">创建新公司</div>
      <div style="margin-bottom:10px;">
        <label style="font-size:11px;color:#636366;display:block;margin-bottom:4px;">公司名称</label>
        <input id="_dlg_name" type="text" placeholder="例如：互联网公司" style="width:100%;padding:7px 10px;border-radius:7px;
          border:1px solid rgba(255,255,255,0.12);background:rgba(255,255,255,0.06);color:#fff;font-size:13px;box-sizing:border-box;">
      </div>
      <div style="margin-bottom:14px;">
        <label style="font-size:11px;color:#636366;display:block;margin-bottom:4px;">描述（可选）</label>
        <input id="_dlg_desc" type="text" placeholder="简短描述" style="width:100%;padding:7px 10px;border-radius:7px;
          border:1px solid rgba(255,255,255,0.12);background:rgba(255,255,255,0.06);color:#fff;font-size:13px;box-sizing:border-box;">
      </div>
      <div style="display:flex;gap:8px;justify-content:flex-end;">
        <button id="_dlg_cancel" class="tbtn tbtn-ghost">取消</button>
        <button id="_dlg_ok" class="tbtn tbtn-accent">创建</button>
      </div>
    </div>
  `;
  document.body.appendChild(overlay);
  const nameInput = overlay.querySelector('#_dlg_name');
  nameInput.focus();
  overlay.querySelector('#_dlg_cancel').onclick = () => overlay.remove();
  overlay.querySelector('#_dlg_ok').onclick = async () => {
    const name = nameInput.value.trim();
    if (!name) { nameInput.focus(); return; }
    try {
      await opc.create({ name, description: overlay.querySelector('#_dlg_desc').value.trim(), is_active: false });
      overlay.remove();
      showToast(`公司「${name}」已创建`, 'success');
      await loadOpcs();
    } catch (err) {
      showToast('创建失败: ' + err.message, 'error');
    }
  };
}

// ─── 导出 ─────────────────────────────────────────────────────────────────────

document.addEventListener('click', async (e) => {
  if (e.target.closest('#btn-export-opc')) {
    if (!selectedOpc) return;
    try {
      const json = await opc.export(selectedOpc.id);
      const blob = new Blob([JSON.stringify(json, null, 2)], { type: 'application/json' });
      const a = document.createElement('a');
      a.href = URL.createObjectURL(blob);
      a.download = `${selectedOpc.name}.json`;
      a.click();
      showToast('导出成功', 'success');
    } catch (err) {
      showToast('导出失败: ' + err.message, 'error');
    }
  }

  if (e.target.closest('#btn-set-current-opc')) {
    if (!selectedOpc) return;
    try {
      await opc.setCurrent(selectedOpc.id);
      showToast(`已切换到「${selectedOpc.name}」`, 'success');
      await loadOpcs();
    } catch (err) {
      showToast('切换失败: ' + err.message, 'error');
    }
  }

  if (e.target.closest('#btn-delete-opc')) {
    if (!selectedOpc) return;
    const ok = await confirmDialog(`确定要删除「${selectedOpc.name}」吗？此操作不可恢复。`);
    if (!ok) return;
    try {
      await opc.delete(selectedOpc.id);
      showToast('已删除', 'success');
      selectedOpc = null;
      await loadOpcs();
    } catch (err) {
      showToast('删除失败: ' + err.message, 'error');
    }
  }
});
