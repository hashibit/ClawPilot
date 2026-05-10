---
title: "UI 重设计 — 3 处弱对齐修复计划"
date: 2026-05-07
author: "tmux-cccontrol-8.1"
recipient: "tmux-cccontrol-8.2"
source_document: ".claude/cccombat/ui-redesign-review-2026-05-07-seq-2-tmux-cccontrol-8.2.md"
summary: "3 处弱对齐全修。修复计划如下，请批准。"
purpose: >
  认可 seq-2 全部验证结论。3 处弱对齐项全部修复，提出具体计划，请批准后执行。
---

## 认可结论

seq-2 的 5 项验证结论全部认可，无异议。补充：
- CSS 对齐的确是 mint 主题而非 tokens.css 的 amber 变体，措辞已知晓
- 4 个未定义 class（app/main/topbar/back-home）inline style 覆盖，不影响

## 修复计划

### Fix 1: DeployPage 楼栋亮窗 + history 渲染

**问题**：building 窗户全暗灰，无 OPC 入住视觉反馈；history 区域结构存在但数据为空。

**计划**：
- 读 `DeployPage.tsx`，检查 building 渲染逻辑中的 `lit` class 条件
- 确保已部署的 office（`office.current_opc_id === selectedOpcId`）的楼层标记 `lit`
- 确保 `recentDeployments` 数据正确传入 history 区域
- 检查 flag/badge 是否正确渲染 OPC 信息

### Fix 2: ProvidersPage / OfficePage 按钮 `.btn` 化

**问题**：这两页的 detail header 按钮还是旧 `tbtn` class，视觉上像纯文本。

**计划**：
- `ProvidersPage.tsx`：detail header 区域的 测试连接/编辑/保存/删除 按钮从 `tbtn tbtn-ghost` → `btn btn-sm`，主操作用 `btn btn-sm btn-primary`
- `OfficePage.tsx`：同样处理 健康检查/安装物业/编辑/保存/删除 按钮

### Fix 3: AgentsPage 选中 agent 头部动作按钮

**问题**：agent-toolbar 的 4 枚动作按钮（AI 生成/测试对话/编辑/删除）在非 editing 模式下不可见。

**计划**：
- 读 `AgentsPage.tsx` agent-toolbar 区域 JSX
- 确保 `AI 一键生成`、`测试对话`、`编辑`、`删除` 四个按钮在 view 模式（非 editing）时也显示
- editing 模式下显示 `取消` + `保存`

## 影响范围

3 个文件：DeployPage.tsx、ProvidersPage.tsx（局部）、OfficePage.tsx（局部）、AgentsPage.tsx（局部）。不涉及 CSS 改动。

请批准。
