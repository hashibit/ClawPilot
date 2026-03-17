/**
 * ClawPilot — 共享工具模块
 * 各页面脚本的通用函数
 */

// ─── Toast 通知 ──────────────────────────────────────────────────────────────

let _toastContainer = null;

function getToastContainer() {
  if (!_toastContainer) {
    _toastContainer = document.createElement('div');
    _toastContainer.style.cssText =
      'position:fixed;bottom:20px;right:20px;z-index:9999;display:flex;flex-direction:column;gap:6px;pointer-events:none;';
    document.body.appendChild(_toastContainer);
  }
  return _toastContainer;
}

export function showToast(message, type = 'info', duration = 3000) {
  const colors = { success: '#34c759', error: '#ff453a', info: '#a78bfa', warning: '#f59e0b' };
  const toast = document.createElement('div');
  toast.style.cssText = `
    padding:8px 14px;border-radius:8px;font-size:12px;color:#fff;font-weight:500;
    background:rgba(30,30,32,0.95);border:1px solid ${colors[type] ?? colors.info};
    box-shadow:0 4px 14px rgba(0,0,0,0.5);pointer-events:auto;
    display:flex;align-items:center;gap:7px;min-width:200px;max-width:340px;
    opacity:0;transform:translateY(6px);transition:opacity 0.15s,transform 0.15s;
  `;
  const dot = document.createElement('span');
  dot.style.cssText = `width:6px;height:6px;border-radius:50%;background:${colors[type] ?? colors.info};flex-shrink:0;`;
  const text = document.createElement('span');
  text.textContent = message;
  toast.append(dot, text);
  getToastContainer().appendChild(toast);
  // Animate in
  requestAnimationFrame(() => {
    toast.style.opacity = '1';
    toast.style.transform = 'translateY(0)';
  });
  setTimeout(() => {
    toast.style.opacity = '0';
    toast.style.transform = 'translateY(6px)';
    setTimeout(() => toast.remove(), 200);
  }, duration);
}

// ─── 确认弹窗 ─────────────────────────────────────────────────────────────────

export function confirmDialog(message) {
  return new Promise(resolve => {
    const overlay = document.createElement('div');
    overlay.style.cssText =
      'position:fixed;inset:0;background:rgba(0,0,0,0.6);z-index:9998;display:flex;align-items:center;justify-content:center;';
    const box = document.createElement('div');
    box.style.cssText =
      'background:#1c1c1e;border:1px solid rgba(255,255,255,0.12);border-radius:12px;padding:20px;width:300px;';
    box.innerHTML = `
      <div style="font-size:13px;color:#ebebf5;margin-bottom:14px;line-height:1.5;">${escapeHtml(message)}</div>
      <div style="display:flex;gap:8px;justify-content:flex-end;">
        <button id="_cd_cancel" class="tbtn tbtn-ghost">取消</button>
        <button id="_cd_ok" class="tbtn tbtn-accent">确认</button>
      </div>
    `;
    overlay.appendChild(box);
    document.body.appendChild(overlay);
    box.querySelector('#_cd_cancel').onclick = () => { overlay.remove(); resolve(false); };
    box.querySelector('#_cd_ok').onclick   = () => { overlay.remove(); resolve(true); };
  });
}

// ─── HTML 转义 ────────────────────────────────────────────────────────────────

export function escapeHtml(str) {
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

// ─── 时间格式化 ───────────────────────────────────────────────────────────────

export function relativeTime(isoStr) {
  if (!isoStr) return '';
  const diff = Date.now() - new Date(isoStr).getTime();
  const s = Math.floor(diff / 1000);
  if (s < 60) return '刚刚';
  const m = Math.floor(s / 60);
  if (m < 60) return `${m}分钟前`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}小时前`;
  const d = Math.floor(h / 24);
  if (d < 30) return `${d}天前`;
  return new Date(isoStr).toLocaleDateString('zh-CN');
}

// ─── 头像颜色 ─────────────────────────────────────────────────────────────────

const AVATAR_COLORS = [
  'linear-gradient(135deg,#8b5cf6,#06b6d4)',
  'linear-gradient(135deg,#10b981,#06b6d4)',
  'linear-gradient(135deg,#f59e0b,#f97316)',
  'linear-gradient(135deg,#f43f5e,#ec4899)',
  'linear-gradient(135deg,#3b82f6,#8b5cf6)',
  'linear-gradient(135deg,#06b6d4,#3b82f6)',
];

export function avatarColor(str) {
  let hash = 0;
  for (let i = 0; i < str.length; i++) hash = (hash * 31 + str.charCodeAt(i)) & 0xffff;
  return AVATAR_COLORS[hash % AVATAR_COLORS.length];
}

export function avatarInitial(name) {
  return (name || '?').charAt(0).toUpperCase();
}

// ─── 加载状态 ─────────────────────────────────────────────────────────────────

export function setLoading(el, loading) {
  if (!el) return;
  if (loading) {
    el.dataset.origText = el.textContent;
    el.disabled = true;
    el.textContent = '加载中...';
  } else {
    el.disabled = false;
    el.textContent = el.dataset.origText ?? el.textContent;
  }
}
