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
6. [agent-browser 测试](#agent-browser-测试非-e2e-代码断言)
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
npx playwright test             # i18n 自动化测试（i18n.spec.ts）

# 2. agent-browser 测试（Claude Code 驾驶浏览器执行，场景见 agent-tests/scenarios.md）
lsof -ti:1420,3001 | xargs kill -9 2>/dev/null || true
npm run dev &
# → 告诉 Claude Code 执行 agent-browser 测试
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

### 目录结构

```
agent-tests/
├── i18n.spec.ts    # i18n 自动化测试（代码断言，16 语言 + RTL + 持久化）
├── scenarios.md    # agent-browser 测试总览（自然语言）
└── office.md       # Office 管理 agent-browser 测试（详细，25 个测试点）
```

### i18n 自动化测试

`i18n.spec.ts` 覆盖 16 种语言切换、RTL 布局、语言持久化、文本溢出检查，共约 44 个用例，有代码断言，结果确定。

```bash
# 安装浏览器（首次运行）
npx playwright install chromium

# 运行
npm run test:e2e

# 带 UI 界面运行（调试）
npx playwright test --ui
```

### agent-browser 测试

场景以自然语言定义，由 Claude Code 调用 `agent-browser` skill 驾驶浏览器执行，pass/fail 由 AI 根据截图和页面状态判断，无代码断言。

| 场景 | 来源文件 | 测试点 |
|------|----------|--------|
| 基础页面加载 | `scenarios.md` | 所有路由正常渲染、无报错 |
| OPC 管理 | `scenarios.md` | 创建 / 编辑 / 删除 / 快照导入导出 |
| Agent 管理 | `scenarios.md` | 创建 / 编辑文档 / 工具配置 / 拖拽排序 |
| 渠道与绑定 | `scenarios.md` | 飞书 / 钉钉 / Slack 凭证配置、Binding 启停 |
| 模型提供商 | `scenarios.md` | API Key 配置、连接测试、模型列表刷新 |
| Office 管理 | `office.md` | CRUD / 地址模式 / 门禁认证 / 物业安装 / Daemon 健康 |
| 部署流程 | `scenarios.md` | 完整部署、撤销部署、部署包下载 |
| 日志 | `scenarios.md` | 实时流、级别 / 组件过滤、清除旧日志 |
| 网络异常处理 | `scenarios.md` | Server 离线时页面降级展示 |
| 表单验证 | `scenarios.md` | 必填字段校验拦截提交 |

执行方式：

```bash
lsof -ti:1420,3001 | xargs kill -9 2>/dev/null || true
npm run dev &
# → 告诉 Claude Code 执行 agent-browser 测试
```

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

  playwright-test:
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

## agent-browser 测试（AI 驾驶浏览器）

Claude Code 通过 `claude-code-harness:agent-browser` skill 驾驶浏览器执行。场景以自然语言定义于 `agent-tests/`，涵盖所有页面的导航与渲染、表单交互、关键用户流程，截图留证。

### 执行方式

```bash
lsof -ti:1420,3001 | xargs kill -9 2>/dev/null || true
npm run dev &
# → 告诉 Claude Code 执行 agent-browser 测试
```

### 暂无法自动化的场景（需人工验证）

- **拖拽排序**：Agents 页面拖拽重排后自动保存
- **文件操作**：Skill 上传/下载、Snapshot 导出/导入、部署包下载
- **网络异常**：离线模式、超时重试、断网恢复
- **并发场景**：多用户同时编辑、部署任务并发执行

---

**文档更新**: 如测试配置有变更，请同步更新此文档。
