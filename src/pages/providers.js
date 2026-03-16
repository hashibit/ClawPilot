/**
 * providers.js — 模型 Provider 管理页
 */
import { model } from '../api.js';
import { showToast, confirmDialog, escapeHtml, setLoading } from '../main.js';

const PROVIDER_META = {
  aliyun: { label: '阿里云百炼', sub: 'Aliyun Bailian', gradient: 'linear-gradient(135deg,#f97316,#ef4444)', icon: '阿' },
  volcengine: { label: '火山方舟', sub: 'Volcengine', gradient: 'linear-gradient(135deg,#3b82f6,#06b6d4)', icon: '火' },
  openai: { label: 'OpenAI', sub: 'GPT系列', gradient: 'linear-gradient(135deg,#10b981,#34d399)', icon: 'AI' },
  anthropic: { label: 'Anthropic', sub: 'Claude系列', gradient: 'linear-gradient(135deg,#f59e0b,#f97316)', icon: 'C' },
  custom: { label: '自定义', sub: 'Custom Provider', gradient: 'linear-gradient(135deg,#8b5cf6,#ec4899)', icon: '?' },
};

document.addEventListener('DOMContentLoaded', loadProviders);

async function loadProviders() {
  try {
    const providers = await model.getProviders();
    renderProviders(providers);
  } catch (err) {
    showToast('加载 Provider 失败: ' + err.message, 'error');
  }
}

function renderProviders(providers) {
  const grid = document.getElementById('provider-grid');
  if (!grid) return;
  grid.innerHTML = '';
  providers.forEach(p => grid.appendChild(makeCard(p)));
  // 添加空卡
  const add = document.createElement('div');
  add.className = 'provider-card';
  add.style.cssText = 'padding:12px;display:flex;align-items:center;justify-content:center;cursor:pointer;border:1px dashed rgba(255,255,255,0.15);border-radius:10px;min-height:80px;';
  add.innerHTML = `
    <div style="text-align:center;">
      <svg fill="none" stroke="rgba(255,255,255,0.3)" stroke-width="1.5" viewBox="0 0 24 24" width="24" height="24" style="margin:0 auto 6px;">
        <path stroke-linecap="round" stroke-linejoin="round" d="M12 6v6m0 0v6m0-6h6m-6 0H6"/>
      </svg>
      <div style="font-size:11px;color:#636366;">添加 Provider</div>
    </div>
  `;
  grid.appendChild(add);
}

function makeCard(p) {
  const meta = PROVIDER_META[p.provider_type] ?? PROVIDER_META.custom;
  const isEnabled = p.is_enabled;
  const card = document.createElement('div');
  card.className = 'provider-card';
  card.style.cssText = 'padding:12px;';
  card.dataset.providerId = p.id;
  card.innerHTML = `
    <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:10px;">
      <div style="display:flex;align-items:center;gap:8px;">
        <div style="width:34px;height:34px;border-radius:9px;background:${meta.gradient};display:flex;align-items:center;justify-content:center;font-size:12px;font-weight:700;color:white;flex-shrink:0;">${meta.icon}</div>
        <div>
          <div style="font-size:12px;font-weight:600;color:#EBEBF5;">${escapeHtml(p.name || meta.label)}</div>
          <div style="font-size:11px;color:#636366;">${meta.sub}</div>
        </div>
      </div>
      <div style="display:flex;align-items:center;gap:5px;">
        <span style="display:inline-block;width:6px;height:6px;border-radius:50%;background:${isEnabled ? '#34c759' : '#48484A'};"></span>
        <span style="font-size:11px;color:${isEnabled ? '#34c759' : '#636366'};">${isEnabled ? '已启用' : '未启用'}</span>
      </div>
    </div>
    <div style="font-size:11px;color:#636366;margin-bottom:8px;">
      API Key: ${p.api_key ? '••••••••' + p.api_key.slice(-4) : '未配置'}
    </div>
    <div style="display:flex;gap:6px;">
      <button class="tbtn tbtn-ghost btn-edit-provider" data-provider-id="${p.id}" style="flex:1;font-size:11px;">编辑</button>
      <button class="tbtn tbtn-ghost btn-test-provider" data-provider-type="${p.provider_type}" style="flex:1;font-size:11px;">测试</button>
    </div>
  `;
  return card;
}

// ─── 事件代理 ─────────────────────────────────────────────────────────────────

document.addEventListener('click', async (e) => {
  const editBtn = e.target.closest('.btn-edit-provider');
  if (editBtn) {
    const providerId = editBtn.dataset.providerId;
    const providers = await model.getProviders();
    const p = providers.find(x => x.id === providerId);
    if (p) showEditDialog(p);
  }

  const testBtn = e.target.closest('.btn-test-provider');
  if (testBtn) {
    const providerType = testBtn.dataset.providerType;
    testBtn.disabled = true;
    testBtn.textContent = '测试中...';
    try {
      await model.testProvider(providerType);
      showToast('连接测试成功', 'success');
    } catch (err) {
      showToast('连接测试失败: ' + err.message, 'error');
    } finally {
      testBtn.disabled = false;
      testBtn.textContent = '测试';
    }
  }
});

function showEditDialog(p) {
  const meta = PROVIDER_META[p.provider_type] ?? PROVIDER_META.custom;
  const overlay = document.createElement('div');
  overlay.style.cssText = 'position:fixed;inset:0;background:rgba(0,0,0,0.6);z-index:9998;display:flex;align-items:center;justify-content:center;';
  overlay.innerHTML = `
    <div style="background:#1c1c1e;border:1px solid rgba(255,255,255,0.12);border-radius:12px;padding:20px;width:380px;">
      <div style="font-size:14px;font-weight:600;color:#fff;margin-bottom:14px;">编辑 ${escapeHtml(meta.label)}</div>
      <div style="margin-bottom:10px;">
        <label style="font-size:11px;color:#636366;display:block;margin-bottom:4px;">API Key</label>
        <input id="_pe_key" type="password" value="${escapeHtml(p.api_key ?? '')}" placeholder="输入 API Key"
          style="width:100%;padding:7px 10px;border-radius:7px;border:1px solid rgba(255,255,255,0.12);
          background:rgba(255,255,255,0.06);color:#fff;font-size:13px;box-sizing:border-box;">
      </div>
      <div style="margin-bottom:10px;">
        <label style="font-size:11px;color:#636366;display:block;margin-bottom:4px;">Base URL（可选）</label>
        <input id="_pe_url" type="text" value="${escapeHtml(p.base_url ?? '')}" placeholder="留空使用默认地址"
          style="width:100%;padding:7px 10px;border-radius:7px;border:1px solid rgba(255,255,255,0.12);
          background:rgba(255,255,255,0.06);color:#fff;font-size:13px;box-sizing:border-box;">
      </div>
      <div style="margin-bottom:14px;display:flex;align-items:center;gap:8px;">
        <input id="_pe_enabled" type="checkbox" ${p.is_enabled ? 'checked' : ''}>
        <label for="_pe_enabled" style="font-size:12px;color:#EBEBF5;cursor:pointer;">启用此 Provider</label>
      </div>
      <div style="display:flex;gap:8px;justify-content:flex-end;">
        <button id="_pe_cancel" class="tbtn tbtn-ghost">取消</button>
        <button id="_pe_ok" class="tbtn tbtn-accent">保存</button>
      </div>
    </div>
  `;
  document.body.appendChild(overlay);
  overlay.querySelector('#_pe_cancel').onclick = () => overlay.remove();
  overlay.querySelector('#_pe_ok').onclick = async () => {
    const btn = overlay.querySelector('#_pe_ok');
    setLoading(btn, true);
    try {
      await model.updateProvider({
        ...p,
        api_key: overlay.querySelector('#_pe_key').value,
        base_url: overlay.querySelector('#_pe_url').value,
        is_enabled: overlay.querySelector('#_pe_enabled').checked,
      });
      overlay.remove();
      showToast('Provider 已更新', 'success');
      await loadProviders();
    } catch (err) {
      showToast('保存失败: ' + err.message, 'error');
      setLoading(btn, false);
    }
  };
}
