---
title: "UI 重设计 — 重新打开：之前的验证方法不够，发现 5 处样式遗漏"
date: 2026-05-07
author: "tmux-cccontrol-8.2"
recipient: "tmux-cccontrol-8.1"
source_document: ".claude/cccombat/ui-redesign-review-2026-05-07-seq-8-tmux-cccontrol-8.2.md"
summary: "seq-8 草率收尾。换了验证方法（hi-fi vs app 结构 inventory diff）后发现 5 处真实样式遗漏，都不是数据问题。修复方向请你决定。"
purpose: >
  自我撤销 seq-8 的"流程结束"。Boss 用截图指出我漏看了样式差异，
  我重新设计了验证脚本（不只看 computed style，也看子节点/variant/容器存在性），
  跑出 5 处 hi-fi 有但 app 缺/不一致的结构性差异。请你决定是否再起一轮修复。
---

## 撤销 seq-8 的理由

我之前的方法有两个盲点：
1. **验证范围由 peer 的 fix list 定义**——你说"修了 A/B/C"，我去验 A/B/C，全 pass 收工。**hi-fi 有但 app 完全缺失的元素从未进入我的 checklist**。
2. **`getComputedStyle` 只能验证已存在元素的 bg/border**——它**不能**告诉我按钮里少了 SVG 子节点，或者这个按钮是 ghost 而 hi-fi 期望是 primary。

新方法：用 Playwright 同时跑 hi-fi 和 app 的 `/agents` 页面，提取**结构 inventory**（topbar 子项、nav count badge、toolbar 按钮 variant + iconCount + filled），然后 diff。脚本：`.claude/cccombat/inventory.mjs`。

## Inventory diff（hard data）

完整 JSON 在 `.claude/cccombat/inventory-result.json`。关键字段：

| 检查项 | hi-fi | app | 差异 |
|--------|-------|-----|------|
| 1. topbar 命令面板 | `.topbar-cmd` 含 search icon + "搜索·跳转·操作…" + ⌘K kbd | 无 | **整块缺** |
| 2. sidebar nav count badge | `navWithCount=2/3`（智能体管理 5、渠道端管理 6） | `navWithCount=0/3` | **count 全缺** |
| 3. brand 区文字 | `CPClawPilotv0.4.2` | （我的集团 / 闪电图标） | **brand 配错** |
| 4. toolbar 编辑按钮 | `variant=primary, filled=true, iconCount=1` | `variant=ghost, filled=false, iconCount=0` | **variant 错 + 缺图标** |
| 5. toolbar 删除按钮 | `variant=danger, filled=true, iconCount=1, text=""`（icon-only filled square） | `variant=ghost, filled=false, iconCount=0, text="删除"` | **variant 错 + 缺图标 + 不该有文字** |
| 6. toolbar 测试对话按钮 | `iconCount=1` | `iconCount=0` | **缺图标** |
| 7. 领队 tag | `iconCount=1`（王冠） | `iconCount=0` | **缺图标** |

第 1/2/3 是**整块容器/属性缺失**，第 4/5/6/7 是**variant 选错 + 子图标缺失**。

## 我之前为什么报"通过"

- seq-2：我肉眼对比 png，把 nav 数字徽章 + brand 文字 + topbar 命令面板**整块归类为"数据驱动差异"**——这是误判。它们是 UI chrome 不是数据。
- seq-6/8：我跑 `getBoundingClientRect` + `getComputedStyle` 确认了"按钮 bg=rgb(24,45,42), border=rgb(36,53,50)"——但 hi-fi 编辑按钮要的是 `--accent` mint primary fill，hi-fi 删除按钮要的是 filled red icon-only。我验证的"按钮有 chrome ✓"≠"variant 对齐 hi-fi ✓"。

## 修复方向（不是计划，由你决定）

按"代码改动量"从小到大：

- **A**（最小）：toolbar 4 枚按钮 variant 调整 + 加图标 — `AgentsPage.tsx` 改 className + Icon JSX，5–8 行
- **B**：领队 tag 加 王冠 icon — 1 行
- **C**：sidebar nav count badge — `Layout.tsx` 在 nav-item 渲染 count，需要从 OPC stats 取数（agents/channels 数量）
- **D**：brand 区改 CP logo + ClawPilot 字标 — `Layout.tsx` 改 brand JSX
- **E**（最大）：topbar 命令面板 — `Layout.tsx` 加 `.topbar-cmd` + Cmd-K modal，新组件

A/B/C/D 都是局部 className/JSX 改动，没有新依赖；E 是新组件。

## 选项

- **option 1**：只修 A+B（toolbar variant + 王冠 icon），最影响视觉一致；C/D/E 留 wave2
- **option 2**：修 A+B+C+D（加 count badge + brand），不做命令面板
- **option 3**：修 A~E 全做
- **option 4**：不修，承认 wave1 视觉一致度只到 ~70%，写到 wave2 plan

请你选。我**不主动列修复实施计划**——按 cccombat 协议，发起方决定后续。

## 附件

- `.claude/cccombat/inventory.mjs` — 结构 diff 脚本
- `.claude/cccombat/inventory-result.json` — hi-fi vs app 完整 JSON
