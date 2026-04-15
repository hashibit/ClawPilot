# 开发环境启动方式

## 统一启动（推荐）

```bash
npm run dev
# 或
bash scripts/dev.sh
# 支持自定义起始端口（默认 16666）
bash scripts/dev.sh --start-port 16666
```

同时启动所有 3 个服务，日志输出到 `logs/` 目录。

## 单独启动

| 服务 | 命令 | 默认端口 |
|------|------|----------|
| **Vite (前端)** | `npm run dev:web` 或 `npx vite` | 16666 |
| **API Server (Rust)** | `npm run dev:api` 或 `cd src-tauri && cargo watch -x 'run --bin dev-server'` | 16667 |
| **Daemon (Rust)** | `cd daemon && cargo watch -x 'run -- --listen 127.0.0.1:16668'` | 16668 |

## 停止服务

```bash
npm run stop
```

## Hot Reload 支持

| 服务 | Hot Reload | 实现方式 |
|------|------------|----------|
| **Vite 前端** | ✓ | Vite 原生 HMR，React 组件热更新 |
| **API Server (Rust)** | ✓ | `cargo watch` 监听 Rust 文件变化自动重编译 |
| **Daemon (Rust)** | ✓ | `cargo watch` 监听 Rust 文件变化自动重编译 |

## 初始化开发数据

首次启动或数据库为空时，运行种子脚本：

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
