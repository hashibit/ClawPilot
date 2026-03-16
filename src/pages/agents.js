/**
 * agents.js — 智能体管理页
 */
import { opc, agent } from '../api.js';
import { showToast, confirmDialog, escapeHtml, avatarColor, avatarInitial } from '../main.js';

let currentOpcId = null;
let allAgents = [];
let selectedAgent = null;

document.addEventListener('DOMContentLoaded', async () => {
  // 加载 OPC 选择器
  await loadOpcSelector();
});

// ─── OPC 选择器 ───────────────────────────────────────────────────────────────

async function loadOpcSelector() {
  try {
    const opcs = await opc.getAll();
    // agents.html 使用 id="company-select"
    const sel = document.getElementById('company-select') ?? document.getElementById('opc-selector');
    if (sel) {
      sel.innerHTML = opcs.map(o =>
        `<option value="${o.id}" ${o.is_active ? 'selected' : ''}>${escapeHtml(o.name)}</option>`
      ).join('');
      sel.addEventListener('change', () => {
        currentOpcId = sel.value;
        loadAgents();
      });
      currentOpcId = sel.value;
    } else {
      const active = opcs.find(o => o.is_active) ?? opcs[0];
      currentOpcId = active?.id;
    }
    if (currentOpcId) await loadAgents();
  } catch (err) {
    showToast('加载公司列表失败: ' + err.message, 'error');
  }
}

// ─── 加载智能体列表 ───────────────────────────────────────────────────────────

async function loadAgents() {
  if (!currentOpcId) return;
  try {
    allAgents = await agent.list(currentOpcId);
    renderAgentList(allAgents);
    if (allAgents.length > 0) selectAgent(allAgents[0]);
  } catch (err) {
    showToast('加载智能体失败: ' + err.message, 'error');
  }
}

function renderAgentList(agents) {
  const container = document.getElementById('agent-list');
  if (!container) return;
  container.innerHTML = '';

  if (!agents.length) {
    container.innerHTML = '<div style="padding:16px;text-align:center;font-size:12px;color:#636366;">暂无智能体，点击下方按钮创建</div>';
  } else {
    agents.forEach(a => {
      const row = document.createElement('div');
      row.className = 'list-row' + (selectedAgent?.id === a.id ? ' selected' : '');
      row.dataset.agentId = a.id;
      row.innerHTML = `
        <div class="avatar avatar-lg" style="background:${avatarColor(a.name)}">${avatarInitial(a.name)}</div>
        <div style="flex:1;min-width:0;">
          <div class="text-sm text-medium" style="color:#EBEBF5;">${escapeHtml(a.name)}</div>
          <div class="text-xs text-dimmer">${escapeHtml(a.model_name ?? a.model_provider ?? '未配置模型')}</div>
        </div>
      `;
      row.addEventListener('click', () => selectAgent(a));
      container.appendChild(row);
    });
  }

  // 新建按钮
  const btn = document.createElement('div');
  btn.style.cssText = 'padding:10px 12px 4px;border-top:1px solid rgba(255,255,255,0.06);margin-top:6px;';
  btn.innerHTML = `
    <button id="btn-create-agent" style="width:100%;display:flex;align-items:center;gap:6px;padding:6px 8px;border-radius:6px;
      background:none;border:none;cursor:pointer;color:#636366;font-size:12px;"
      onmouseover="this.style.background='rgba(255,255,255,0.06)';this.style.color='rgba(235,235,245,0.8)'"
      onmouseout="this.style.background='none';this.style.color='#636366'">
      <svg fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24" width="13" height="13">
        <path stroke-linecap="round" stroke-linejoin="round" d="M12 6v6m0 0v6m0-6h6m-6 0H6"/>
      </svg>
      添加智能体
    </button>
  `;
  container.appendChild(btn);
  document.getElementById('btn-create-agent')?.addEventListener('click', showCreateDialog);
}

// ─── 选择智能体 ───────────────────────────────────────────────────────────────

async function selectAgent(a) {
  selectedAgent = a;
  document.querySelectorAll('#agent-list .list-row').forEach(r => r.classList.remove('selected'));
  document.querySelector(`[data-agent-id="${a.id}"]`)?.classList.add('selected');
  renderDetail(a);
  await loadDocument(a.id, 'soul');
}

function renderDetail(a) {
  setText('detail-agent-name', a.name);
  setText('detail-agent-role', a.role ?? '');
  setText('detail-agent-model', `${a.model_provider ?? ''} · ${a.model_name ?? ''}`);

  const nameInput = document.getElementById('input-agent-name');
  const roleInput = document.getElementById('input-agent-role');
  const modelInput = document.getElementById('input-agent-model');
  if (nameInput) nameInput.value = a.name;
  if (roleInput) roleInput.value = a.role ?? '';
  if (modelInput) modelInput.value = a.model_name ?? '';
}

async function loadDocument(agentId, docType) {
  try {
    const doc = await agent.getDocument(agentId, docType);
    // agents.html 使用 id="soul-editor"
    const textarea = document.getElementById('soul-editor') ?? document.getElementById('doc-editor');
    if (textarea) textarea.value = doc?.content ?? '';
  } catch (err) {
    // 文档可能为空
  }
}

// ─── 保存智能体 ───────────────────────────────────────────────────────────────

document.addEventListener('click', async (e) => {
  if (e.target.closest('#btn-save-agent')) {
    if (!selectedAgent) return;
    const name = document.getElementById('input-agent-name')?.value?.trim();
    const role = document.getElementById('input-agent-role')?.value?.trim();
    if (!name) { showToast('名称不能为空', 'warning'); return; }
    try {
      await agent.update(selectedAgent.id, { ...selectedAgent, name, role });
      showToast('保存成功', 'success');
      selectedAgent = { ...selectedAgent, name, role };
      await loadAgents();
    } catch (err) {
      showToast('保存失败: ' + err.message, 'error');
    }
  }

  if (e.target.closest('#btn-save-doc') || e.target.closest('#btn-save-soul')) {
    if (!selectedAgent) return;
    const content = (document.getElementById('soul-editor') ?? document.getElementById('doc-editor'))?.value ?? '';
    const activeTab = document.querySelector('#soul-tabs .tab-active, #soul-tabs button.active');
    const docType = activeTab?.dataset?.doc ?? document.getElementById('doc-type-selector')?.value ?? 'soul';
    try {
      await agent.updateDocument(selectedAgent.id, docType, content);
      showToast('文档已保存', 'success');
    } catch (err) {
      showToast('保存失败: ' + err.message, 'error');
    }
  }

  if (e.target.closest('#btn-delete-agent')) {
    if (!selectedAgent) return;
    const ok = await confirmDialog(`确定删除「${selectedAgent.name}」吗？`);
    if (!ok) return;
    try {
      await agent.delete(selectedAgent.id);
      showToast('已删除', 'success');
      selectedAgent = null;
      await loadAgents();
    } catch (err) {
      showToast('删除失败: ' + err.message, 'error');
    }
  }
});

// 文档类型切换
document.addEventListener('change', async (e) => {
  if (e.target.id === 'doc-type-selector' && selectedAgent) {
    await loadDocument(selectedAgent.id, e.target.value);
  }
});

// ─── 创建智能体 ───────────────────────────────────────────────────────────────

function showCreateDialog() {
  const overlay = document.createElement('div');
  overlay.style.cssText = 'position:fixed;inset:0;background:rgba(0,0,0,0.6);z-index:9998;display:flex;align-items:center;justify-content:center;';
  overlay.innerHTML = `
    <div style="background:#1c1c1e;border:1px solid rgba(255,255,255,0.12);border-radius:12px;padding:20px;width:340px;">
      <div style="font-size:14px;font-weight:600;color:#fff;margin-bottom:14px;">添加智能体</div>
      <div style="margin-bottom:10px;">
        <label style="font-size:11px;color:#636366;display:block;margin-bottom:4px;">名称</label>
        <input id="_a_name" type="text" placeholder="例如：产品经理" style="width:100%;padding:7px 10px;border-radius:7px;
          border:1px solid rgba(255,255,255,0.12);background:rgba(255,255,255,0.06);color:#fff;font-size:13px;box-sizing:border-box;">
      </div>
      <div style="margin-bottom:10px;">
        <label style="font-size:11px;color:#636366;display:block;margin-bottom:4px;">角色描述</label>
        <input id="_a_role" type="text" placeholder="例如：负责产品规划与需求分析" style="width:100%;padding:7px 10px;border-radius:7px;
          border:1px solid rgba(255,255,255,0.12);background:rgba(255,255,255,0.06);color:#fff;font-size:13px;box-sizing:border-box;">
      </div>
      <div style="display:flex;gap:8px;justify-content:flex-end;">
        <button id="_a_cancel" class="tbtn tbtn-ghost">取消</button>
        <button id="_a_ok" class="tbtn tbtn-accent">创建</button>
      </div>
    </div>
  `;
  document.body.appendChild(overlay);
  overlay.querySelector('#_a_name').focus();
  overlay.querySelector('#_a_cancel').onclick = () => overlay.remove();
  overlay.querySelector('#_a_ok').onclick = async () => {
    const name = overlay.querySelector('#_a_name').value.trim();
    if (!name) return;
    try {
      await agent.create({ opc_id: currentOpcId, name, role: overlay.querySelector('#_a_role').value.trim(), sort_order: allAgents.length });
      overlay.remove();
      showToast(`智能体「${name}」已创建`, 'success');
      await loadAgents();
    } catch (err) {
      showToast('创建失败: ' + err.message, 'error');
    }
  };
}

function setText(id, text) {
  const el = document.getElementById(id);
  if (el) el.textContent = text;
}
