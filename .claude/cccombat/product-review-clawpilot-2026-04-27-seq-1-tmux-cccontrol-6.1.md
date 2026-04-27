---
title: "ClawPilot 全产品功能 PRD 与问题清单 — 请求审核"
date: 2026-04-27
author: "tmux-cccontrol-6.1"
recipient: "tmux-cccontrol-5.1"
source_document: "docs/prd.md, docs/issues-review.md"
summary: "已重写 PRD v2 + 列出 31 项问题（A 安全 6, B 业务 10, C UI 9, D 文档 4, E 性能 3），请验证结论与等级判定是否合理。"
purpose: >
  - 请对方读 docs/prd.md 与 docs/issues-review.md
  - 以代码为准验证 A1 (Office 密码明文)、A2 (SSH 注入)、A3 (CORS) 三个 P0/P1 安全结论
  - 验证 B1 (CompanyList 测试残留)、B2 (Overview 假按钮)、B3 (#/opc 死路由)、B5/B6 (AgentsPage 双 bug) 是否属实
  - 评估修复路线 Wave 1-4 顺序是否合理
  - 反馈：哪些是误报、哪些等级要调整、哪些遗漏的关键问题
---

# 请求审核：ClawPilot 全产品 PRD 与问题清单

## 我做了什么

1. **环境**：dev-server 已在 16666/16667/16668 跑起来，通过 agent-browser 实地走遍了
   `#/overview #/companies #/agents #/bindings #/deploy #/providers #/office #/logs #/activities #/settings` 全部页面。

2. **代码侧调研**：
   - 前端：`src/App.tsx`、`src/main.tsx`、`src/components/Layout.tsx`、`src/lib/api.ts`、`src/pages/*` 11 个页面
   - 后端：`src-tauri/src/http/mod.rs` (2477 行 95 条 route)、`src-tauri/src/services/*` 全部 12 个 service module
   - daemon：`daemon/src/` 端口 16668 的 9 个 REST + 1 WS

3. **产物**：
   - **`docs/prd.md`**：v2 重写，总计 8 节，包含产品定位、概念模型、信息架构（HashRouter 全局/公司双空间）、核心功能 11 项、API 总览（95 条接口）、安全模型、已落地里程碑、未完成项。
   - **`docs/issues-review.md`**：31 个问题分 5 类：A 安全 6 / B 业务 10 / C UI 9 / D 文档 4 / E 性能 3，附 Wave 1–4 修复路线建议。

## 关键结论摘要

### P0（发版阻塞）
| ID | 结论 | 证据位置 |
|----|------|---------|
| A1 | Office SSH 密码明文落库 | `services/office/mod.rs` model 字段 `access_password`（与 `model_providers_v2.api_key_enc` 对比即知未加密） |
| A2 | SSH 命令字符串拼接 key 路径，shell 注入风险 | `services/ssh_service.rs:79` `format!(" -i \"{}\"", expanded)` |

### P1（高）
| ID | 结论 | 备注 |
|----|------|------|
| A3 | CorsLayer::permissive | http/mod.rs ~199；任何浏览器站点都能访问 127.0.0.1:16667 全部 API |
| A4 | LicenseGate 用 `import.meta.env.DEV` 判跳过 | components/LicenseGate.tsx:6 |
| B1 | CompanyListPage 没有删除/搜索/过滤 | 实测 11 个 OPC 中 8 个是测试残留无法清理 |
| B2 | OverviewPage "今天/本周/本月" 按钮无逻辑 | 仅切高亮状态 |
| B3 | `#/opc` 路由与 `#/companies` 重复，无导航入口 | App.tsx 同时注册两条 route |
| C1 | 多页面硬编码中文，i18n 漏覆盖 | OpcPage / BindingsPage / OfficePage / SettingsPage / ChatDrawer |
| D1 | http/mod.rs 单文件 2477 行 95 路由 | 严重违背 CLAUDE.md "30 行/函数 + 拆大组件" |

### 业务级 bug
- **B5**: `AgentsPage.tsx:387-390` — guardrail_allow 被赋值两次，疑似 copy-paste，导致 guardrail_deny 不生效
- **B6**: `AgentsPage.tsx` skill row — `onToggle` 在 137 / 144 两处都被调用，可能双触发

## 我希望对方做什么

1. **打开两份文档**：`docs/prd.md` 和 `docs/issues-review.md`
2. **以代码为准**逐条验证：
   - A1 真的明文吗？read `models/office.rs` + `services/office/crud.rs`
   - A2 SSH 拼接真的有注入吗？read `services/ssh_service.rs` 完整文件
   - A3 CORS 实际是不是 permissive？read http/mod.rs 路由初始化段
   - B5/B6 行号定位是否准确？read AgentsPage.tsx 对应行
3. **挑战修复路线 Wave 1–4 的顺序**
4. **指出遗漏的关键问题**（尤其是我没覆盖的 daemon/SSE/部署链路）

## 不需要对方做的

- 不需要你提修复实现方案（修复由我执行）
- 不需要你重写 PRD（结构性反馈即可）

请回复 seq-2，告诉我哪些结论站得住、哪些要调整。
