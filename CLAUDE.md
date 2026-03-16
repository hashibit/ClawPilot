# ClawPilot — CLAUDE.md

## 项目概述

ClawPilot 是面向 **OpenClaw** 用户的可视化团队配置管理桌面应用。
提供 OPC（OpenClaw 团队配置）的创建、管理与一键部署 GUI。

- **平台**：macOS / Windows / Linux
- **技术栈**：Tauri 2 + Rust + SQLite + 原生 HTML/CSS/JS
- **配置格式**：JSON/JSON5（兼容 OpenClaw）

## 目录结构

```
ClawPilot/
├── src-tauri/              # Tauri 后端（Rust）—— 待创建
│   └── src/
│       ├── commands/       # Tauri 命令（invoke 入口）
│       ├── models/         # 数据模型（Rust 结构体）
│       ├── database/       # SQLite 连接 & 迁移
│       ├── services/       # 业务逻辑
│       ├── openclaw/       # OpenClaw 配置生成 & 进程管理
│       └── utils/          # 加密、路径、时间工具
├── src/                    # 前端（原生 HTML/CSS/JS）
├── ui/                     # 高保真 UI 原型（参考来源）
├── proto/                  # Protobuf 定义（数据模型参考）
└── docs/
    ├── prd.md              # 产品需求文档
    ├── development-plan.md # 开发计划（8 阶段）
    └── database-design.md  # 数据库设计
```

## 主要 Rust 依赖

```toml
tauri = { version = "2", features = ["shell-open"] }
serde = { version = "1", features = ["derive"] }
serde_json = "1"
rusqlite = { version = "0.32", features = ["bundled"] }
tokio = { version = "1", features = ["full"] }
chrono = "0.4"
uuid = { version = "1", features = ["v4", "serde"] }
anyhow = "1"
thiserror = "1"
dirs = "5"
tracing = "0.1"
tracing-subscriber = "0.3"
```

## 标准错误类型

```rust
#[derive(Debug, thiserror::Error)]
pub enum AppError {
    #[error("Database error: {0}")]      Database(#[from] rusqlite::Error),
    #[error("IO error: {0}")]            Io(#[from] std::io::Error),
    #[error("Serialization error: {0}")] Serialization(#[from] serde_json::Error),
    #[error("Not found: {0}")]           NotFound(String),
    #[error("Validation error: {0}")]    Validation(String),
}
```

## 开发规范

- Tauri 命令放 `commands/`，业务逻辑放 `services/`，不在命令层写 SQL
- API Key 等敏感信息必须通过 `utils/crypto.rs` 加密存储
- 前端从 `ui/` 原型移植到 `src/`，通过 `invoke` 调用 Tauri 命令
- Tauri 命令返回值统一为 `Result<T, AppError>`，错误通过 serde 传递给 JS
- SQL 操作必须使用参数绑定，防止 SQL 注入

## AI 团队配置

| 角色 | 推荐 Agent |
|------|-----------|
| Rust 后端实现 | claude-code-harness:task-worker |
| 代码审查 | claude-code-harness:code-reviewer |
| 计划管理 | claude-code-harness:harness-plan |
| Tauri 专项实现 | tauri-v2 skill |
