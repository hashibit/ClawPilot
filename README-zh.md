# ClawPilot

用于管理 OpenClaw 团队配置（OPC）的可视化桌面应用。创建、管理和一键部署 Agent 团队、渠道、模型、工具与技能。

![Platform](https://img.shields.io/badge/platform-macOS%20%7C%20Windows%20%7C%20Linux-lightgrey)
![License](https://img.shields.io/badge/license-MIT-blue)

![ClawPilot](images/icon.png)

## 界面截图

| 概览 | 公司列表 | Agent 配置 | 渠道绑定 |
|---|---|---|---|
| ![概览](images/screenshot-20260513-120343.png) | ![公司列表](images/screenshot-20260513-120417.png) | ![Agent 配置](images/screenshot-20260513-120454.png) | ![渠道绑定](images/screenshot-20260513-120511.png) |

| 部署 | 办公室 | 日志 | 设置 |
|---|---|---|---|
| ![部署](images/screenshot-20260513-120525.png) | ![办公室](images/screenshot-20260513-120559.png) | ![日志](images/screenshot-20260513-120617.png) | ![设置](images/screenshot-20260513-120633.png) |

## 技术栈

| 层级 | 技术选型 |
|---|---|
| **桌面框架** | [Tauri 2](https://v2.tauri.app/) — 原生桌面应用，极小打包体积 |
| **后端** | Rust — [axum](https://github.com/tokio-rx/axum) HTTP 服务器、[tokio](https://tokio.rs/) 异步运行时、[rusqlite](https://github.com/rusqlite/rusqlite) SQLite 驱动、[aes-gcm](https://github.com/RustCrypto/AEADs) 加密 |
| **前端** | React 18 + TypeScript — [Vite](https://vite.dev/) 构建、[React Router](https://reactrouter.com/) 路由、[i18next](https://www.i18next.com/) 国际化 |
| **数据库** | SQLite 3 — 嵌入式、零配置、单文件存储 |
| **守护进程** | 独立 Rust 服务（axum + tokio），负责 OPC 后台调度与部署 |
| **测试** | Vitest（单元测试）、Playwright（端到端测试） |
| **CI/CD** | GitHub Actions — 构建 `.dmg`（macOS Apple Silicon）、守护进程二进制，发布至 GitHub Releases |
| **包管理器** | pnpm |

## 架构

```
┌──────────────────────────────────────────────────────┐
│                    ClawPilot 桌面应用                  │
│  ┌─────────────────────┐    ┌──────────────────────┐ │
│  │   React 前端        │◄──►│  内嵌 axum HTTP 服务  │ │
│  │   (Vite + TSX)      │ HTTP│  (Rust)              │ │
│  └─────────────────────┘    └──────────┬───────────┘ │
│                                       │              │
│                              ┌────────▼──────────┐   │
│                              │   SQLite 数据库    │   │
│                              │   ~/.clawpilot/   │   │
│                              └───────────────────┘   │
└──────────────────────────────────────────────────────┘
          ▲
          │  一键部署
          ▼
┌──────────────────────────────────────────────────────┐
│              ClawPilot Daemon (端口 16668)            │
│          OPC 后台调度与部署的守护进程                   │
│  ┌──────────┐  ┌──────────┐  ┌──────────────────┐    │
│  │  调度器   │  │ WebSocket│  │  HTTP API (axum) │    │
│  └──────────┘  └──────────┘  └──────────────────┘    │
└──────────────────────────────────────────────────────┘
```

## 功能特性

- **OPC 管理** — 创建和管理 OpenClaw 团队配置，支持多 Agent
- **Agent 配置** — 单个 Agent 设置、SOUL.md / AGENTS.md 文档管理
- **模型提供商** — OpenAI、Anthropic、阿里百炼、火山方舟、MiniMax 等
- **渠道集成** — 飞书（Lark）及其他消息平台绑定
- **工具与技能** — 内置和自定义工具/技能注册
- **一键部署** — 通过 SSH 将 OPC 配置部署到远程办公室
- **办公室管理** — 远程主机配置、健康检查、部署追踪
- **深色模式** — 原生 macOS / Windows / Linux 外观
- **国际化** — 16 种语言：ar、de、en、es、fr、hi、id、it、ja、ko、pt、ru、th、vi、zh-CN、zh-TW

## 快速开始

### 前置要求

- **Node.js** >= 20 + **pnpm**
- **Rust** >= 1.75（stable 工具链）
- **macOS**：Xcode Command Line Tools
- **Linux**：`libwebkit2gtk-4.1-dev`、`libappindicator3-dev`、`librsvg2-dev`、`libgtk-3-dev`

### 开发

```bash
# 启动所有服务（前端 + API 服务器 + 守护进程）
npm run dev
# 或
bash scripts/dev.sh

# 单独启动服务
npm run dev:web     # Vite 前端（端口 16666）
npm run dev:api     # Rust API 服务器（端口 16667）

# 填充开发种子数据
./seed-dev-env.sh
```

### 构建

```bash
# 仅构建前端
npm run build:frontend

# 构建守护进程（当前平台）
npm run build:daemon

# 构建 Tauri 桌面应用
npm run build:tauri

# 完整发布（所有平台的守护进程 + 桌面应用）
npm run build:release
```

### 交叉编译守护进程（全平台）

```bash
make build-all
```

产物输出到 `dist-release/`，文件名带版本号。

### 测试

```bash
npm run test           # 单元测试（Vitest）
npm run test:coverage  # 带覆盖率
npm run test:e2e       # 端到端测试（Playwright）
```

## 项目结构

```
ClawPilot/
├── src/                    # React 前端（TypeScript）
│   ├── components/         # 可复用 UI 组件
│   ├── pages/              # 页面级组件
│   ├── hooks/              # 自定义 React Hooks
│   ├── contexts/           # React Context Provider
│   ├── lib/                # API 客户端、类型定义、工具函数
│   └── i18n/               # 翻译文件（16 种语言）
├── src-tauri/              # Rust 后端 + Tauri 配置
│   ├── src/
│   │   ├── commands/       # Tauri 命令处理器
│   │   ├── services/       # 业务逻辑层
│   │   ├── models/         # 数据结构
│   │   ├── database/       # SQLite 表结构与辅助函数
│   │   ├── http/           # axum HTTP 路由
│   │   ├── utils/          # 加密、路径解析等
│   │   └── bin/            # dev-server 二进制
│   ├── Cargo.toml
│   └── tauri.conf.json
├── daemon/                 # 独立 Rust 守护进程服务
│   ├── src/
│   └── Cargo.toml
├── proto/                  # Protobuf 定义（数据模型唯一事实来源）
├── tests/                  # Playwright E2E 测试
├── docs/                   # 开发文档
├── scripts/                # 开发脚本
└── bundle/                 # 内置技能元数据
```

## 数据存储

所有运行时数据存放在 `~/.clawpilot/`：

```
~/.clawpilot/
├── clawpilot.db            # 主 SQLite 数据库
├── server.key              # API Key 加密密钥
├── daemon.key              # 守护进程加密密钥
├── scheduler.db            # 守护进程调度数据库
├── artifacts/              # 部署产物
├── bin/                    # 内置二进制（daemon）
└── logs/                   # 运行时日志
```

API Key 在入库前使用 AES-GCM 加密。加密密钥单独存储在 `server.key` 中。

## 配置格式

OPC 配置使用 JSON/JSON5，与 OpenClaw 兼容。`proto/` 目录中的 `.proto` 文件是数据模型的唯一事实来源，TypeScript 类型、Rust 结构体和 SQLite 表结构均需与其保持一致。

## CI/CD

推送 `v*` 标签触发构建流程：

```bash
git tag v0.2.0 && git push origin v0.2.0
```

构建产物：
- `clawpilot-v0.2.0-macos-arm64.dmg` — macOS Apple Silicon 桌面应用
- `clawpilot-daemon-v0.2.0-macos-arm64` — macOS 守护进程二进制

产物自动发布至 GitHub Releases。也支持通过 `workflow_dispatch` 手动触发。

## License

MIT
