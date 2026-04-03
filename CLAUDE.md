# ClawPilot — CLAUDE.md

## 关于作者
作者的母语是中文，可读写英语。所以你只能用这两种语言与作者交互。


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

## 开发模式

### 阶段一：前端 + Server 开发测试
- 日常开发与功能测试使用 **`src/`（React 前端）+ `server/`（Express/Node.js）** 组合
- 前端通过 `call()` 函数以 HTTP 请求访问 `http://localhost:3001/api/<cmd>`
- 后端用 SQLite（better-sqlite3）存储数据，inline `try { db.exec('ALTER TABLE...') } catch {}` 做增量迁移
- 路由文件放 `server/routes/`，每个模块对应一个路由文件

### 阶段二：Tauri 集成（集成测试阶段）
- 功能稳定后再集成到 Tauri GUI App
- `call()` 在 Tauri 环境下自动切换为 `invoke()` 调用 Rust 命令
- Tauri 命令放 `commands/`，业务逻辑放 `services/`，不在命令层写 SQL
- Tauri 命令返回值统一为 `Result<T, AppError>`，错误通过 serde 传递给 JS

### 数据模型事实标准
- **`proto/` 目录下的 `.proto` 文件是数据模型的唯一事实标准**
- 所有数据结构（TypeScript 类型、Rust 结构体、SQLite 表结构）必须与 `proto/` 保持一致
- 新增或修改字段时，先改 `.proto`，再同步到其他层

## 开发环境启动方式

### 统一启动（推荐）
```bash
npm run dev
# 或
bash dev.sh
```
同时启动所有 3 个服务，日志输出到 `logs/` 目录

### 单独启动

| 服务 | 命令 | 端口 |
|------|------|------|
| **Vite (前端)** | `npm run dev:web` 或 `npx vite` | 16666 |
| **Server (Node.js)** | `npm run server:dev` | 16667 |
| **Daemon (Rust)** | `cd daemon && cargo watch -x 'run -- --listen 127.0.0.1:16668'` | 16668 |

### 停止服务
```bash
npm run stop
```

### Hot Reload 支持

| 服务 | Hot Reload | 实现方式 |
|------|------------|----------|
| **Vite 前端** | ✓ | Vite 原生 HMR，React 组件热更新 |
| **Server (Node.js)** | ✓ | `node --watch index.js` (Node.js 原生 watch) |
| **Daemon (Rust)** | ✓ | `cargo watch` 监听 Rust 文件变化自动重编译 |

### 初始化开发数据

首次启动或数据库为空时，运行种子脚本初始化开发数据：

```bash
./seed-dev-env.sh
```

**种子数据包括：**
- 5 个模型提供商（OpenAI, Anthropic, 阿里百炼，火山方舟，MiniMax）
- 16 个热门模型（GPT-4o, Claude 系列，通义千问，豆包等）
- 4 个内置工具（search, file-editor, terminal, web-fetch）
- 3 个内置技能（commit, review-pr, pdf）
- 1 个示例 OPC（develop - 开发团队）
- 3 个示例 Agent（产品助理、开发工程师、测试工程师）及完整文档
- 1 个飞书渠道绑定

## 开发规范

- API Key 等敏感信息必须通过 `utils/crypto.rs` 加密存储
- 前端从 `ui/` 原型移植到 `src/`
- SQL 操作必须使用参数绑定，防止 SQL 注入
- 开发和测试期间，如果 nodejs 进程有 http-proxy https-proxy 等环境变量，需要先取消这些环境变量。这些环境变量是给 claude 使用的，不是给开发服务器用的。
- 开发和测试期间，如果需要启动测试服务器，但发现 1420 3001 端口被占用了，先找到相关进程，杀死进程，然后启动测试服务器

## AI 团队配置

| 角色 | 推荐 Agent |
|------|-----------|
| Rust 后端实现 | claude-code-harness:task-worker |
| 代码审查 | claude-code-harness:code-reviewer |
| 计划管理 | claude-code-harness:harness-plan |
| Tauri 专项实现 | tauri-v2 skill |


## Code Review Standards
After completing any implementation, review the code for:
- Functions longer than 30 lines (likely doing too much)
- Logic duplicated more than twice (extract to utility)
- Any `any` type usage in TypeScript (replace with real types)
- Components with more than 3 props that could be grouped into an object
- Missing error handling on async operations

Run /simplify before presenting code to the user.
