# ClawPilot — CLAUDE.md

## 关于作者
LLM 的输出始终用中文或者英文

## 项目概述

ClawPilot 是面向 **OpenClaw** 用户的可视化团队配置管理桌面应用。
提供 OPC（OpenClaw 团队配置）的创建、管理与一键部署 GUI。

- **平台**：macOS / Windows / Linux
- **技术栈**：Tauri 2 + Rust + SQLite + React + TypeScript
- **配置格式**：JSON/JSON5（兼容 OpenClaw）

## 目录结构

```
ClawPilot/
├── src-tauri/          # Tauri 后端（Rust）：commands/ models/ database/ services/ openclaw/ utils/
├── daemon/             # 独立 Rust Daemon 服务（HTTP API，端口 16668）
├── src/                # 前端（React + TypeScript，Vite）：components/ pages/ hooks/ contexts/
├── server/             # Node.js 开发服务（Express，端口 16667）：db.js routes/
├── proto/              # ⚠️ Protobuf 定义 — 数据模型与 API 接口的唯一事实标准，改字段先改这里
├── scripts/            # 开发脚本（dev.sh、compare-api-signatures.js 等）
├── tests/              # E2E 测试（Playwright）
└── docs/
```

## 详细文档

@docs/database-runtime.md
@docs/dev-setup.md
@docs/dev-conventions.md
@docs/rust-backend.md

## AI 团队配置

| 角色 | 推荐 Agent |
|------|-----------|
| Rust 后端实现 | claude-code-harness:task-worker |
| 代码审查 | claude-code-harness:code-reviewer |
| 计划管理 | claude-code-harness:harness-plan |
| Tauri 专项实现 | tauri-v2 skill |
