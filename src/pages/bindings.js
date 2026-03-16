/**
 * bindings.js — 飞书频道绑定页
 */
import { opc, channel, binding } from '../api.js';
import { showToast, confirmDialog, escapeHtml, avatarColor, avatarInitial } from '../main.js';

let currentOpcId = null;
let allBindings = [];
let allChannels = [];

document.addEventListener('DOMContentLoaded', async () => {
  await loadOpcAndData();
  bindCreateButton();
});

// ─── 加载数据 ─────────────────────────────────────────────────────────────────

async function loadOpcAndData() {
  try {
    const opcs = await opc.getAll();
    const active = opcs.find(o => o.is_active) ?? opcs[0];
    if (!active) return;
    currentOpcId = active.id;

    const sel = document.getElementById('opc-selector');
    if (sel) {
      sel.innerHTML = opcs.map(o =>
        `<option value="${o.id}" ${o.id === currentOpcId ? 'selected' : ''}>${escapeHtml(o.name)}</option>`
      ).join('');
      sel.addEventListener('change', () => { currentOpcId = sel.value; loadData(); });
    }
    await loadData();
  } catch (err) {
    showToast('加载失败: ' + err.message, 'error');
  }
}

async function loadData() {
  if (!currentOpcId) return;
  try {
    [allBindings, allChannels] = await Promise.all([
      binding.list(currentOpcId),
      channel.list(currentOpcId),
    ]);
    renderChannels(allChannels);
    renderBindings(allBindings);
  } catch (err) {
    showToast('加载绑定数据失败: ' + err.message, 'error');
  }
}

// ─── 渲染频道列表（与绑定列表合并展示） ──────────────────────────────────────

function renderChannels(_channels) {
  // bindings.html 中频道和绑定合并在 binding-list 中
  // channels 信息在 renderBindings 中用到
}

// ─── 渲染绑定规则 ─────────────────────────────────────────────────────────────

function renderBindings(bindings) {
  const container = document.getElementById('binding-list');
  if (!container) return;
  container.innerHTML = '';

  // 同时展示未绑定的频道
  const boundChannelIds = new Set(bindings.map(b => b.channel_id));

  if (!allChannels.length && !bindings.length) {
    container.innerHTML = '<div style="padding:16px;text-align:center;font-size:12px;color:#636366;">暂无频道，请先添加飞书频道</div>';
    return;
  }

  // 显示已绑定规则
  bindings.forEach(b => {
    const ch = allChannels.find(c => c.id === b.channel_id);
    const row = document.createElement('div');
    row.className = 'list-row';
    row.dataset.bindingId = b.id;
    const iconColor = avatarColor(ch?.name ?? b.id);
    row.innerHTML = `
      <div style="width:28px;height:28px;border-radius:7px;background:${iconColor.replace('linear-gradient','').replace('(135deg,','rgba(').replace(',','').replace(')','0.2)')};display:flex;align-items:center;justify-content:center;flex-shrink:0;">
        <svg fill="none" stroke="${iconColor.includes('06b6d4') ? '#06b6d4' : '#a78bfa'}" stroke-width="1.75" viewBox="0 0 24 24" width="14" height="14"><path stroke-linecap="round" stroke-linejoin="round" d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0z"/></svg>
      </div>
      <div style="flex:1;min-width:0;margin-left:8px;">
        <div class="text-xs text-medium" style="color:#EBEBF5;">${escapeHtml(ch?.name ?? b.channel_id)}</div>
        <div class="text-xs text-dimmer">${b.trigger_mode === 'all_messages' ? '所有消息' : '@提及时'} · ${b.is_enabled ? '已启用' : '已禁用'}</div>
      </div>
      <input type="checkbox" class="binding-toggle" data-id="${b.id}" ${b.is_enabled ? 'checked' : ''} style="width:16px;height:16px;accent-color:#8b5cf6;cursor:pointer;" title="启用/禁用">
      <button class="tbtn tbtn-ghost btn-delete-binding" data-id="${b.id}" style="margin-left:6px;font-size:11px;padding:2px 7px;">删除</button>
    `;
    container.appendChild(row);
  });

  if (!bindings.length) {
    container.innerHTML = '<div style="padding:16px;text-align:center;font-size:12px;color:#636366;">暂无绑定规则，点击「添加绑定」创建</div>';
  }
}

// ─── 事件处理 ─────────────────────────────────────────────────────────────────

document.addEventListener('change', async (e) => {
  if (e.target.classList.contains('binding-toggle')) {
    const id = e.target.dataset.id;
    try {
      await binding.toggle(id, e.target.checked);
      showToast(e.target.checked ? '已启用' : '已禁用', 'success');
    } catch (err) {
      e.target.checked = !e.target.checked;
      showToast('操作失败: ' + err.message, 'error');
    }
  }
});

document.addEventListener('click', async (e) => {
  const deleteBtn = e.target.closest('.btn-delete-binding');
  if (deleteBtn) {
    const id = deleteBtn.dataset.id;
    const ok = await confirmDialog('确定删除此绑定规则吗？');
    if (!ok) return;
    try {
      await binding.delete(id);
      showToast('已删除', 'success');
      await loadData();
    } catch (err) {
      showToast('删除失败: ' + err.message, 'error');
    }
  }

  if (e.target.closest('#btn-add-channel')) {
    showChannelDialog();
  }
});

// ─── 创建绑定 ─────────────────────────────────────────────────────────────────

function bindCreateButton() {
  // 使用事件代理处理
}

function showChannelDialog() {
  if (!allChannels.length) {
    showToast('请先配置飞书频道', 'warning');
    return;
  }
  const overlay = document.createElement('div');
  overlay.style.cssText = 'position:fixed;inset:0;background:rgba(0,0,0,0.6);z-index:9998;display:flex;align-items:center;justify-content:center;';
  overlay.innerHTML = `
    <div style="background:#1c1c1e;border:1px solid rgba(255,255,255,0.12);border-radius:12px;padding:20px;width:340px;">
      <div style="font-size:14px;font-weight:600;color:#fff;margin-bottom:14px;">新建绑定规则</div>
      <div style="margin-bottom:10px;">
        <label style="font-size:11px;color:#636366;display:block;margin-bottom:4px;">选择频道</label>
        <select id="_b_channel" style="width:100%;padding:7px 10px;border-radius:7px;
          border:1px solid rgba(255,255,255,0.12);background:rgba(44,44,46,1);color:#fff;font-size:13px;box-sizing:border-box;">
          ${allChannels.map(c => `<option value="${c.id}">${escapeHtml(c.name)}</option>`).join('')}
        </select>
      </div>
      <div style="margin-bottom:14px;">
        <label style="font-size:11px;color:#636366;display:block;margin-bottom:4px;">触发方式</label>
        <select id="_b_trigger" style="width:100%;padding:7px 10px;border-radius:7px;
          border:1px solid rgba(255,255,255,0.12);background:rgba(44,44,46,1);color:#fff;font-size:13px;box-sizing:border-box;">
          <option value="all_messages">全部消息</option>
          <option value="at_mention">@提及时</option>
        </select>
      </div>
      <div style="display:flex;gap:8px;justify-content:flex-end;">
        <button id="_b_cancel" class="tbtn tbtn-ghost">取消</button>
        <button id="_b_ok" class="tbtn tbtn-accent">创建</button>
      </div>
    </div>
  `;
  document.body.appendChild(overlay);
  overlay.querySelector('#_b_cancel').onclick = () => overlay.remove();
  overlay.querySelector('#_b_ok').onclick = async () => {
    const channelId = overlay.querySelector('#_b_channel').value;
    const triggerMode = overlay.querySelector('#_b_trigger').value;
    try {
      await binding.create({ opc_id: currentOpcId, channel_id: channelId, trigger_mode: triggerMode, is_enabled: true });
      overlay.remove();
      showToast('绑定规则已创建', 'success');
      await loadData();
    } catch (err) {
      showToast('创建失败: ' + err.message, 'error');
    }
  };
}
