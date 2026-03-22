# ClawPilot 测试执行指南

> 本文档说明如何运行 ClawPilot 项目的所有自动化测试。
>
> 版本: v1.0
> 日期: 2026-03-20

---

## 目录

1. [快速开始](#快速开始)
2. [Server 测试](#server-测试)
3. [前端测试](#前端测试)
4. [Tauri 后端测试](#tauri-后端测试)
5. [Daemon 测试](#daemon-测试)
6. [E2E 测试](#e2e-测试)
7. [OrbStack 真实部署测试](#orbstack-真实部署测试)
8. [CI/CD 集成](#cicd-集成)
9. [故障排除](#故障排除)
10. [手动测试（TEST_PATHS.md）](#手动测试清单)

---

## 快速开始

### 一键运行所有测试

> **说"执行所有测试"时，Claude Code 会依次执行以下全部步骤（自动化 + 浏览器 UI）**

```bash
# 安装所有依赖
npm install
cd server && npm install && cd ..
cd daemon && cargo check && cd ..

# 1. 自动化测试
npm run test                    # 前端测试
cd server && npm run test       # Server 测试（单元 + 集成 + 安全 + 性能）
cd src-tauri && cargo test      # Tauri 后端 Rust 测试
cd daemon && cargo test         # Daemon 测试
npx playwright test             # E2E 测试

# 2. 浏览器 UI 测试（Claude Code 使用 agent-browser skill 自动执行）
# 启动开发服务器，然后由 AI 驾驶浏览器验证 10 个页面 + 8 条用户流程
lsof -ti:1420,3001 | xargs kill -9 2>/dev/null || true
npm run dev &
# → Claude Code 调用 agent-browser skill 执行 UI 测试
```

---

## Server 测试

### 测试框架

- **测试框架**: Vitest v2.0
- **HTTP 测试**: supertest
- **覆盖率**: v8

### 目录结构

```
server/
├── __tests__/
│   ├── helpers/
│   │   ├── db.js          # 测试数据库工厂
│   │   └── app.js         # Express App 工厂
│   ├── unit/              # 单元测试
│   │   ├── opc.test.js
│   │   ├── agent.test.js
│   │   ├── channel.test.js
│   │   ├── binding.test.js
│   │   ├── boundary.test.js
│   │   ├── office.test.js
│   │   ├── snapshot.test.js
│   │   ├── log.test.js
│   │   ├── skill.test.js
│   │   ├── tool.test.js
│   │   ├── model.test.js
│   │   └── process.test.js
│   ├── integration/       # 集成测试
│   │   └── opc-lifecycle.test.js
│   ├── security/          # 安全测试
│   │   └── security.test.js
│   └── performance/       # 性能测试
│       └── performance.test.js
└── vitest.config.js
```

### 运行测试

```bash
cd server

# 运行所有测试
npm test

# 监视模式（开发时使用）
npm run test:watch

# 生成覆盖率报告
npm run test:coverage
```

### 测试特点

- **内存数据库**: 每个测试使用独立 SQLite `:memory:`
- **隔离性**: 每个测试文件在独立 worker 中运行
- **工厂函数**: 使用 `makeOpc()`, `makeAgent()` 等辅助函数创建测试数据

### 覆盖率目标

| 指标 | 目标 |
|------|------|
| Lines | 85% |
| Functions | 85% |

---

## 前端测试

### 测试框架

- **测试框架**: Vitest v2.0
- **组件测试**: @testing-library/react
- **Mock**: MSW (Mock Service Worker)
- **环境**: jsdom

### 目录结构

```
src/
├── __tests__/
│   ├── setup.ts           # 测试初始化
│   ├── mocks/
│   │   ├── handlers.ts    # API Mock 处理器
│   │   └── server.ts      # MSW Server
│   ├── helpers/
│   │   └── testing-library.tsx
│   ├── unit/              # 单元测试
│   └── integration/       # 集成测试
```

### 运行测试

```bash
# 运行前端测试
npm run test

# 监视模式
npm run test:watch

# 覆盖率报告
npm run test:coverage
```

### API Mock

前端测试使用 MSW 拦截 API 请求，不依赖真实 Server：

```typescript
import { server } from './mocks/server'

// 测试前启动 server
beforeAll(() => server.listen())

// 每个测试后重置 handlers
afterEach(() => server.resetHandlers())

// 测试后关闭 server
afterAll(() => server.close())
```

---

## Tauri 后端测试

### 测试框架

- **单元测试**: Rust 内置 `#[test]`
- **异步测试**: `#[tokio::test]`

### 目录结构

```
src-tauri/src/
├── commands_test.rs            # Tauri 命令测试
├── integration_tests.rs        # 集成测试
├── utils/
│   ├── crypto.rs               # 加密工具（内联测试）
│   ├── crypto_test.rs          # 加密工具扩展测试
│   └── path.rs                 # 路径工具（内联测试）
├── database/
│   ├── pool.rs                 # 连接池（内联测试）
│   └── migrations.rs           # 迁移（内联测试）
├── models/
│   ├── opc.rs / agent.rs / channel.rs / ...  # 数据模型（内联测试）
├── services/
│   ├── opc_service.rs / agent_service.rs / ...  # 服务层（内联测试）
│   └── opc_service_test.rs     # OPC 服务扩展测试
└── openclaw/
    ├── config.rs / stats.rs / process.rs  # OpenClaw 模块（内联测试）
```

### 运行测试

```bash
cd src-tauri

# 运行所有测试
cargo test

# 输出详细信息
cargo test -- --nocapture

# 运行特定测试模块
cargo test commands_test
cargo test integration_tests
cargo test utils::crypto

# 发布模式测试
cargo test --release
```

---

## Daemon 测试

### 测试框架

- **单元测试**: Rust 内置 `#[test]`
- **HTTP 测试**: axum-test
- **异步测试**: `#[tokio::test]`

### 目录结构

```
daemon/
├── tests/
│   ├── health_test.rs      # Health 端点测试
│   ├── deploy_test.rs      # 部署功能测试
│   └── integration_test.rs # 集成测试
└── Cargo.toml
```

### 运行测试

```bash
cd daemon

# 运行所有测试
cargo test

# 运行特定测试
cargo test test_health_check

# 输出详细信息
cargo test -- --nocapture

# 发布模式测试（验证优化后代码）
cargo test --release
```

### 运行特定测试文件

```bash
# 仅运行 health 测试
cargo test --test health_test

# 仅运行 deploy 测试
cargo test --test deploy_test
```

---

## E2E 测试

### 测试框架

- **框架**: Playwright v1.45
- **浏览器**: Chromium（默认）

### 目录结构

```
├── e2e/
│   └── app.spec.ts        # E2E 测试用例
└── playwright.config.ts   # Playwright 配置
```

### 运行测试

```bash
# 安装 Playwright 浏览器（首次运行）
npx playwright install chromium

# 运行 E2E 测试
npm run test:e2e

# 带 UI 界面运行（调试使用）
npx playwright test --ui

# 生成报告
npx playwright show-report
```

### 测试环境

Playwright 会自动：
1. 启动开发服务器 (`npm run dev`)
2. 在 Chromium 中运行测试
3. 停止服务器

### E2E 测试场景

- 首页加载
- OPC 列表页导航
- 创建 OPC 流程
- Agent 管理流程
- Office 管理流程
- Settings 页面访问

---

## OrbStack 真实部署测试

> ⚠️ **注意**: 这些测试需要手动执行，需要真实的 OrbStack 环境。

### 前置要求

1. **macOS**（OrbStack 仅支持 macOS）
2. **OrbStack 已安装**: https://orbstack.dev
3. **Daemon 已构建**:
   ```bash
   cd daemon && cargo build --release
   ```

### 运行测试

```bash
# 运行完整测试脚本
./tests/orbstack/test-deploy.sh
```

### 手动测试步骤

如果自动脚本失败，可以手动执行：

#### 1. 创建测试 VM

```bash
orb create ubuntu clawpilot-test
```

#### 2. 安装 Daemon

```bash
# 复制到 VM
orb scp daemon/target/release/clawpilot-daemon clawpilot-test:/tmp/

# 安装到系统路径
orb ssh clawpilot-test "sudo mv /tmp/clawpilot-daemon /usr/local/bin/"
orb ssh clawpilot-test "sudo chmod +x /usr/local/bin/clawpilot-daemon"
```

#### 3. 启动 Daemon

```bash
orb ssh clawpilot-test "nohup clawpilot-daemon --listen 0.0.0.0:8443 > /tmp/daemon.log 2>&1 &"
sleep 3
```

#### 4. 验证 Health

```bash
orb ssh clawpilot-test "curl http://localhost:8443/health"
```

预期输出：
```json
{"status":"ok","version":"0.1.0"}
```

#### 5. 测试部署

```bash
# 创建测试包
echo '{"version":"1.0.0"}' > manifest.json
tar -czf package.tar.gz manifest.json

# 上传到 VM
orb scp manifest.json clawpilot-test:/tmp/
orb scp package.tar.gz clawpilot-test:/tmp/

# 执行部署
API_KEY=$(orb ssh clawpilot-test "cat ~/.clawpilot/daemon.key 2>/dev/null || echo 'test-key'")
orb ssh clawpilot-test "curl -X POST \
  -H 'Authorization: Bearer ${API_KEY}' \
  -F 'manifest=@/tmp/manifest.json' \
  -F 'package=@/tmp/package.tar.gz' \
  http://localhost:8443/deploy"
```

#### 6. 清理

```bash
orb ssh clawpilot-test "pkill -f clawpilot-daemon || true"
orb delete clawpilot-test
```

### 测试覆盖场景

| 场景 | 验证点 |
|------|--------|
| Daemon 安装 | 二进制可执行 |
| Daemon 启动 | 端口监听正常 |
| Health 检查 | 返回正确 JSON |
| 部署包上传 | 文件接收成功 |
| 任务状态查询 | 状态返回正常 |

---

## CI/CD 集成

### GitHub Actions 示例

```yaml
name: Tests

on: [push, pull_request]

jobs:
  server-test:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version: '20'
      - run: cd server && npm ci
      - run: cd server && npm test          # 单元 + 集成 + 安全 + 性能
      - run: cd server && npm run test:coverage

  tauri-backend-test:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: dtolnay/rust-toolchain@stable
      - run: cd src-tauri && cargo test

  frontend-test:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version: '20'
      - run: npm ci
      - run: npm run test

  daemon-test:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: dtolnay/rust-action@stable
      - run: cd daemon && cargo test

  e2e-test:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version: '20'
      - run: npm ci
      - run: npx playwright install chromium
      - run: npm run test:e2e
```

### 测试矩阵

| 测试类型 | 本地 | CI/CD | 发布前 |
|---------|------|-------|--------|
| Server 单元 | ✅ | ✅ | ✅ |
| Server 集成 | ✅ | ✅ | ✅ |
| Server 安全 | ✅ | ✅ | ✅ |
| Server 性能 | ✅ | ✅ | ✅ |
| 前端单元 | ✅ | ✅ | ✅ |
| 前端集成 | ✅ | ✅ | ✅ |
| Tauri 后端（Rust）| ✅ | ✅ | ✅ |
| Daemon 单元 | ✅ | ✅ | ✅ |
| E2E | ✅ | ✅ | ✅ |
| OrbStack | ✅ | - | ✅ |

---

## 故障排除

### Server 测试

**问题**: `better-sqlite3` 安装失败
```bash
# macOS
brew install python3 sqlite3
npm rebuild better-sqlite3

# Linux
sudo apt-get install python3 libsqlite3-dev
npm rebuild better-sqlite3
```

**问题**: 测试超时
```bash
# 增加超时时间
npm test -- --testTimeout=30000
```

### 前端测试

**问题**: jsdom 错误
```bash
# 重新安装依赖
rm -rf node_modules
npm install
```

**问题**: MSW 拦截失败
- 检查 `src/__tests__/mocks/handlers.ts` 中的路由匹配
- 确保请求路径以 `/api` 开头

### Tauri 后端测试

**问题**: 编译失败（依赖缺失）
```bash
cd src-tauri && cargo update
```

**问题**: 测试依赖 Tauri runtime 报错
- 纯逻辑单元测试不应依赖 Tauri context，检查测试代码是否正确隔离

### Daemon 测试

**问题**: axum-test 编译失败
```bash
# 更新依赖
cd daemon && cargo update
```

**问题**: 端口冲突
- axum-test 使用随机端口，通常不会冲突
- 检查是否有残留的测试进程

### E2E 测试

**问题**: 浏览器启动失败
```bash
# 重新安装浏览器
npx playwright install chromium
```

**问题**: 测试超时
- 检查开发服务器是否已启动
- 增加 `playwright.config.ts` 中的 `timeout`

### OrbStack 测试

**问题**: VM 创建失败
```bash
# 手动创建
orb create ubuntu clawpilot-test --arch arm64
```

**问题**: SSH 连接失败
```bash
# 检查 OrbStack 状态
orb status

# 重启 OrbStack
orb stop && orb start
```

---

## 测试策略总结

```
测试金字塔:

    ┌─────────────────────────────┐
    │  OrbStack 真实部署测试 (手动) │  ← 验证真实环境部署
    ├─────────────────────────────┤
    │    E2E 测试 (Playwright)    │  ← 验证用户旅程
    ├─────────────────────────────┤
    │   Daemon 集成 (axum-test)   │  ← 验证 HTTP API
    ├─────────────────────────────┤
    │  Server 集成 (supertest)    │  ← 验证业务流程
    ├─────────────────────────────┤
    │  Server 安全 / 性能测试      │  ← 验证安全边界与响应时间
    ├─────────────────────────────┤
    │  Tauri 后端 Rust 测试        │  ← 验证命令层 / 服务层 / 数据层
    ├─────────────────────────────┤
    │     单元测试 (~150)          │  ← 验证单个功能
    └─────────────────────────────┘
```

---

## 浏览器自动化测试（AI 执行）

Claude Code 可通过 `claude-code-harness:agent-browser` skill 自动驾驶浏览器执行 UI 测试，无需人工操作。

### 执行方式

1. 确保开发服务器已启动（端口 1420 / 3001）：
   ```bash
   # 如端口被占用，先清理进程
   lsof -ti:1420,3001 | xargs kill -9 2>/dev/null || true
   # 启动服务器（后台）
   npm run dev &
   ```

2. 告诉 Claude Code 执行浏览器测试，它会自动使用 `agent-browser` skill 完成以下验证：
   - 页面导航与渲染
   - 表单交互（创建 / 编辑 / 删除）
   - 关键用户流程（A–H）
   - 截图留证

### 覆盖范围

| 页面 | 路由 | 验证项 |
|------|------|--------|
| Layout 侧边栏 | 全局 | 导航链接 / 收起展开 / 进程控制 |
| Overview | `#/overview` | 进程控制卡片 / 时间筛选 / 数据展示 |
| OPC 配置 | `#/opc` | 公司列表 / 创建 Modal / 快照管理 |
| Agents 管理 | `#/agents` | Agent 编辑 / 工具配置 / 聊天测试 |
| Bindings 配置 | `#/bindings` | 飞书/钉钉/Slack 渠道 / 群组绑定 |
| Providers | `#/providers` | API Key 配置 / 连接测试 / 模型列表 |
| Office | `#/office` | 本机/远程模式 / Daemon 安装向导 |
| Deploy | `#/deploy` | 部署配置 / 进度条 / 撤销部署 |
| Logs | `#/logs` | 实时日志 / 过滤面板 / 级别 checkbox |
| Settings | `#/settings` | 16 种语言切换 / RTL 布局验证 |

### 暂无法自动化的场景（需人工验证）

- **拖拽排序**：Agents 页面拖拽重排后自动保存
- **文件操作**：Skill 上传/下载、Snapshot 导出/导入、部署包下载
- **网络异常**：离线模式、超时重试、断网恢复
- **并发场景**：多用户同时编辑、部署任务并发执行

---

## 补充说明

### 手动测试清单

完整的 UI 功能测试路径覆盖 10 个页面、~270 个交互元素及 8 条关键用户流程。

执行方式：启动开发服务器后，由 Claude Code 使用 `agent-browser` skill 自动执行，或人工逐项验证。

```bash
# 启动开发服务器
npm run dev
```

#### 页面覆盖范围

| 页面 | 路由 | 交互元素 |
|------|------|---------|
| Layout 侧边栏 | 全局 | 导航链接 / 收起展开 / 进程控制 |
| Overview | `#/overview` | 进程控制卡片 / 时间筛选 / 数据展示 |
| OPC 配置 | `#/opc` | 公司列表 / 创建 Modal / 快照管理 |
| Agents 管理 | `#/agents` | Agent 编辑 / 工具配置 / 聊天测试 |
| Bindings 配置 | `#/bindings` | 飞书/钉钉/Slack 渠道 / 群组绑定 |
| Providers | `#/providers` | API Key 配置 / 连接测试 / 模型列表 |
| Office | `#/office` | 本机/远程模式 / Daemon 安装向导 |
| Deploy | `#/deploy` | 部署配置 / 进度条 / 撤销部署 |
| Logs | `#/logs` | 实时日志 / 过滤面板 / 级别 checkbox |
| Settings | `#/settings` | 16 种语言切换 / RTL 布局验证 |

#### 关键用户流程（TEST_PATHS.md 第 10 节）

| 流程 | 说明 |
|------|------|
| 流程 A | 创建并配置完整 OPC 团队 |
| 流程 B | 部署 OPC 到办公室 |
| 流程 C | 下线 OPC |
| 流程 D | 测试 Agent 对话 |
| 流程 E | 安装技能 |
| 流程 F | 切换语言 / 验证 RTL |
| 流程 G | 查看和过滤日志 |
| 流程 H | 创建配置快照并恢复 |

#### 需额外关注的手动场景（E2E 暂未覆盖）

- **拖拽排序**：Agents 页面拖拽重排后自动保存
- **文件操作**：Skill 上传/下载、Snapshot 导出/导入、部署包下载
- **网络异常**：离线模式、超时重试、断网恢复
- **并发场景**：多用户同时编辑、部署任务并发执行

### 测试数据

测试使用以下固定数据：

- **OPC ID**: `opc-test-{timestamp}`
- **Agent ID**: `agent-test-{timestamp}`
- **Office ID**: `office-test-{timestamp}`

所有测试数据在测试结束后自动清理。

---

**文档更新**: 如测试配置有变更，请同步更新此文档。
