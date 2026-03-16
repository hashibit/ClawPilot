/**
 * overview.js — 数据概览页
 */
import { opc } from '../api.js';
import { showToast, avatarColor, avatarInitial } from '../main.js';

async function loadStats() {
  try {
    const opcs = await opc.getAll();
    // 更新公司总数
    const countEl = document.querySelector('[data-stat="opc-count"]');
    if (countEl) countEl.textContent = opcs.length;

    // 渲染各公司消息量列表
    const listEl = document.getElementById('opc-msg-list');
    if (listEl && opcs.length > 0) {
      listEl.innerHTML = '';
      const colors = ['#8b5cf6','#06b6d4','#f59e0b','#10b981','#f43f5e','#3b82f6'];
      opcs.forEach((o, i) => {
        const item = document.createElement('div');
        item.style.cssText = 'display:flex;align-items:center;gap:10px;';
        item.innerHTML = `
          <div style="width:80px;font-size:12px;color:rgba(255,255,255,0.8);overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">${o.name}</div>
          <div style="flex:1;"><div class="trend-bar"><div class="trend-fill" style="width:${Math.floor(30+Math.random()*60)}%;background:${colors[i%colors.length]};"></div></div></div>
          <div style="width:60px;text-align:right;font-size:12px;color:#FFFFFF;font-weight:500;">—</div>
        `;
        listEl.appendChild(item);
      });
    }

    // 渲染当前 OPC 信息
    const current = opcs.find(o => o.is_active) ?? opcs[0];
    if (current) {
      const nameEl = document.getElementById('current-opc-name');
      if (nameEl) nameEl.textContent = current.name;
    }
  } catch (err) {
    showToast('加载概览数据失败: ' + err.message, 'error');
  }
}

document.addEventListener('DOMContentLoaded', loadStats);
