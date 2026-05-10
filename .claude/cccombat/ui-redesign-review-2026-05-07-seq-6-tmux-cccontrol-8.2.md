---
title: "UI 重设计 — 修复验证报告（DOM 实测，发现 2 处遗留问题）"
date: 2026-05-07
author: "tmux-cccontrol-8.2"
recipient: "tmux-cccontrol-8.1"
source_document: ".claude/cccombat/ui-redesign-review-2026-05-07-seq-5-tmux-cccontrol-8.1.md"
summary: "Fix1 通过；Fix2 代码改完了但 .btn-ghost 仍无视觉 chrome；Fix3 AI 按钮 gate 已移除但 agent-toolbar 横向溢出导致 4 枚按钮被推到 viewport 外（x=1990, viewport=1440）。请决定后续。"
purpose: >
  按 seq-5 要求重新截图 + DOM 实测验证。Fix1 视觉确认通过；Fix2 与 Fix3
  在代码层面都修对了，但视觉上还有遗留：Fix2 是 .btn-ghost 样式定义问题，
  Fix3 是 .agent-toolbar 横向溢出。验证方不主动给修复方案，请决定是否再起一轮。
---

## 验证手段

1. `npx tsc --noEmit` 重跑：0 errors
2. `npx vite build` 重跑：built in 800ms
3. Playwright 截图：1440×900，进入 media-comp 公司，跑 `#/agents` `#/deploy` `#/providers`
4. **新加 DOM 实测**：`getBoundingClientRect()` + `getComputedStyle()` 确认按钮渲染位置和样式（脚本 `.claude/cccombat/snap6.mjs`）

## Fix 1: DeployPage history empty state — ✅ 视觉通过

`app-deploy.png` 底部确认显示 "暂无部署记录" empty state。`recentDeployments.length > 0 &&` 早返被换成空态正确。litFloor 逻辑保持不动也合理（数据层面的 office.current_opc_id 为空就该全暗）。

## Fix 2: tbtn → btn — ⚠️ 代码 ✓ / 视觉 ✗

**代码层面**：`grep -c tbtn` 在 ProvidersPage.tsx / OfficePage.tsx 都是 0，迁移彻底。

**但视觉上还是平的**。DOM 实测 ProvidersPage 6 枚 `btn btn-sm btn-ghost` 按钮的 computed style：
```
bg:          rgba(0, 0, 0, 0)   ← 透明
borderColor: rgba(0, 0, 0, 0)   ← 透明
borderWidth: 1px                ← 占位但不可见
```

`.btn-ghost` 是设计上"无 chrome"的变体，但 hi-fi 的 detail header 按钮**有**边框/背景。所以代码修对了 class，但 hi-fi 用的应该不是 ghost——应该是默认 `btn`（带 `--border-default` 边框）或 `btn-primary`。

**这是 seq-3 修复方案选错了 variant，不是 seq-5 实施有问题**。`tbtn-ghost → btn-ghost` 字面对应是合理选择，但 hi-fi 视觉上需要的是带边框的 `btn`。

参考 `app-providers.png` 右上角 "测试连接 编辑 删除" 看起来仍像纯文本链接。

## Fix 3: AgentsPage AI 按钮 — ⚠️ 代码 ✓ / 视觉 ✗（layout 溢出）

**代码层面**：line 804 `{editing && (...)}` wrapper 已移除，AI 按钮 + 测试对话 + 编辑 + 删除 4 枚按钮在 view 模式都进入 JSX。

**但视觉上 4 枚按钮全部不可见**。DOM 实测：

```json
{
  "toolbar":  { "x": 232, "w": 2081.625 },   ← 工具栏宽 2081px
  "viewport": 1440,
  "buttons": [
    { "text": "一键生成", "x": 1990, "w": 92, "visible": true },
    { "text": "测试对话", "x": 2088, "w": 69, "visible": true },
    { "text": "编辑",     "x": 2164, "w": 55, "visible": true },
    { "text": "删除",     "x": 2225, "w": 55, "visible": true }
  ]
}
```

**根因**：`.agent-toolbar` 渲染宽度 **2081px**（>>viewport 1440px），4 枚按钮 `marginLeft: auto` 推到右端，落在 x=1990–2281，全部在 viewport 1440 之外被截断。

这正是我在 seq-4 提示 3 中警告过的"layout 问题，不是 conditional 问题"。Fix 3 改 conditional 是对的（之前 AI 按钮甚至没进 DOM），但**layout 问题独立存在**——agent-toolbar 因为子元素无 `min-width: 0` / `overflow: hidden` 被撑爆。

最可能的撑爆者：上方 `.agent-strip`（横向 pill 列表）或 `.agent-toolbar-name` 中的长 toolbarName 文字未限宽。

**截图 `app-agents.png` 表现**：右半全空，就是按钮渲染在 viewport 外。

## 检查项总览

| 项 | 代码 | 视觉 |
|----|------|------|
| Fix 1 history empty state | ✓ | ✓ |
| Fix 2 tbtn→btn | ✓ | ✗ btn-ghost 无 chrome |
| Fix 3 AI 按钮无 gate | ✓ | ✗ toolbar 宽 2081 溢出 |
| `npx tsc --noEmit` | 0 errors | — |
| `npx vite build` | 800ms 通过 | — |

## 结论

修复方向都对，但有 2 处需要追加才能视觉到位。**验证方不主动给修复方案**——按 cccombat 协议，由你决定：

- **option A**（流程结束）：接受当前状态，Fix2/Fix3 视觉缺口留 wave2
- **option B**（再起一轮）：seq-7 提出 Fix 2.1（providers/office detail header 按钮换成默认 `btn` 带边框）+ Fix 3.1（agent-toolbar 限宽，比如 `.agent-strip { min-width: 0; overflow-x: auto }` 或 `.agent-toolbar { max-width: 100%; overflow: hidden }`），等批准后再动

## 附件

- `.claude/cccombat/snap6.mjs` — DOM 实测脚本
- `.claude/cccombat/screenshots/app-{agents,deploy,providers,office}.png` — 修复后截图
