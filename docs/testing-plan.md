# ClawPilot 测试方案设计文档

> 版本：v1.1
> 日期：2026-03-20
> 测试范围：Server（Node.js）、前端（React/TypeScript）、Daemon（Rust）、端到端、真实环境部署（OrbStack）
> 不含：Tauri App（阶段二集成后单独补充）

---

## 目录

1. [测试策略概述](#1-测试策略概述)
2. [测试栈选型](#2-测试栈选型)
3. [前置重构要求](#3-前置重构要求)
4. [Server 测试（Node.js）](#4-server-测试nodejs)
   - 4.1 [测试基础设施](#41-测试基础设施)
   - 4.2 [单元测试 — 路由层](#42-单元测试--路由层)
   - 4.3 [集成测试 — 业务流程](#43-集成测试--业务流程)
5. [前端测试（React/TypeScript）](#5-前端测试reacttypescript)
   - 5.1 [测试基础设施](#51-测试基础设施)
   - 5.2 [单元测试 — 工具函数与组件](#52-单元测试--工具函数与组件)
   - 5.3 [集成测试 — 页面](#53-集成测试--页面)
6. [Daemon 测试（Rust）](#6-daemon-测试rust)
   - 6.1 [单元测试](#61-单元测试)
   - 6.2 [集成测试（HTTP）](#62-集成测试http)
7. [端到端测试（Playwright）](#7-端到端测试playwright)
   - 7.1 [环境配置](#71-环境配置)
   - 7.2 [E2E 场景](#72-e2e-场景)
8. [真实环境部署测试（OrbStack）](#8-真实环境部署测试orbstack)
   - 8.1 [测试设计思路](#81-测试设计思路)
   - 8.2 [测试基础设施](#82-测试基础设施)
   - 8.3 [测试场景](#83-测试场景)
   - 8.4 [VM 生命周期管理](#84-vm-生命周期管理)
9. [覆盖率目标](#9-覆盖率目标)
10. [CI/CD 集成](#10-cicd-集成)
11. [实施路径](#11-实施路径)

---

## 1. 测试策略概述

ClawPilot 采用分层测试策略，形成以下测试金字塔：

```
    ┌────────────────────────────┐
    │  真实部署测试 (OrbStack)    │   ← 全链路：真实 VM + 真实 OpenClaw
    ├────────────────────────────┤
    │      E2E 测试 (5)          │   ← Playwright：核心用户旅程
    ├────────────────────────────┤
    │     集成测试 (~30)         │   ← 跨模块业务流程验证
    ├────────────────────────────┤
    │     单元测试 (~150)        │   ← 单路由 / 组件 / 函数
    └────────────────────────────┘
```

**各层职责**

| 层次 | 职责 | 数量目标 |
|------|------|---------|
| 单元测试 | 验证单个函数/路由/组件的逻辑正确性，完全隔离外部依赖 | ~150 |
| 集成测试 | 验证模块间协作，使用真实内存数据库，不 mock 业务逻辑 | ~30 |
| E2E 测试 | 验证完整用户旅程，启动真实 server + 前端 | 5 条主流程 |

**测试原则**

- Server 测试使用内存 SQLite（`:memory:`），每个测试用例独立数据库，互不干扰
- 前端测试使用 msw 拦截 HTTP 请求，不依赖真实 server
- Daemon 测试使用 axum-test 或临时端口启动服务，不依赖真实远程环境
- E2E 测试启动真实 server 和前端，使用专用测试数据库文件

---

## 2. 测试栈选型

| 层次 | 框架 | 版本 | 说明 |
|------|------|------|------|
| Server 单元/集成 | **Vitest** | ^2.0 | 与 Vite 同生态，ESM 原生支持 |
| Server HTTP 测试 | **supertest** | ^7.0 | 对 express app 发起测试请求 |
| 前端单元/集成 | **Vitest** + **@testing-library/react** | ^2.0 / ^16.0 | 组件渲染与交互测试 |
| 前端 API Mock | **msw**（Mock Service Worker） | ^2.0 | 拦截 HTTP 请求，模拟 server responses |
| Daemon 单元 | **Rust 内置 `#[test]`** | — | 无需额外依赖 |
| Daemon HTTP | **axum-test** | ^15.0 | 对 Axum router 发起请求，无需启动端口 |
| Daemon 异步 | **tokio** `#[tokio::test]` | 1.x | 异步测试支持 |
| E2E | **Playwright** | ^1.45 | 跨浏览器，支持 webServer 自动启停 |

**安装命令**

```bash
# Server + 前端测试依赖（server/package.json）
cd server && npm install -D vitest supertest @vitest/coverage-v8

# 前端测试依赖（根 package.json）
npm install -D vitest @testing-library/react @testing-library/user-event \
  @testing-library/jest-dom msw @vitejs/plugin-react jsdom

# E2E
npm install -D playwright @playwright/test
npx playwright install chromium
```

```toml
# daemon/Cargo.toml
[dev-dependencies]
axum-test = "15"
tokio = { version = "1", features = ["full", "test-util"] }
tempfile = "3"
```

---

## 3. 前置重构要求

> **重要**：在编写测试之前，需要对 server 做一处小重构。
> 当前 `routes/*.js` 直接 `import db from '../db.js'`，引用全局单例，无法在测试中注入独立的内存数据库。

### 3.1 路由工厂函数模式

将每个路由文件从直接引用全局 db 改为导出工厂函数，接收 `db` 参数：

```js
// 重构前：routes/opc.js
import db from '../db.js';
const router = express.Router();
router.post('/get_all_opcs', (req, res) => { /* 使用全局 db */ });
export default router;

// 重构后：routes/opc.js
export function createOpcRouter(db) {
  const router = express.Router();
  router.post('/get_all_opcs', (req, res) => { /* 使用注入的 db */ });
  return router;
}
```

### 3.2 db.js 导出 schema 和 migration 函数

```js
// db.js 新增导出，供测试使用
export function createDb(path = ':memory:') {
  const db = new Database(path);
  db.pragma('foreign_keys = ON');
  db.pragma('journal_mode = WAL');
  return db;
}

export function applySchema(db) { /* 建表 SQL */ }
export function runMigrations(db) { /* ALTER TABLE 等增量迁移 */ }

// 默认导出保持不变，生产环境使用
const db = createDb(process.env.DB_PATH || './dev.db');
applySchema(db);
runMigrations(db);
export default db;
```

### 3.3 server/index.js 改为工厂函数

```js
// index.js
export function createApp(db) {
  const app = express();
  app.use(cors());
  app.use(express.json());
  app.use(createAccessLogger());

  app.use('/api', createOpcRouter(db));
  app.use('/api', createAgentRouter(db));
  // ... 其余 11 个路由

  return app;
}

// 生产启动
if (process.argv[1] === fileURLToPath(import.meta.url)) {
  import('./db.js').then(({ default: db }) => {
    const app = createApp(db);
    app.listen(3001);
  });
}
```

---

## 4. Server 测试（Node.js）

### 4.1 测试基础设施

**目录结构**

```
server/
├── __tests__/
│   ├── helpers/
│   │   ├── db.js          # 内存数据库工厂 + 数据种子函数
│   │   └── app.js         # 测试用 express app 工厂
│   ├── unit/
│   │   ├── opc.test.js
│   │   ├── agent.test.js
│   │   ├── model.test.js
│   │   ├── channel.test.js
│   │   ├── binding.test.js
│   │   ├── deployment.test.js
│   │   ├── office.test.js
│   │   ├── snapshot.test.js
│   │   ├── log.test.js
│   │   ├── skill.test.js
│   │   ├── tool.test.js
│   │   └── process.test.js
│   └── integration/
│       ├── opc-lifecycle.test.js
│       ├── agent-binding.test.js
│       ├── deployment-flow.test.js
│       └── snapshot-restore.test.js
├── vitest.config.js
└── package.json
```

**`vitest.config.js`**

```js
import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    environment: 'node',
    coverage: {
      provider: 'v8',
      reporter: ['text', 'lcov'],
      include: ['routes/**', 'db.js', 'logger.js'],
      thresholds: { lines: 85, functions: 85 }
    },
    // 每个测试文件独立 worker，避免 db 状态泄漏
    pool: 'forks',
    poolOptions: { forks: { singleFork: false } }
  }
});
```

**`__tests__/helpers/db.js`**

```js
import Database from 'better-sqlite3';
import { applySchema, runMigrations, seedBaseData } from '../../db.js';

/**
 * 创建隔离的内存数据库实例，含完整 schema 和基础种子数据
 */
export function createTestDb() {
  const db = new Database(':memory:');
  db.pragma('foreign_keys = ON');
  db.pragma('journal_mode = WAL');
  applySchema(db);
  runMigrations(db);
  seedBaseData(db);  // 插入 model_info 等静态数据
  return db;
}

// --- 数据工厂函数 ---

export function makeOpc(db, overrides = {}) {
  const data = {
    id: `opc-${Date.now()}`,
    name: 'Test OPC',
    description: '',
    workspace_path: '/tmp/test',
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
    ...overrides
  };
  db.prepare(`
    INSERT INTO opc_config (id, name, description, workspace_path, created_at, updated_at)
    VALUES (?, ?, ?, ?, ?, ?)
  `).run(data.id, data.name, data.description, data.workspace_path, data.created_at, data.updated_at);
  return data;
}

export function makeAgent(db, opcId, overrides = {}) {
  const data = {
    id: `agent-${Date.now()}`,
    opc_id: opcId,
    name: 'Test Agent',
    role: 'assistant',
    sort_order: 0,
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
    ...overrides
  };
  db.prepare(`
    INSERT INTO agents (id, opc_id, name, role, sort_order, created_at, updated_at)
    VALUES (?, ?, ?, ?, ?, ?, ?)
  `).run(data.id, data.opc_id, data.name, data.role, data.sort_order, data.created_at, data.updated_at);
  // 初始化 7 种文档
  const docTypes = ['SOUL', 'IDENTITY', 'AGENTS', 'USER', 'MEMORY', 'HEARTBEAT', 'TOOLS'];
  for (const type of docTypes) {
    db.prepare(`
      INSERT INTO agent_documents (agent_id, doc_type, content) VALUES (?, ?, '')
    `).run(data.id, type);
  }
  return data;
}

export function makeChannel(db, opcId, overrides = {}) {
  const data = {
    id: `channel-${Date.now()}`,
    opc_id: opcId,
    name: 'Test Channel',
    channel_type: 'FEISHU',
    config: JSON.stringify({}),
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
    ...overrides
  };
  db.prepare(`
    INSERT INTO channels (id, opc_id, name, channel_type, config, created_at, updated_at)
    VALUES (?, ?, ?, ?, ?, ?, ?)
  `).run(data.id, data.opc_id, data.name, data.channel_type, data.config, data.created_at, data.updated_at);
  return data;
}

export function makeBinding(db, opcId, agentId, channelId, overrides = {}) {
  const data = {
    id: `binding-${Date.now()}`,
    opc_id: opcId,
    agent_id: agentId,
    channel_id: channelId,
    trigger_mode: 'MENTION',
    enabled: 1,
    created_at: new Date().toISOString(),
    ...overrides
  };
  db.prepare(`
    INSERT INTO bindings (id, opc_id, agent_id, channel_id, trigger_mode, enabled, created_at)
    VALUES (?, ?, ?, ?, ?, ?, ?)
  `).run(data.id, data.opc_id, data.agent_id, data.channel_id, data.trigger_mode, data.enabled, data.created_at);
  return data;
}

export function makeOffice(db, overrides = {}) {
  const data = {
    id: `office-${Date.now()}`,
    name: 'Test Office',
    host: '127.0.0.1',
    port: 8080,
    api_key: 'test-key',
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
    ...overrides
  };
  db.prepare(`
    INSERT INTO offices (id, name, host, port, api_key, created_at, updated_at)
    VALUES (?, ?, ?, ?, ?, ?, ?)
  `).run(data.id, data.name, data.host, data.port, data.api_key, data.created_at, data.updated_at);
  return data;
}
```

**`__tests__/helpers/app.js`**

```js
import { createApp } from '../../index.js';

export function createTestApp(db) {
  return createApp(db);
}

// 便捷方法：发起 POST /api/<cmd> 请求
export function apiPost(app, cmd, body = {}) {
  return request(app).post(`/api/${cmd}`).send(body);
}
```

---

### 4.2 单元测试 — 路由层

#### OPC 路由（`unit/opc.test.js`）

```js
import { describe, it, expect, beforeEach } from 'vitest';
import request from 'supertest';
import { createTestDb, makeOpc } from '../helpers/db.js';
import { createTestApp } from '../helpers/app.js';

describe('OPC Routes', () => {
  let db, app;

  beforeEach(() => {
    db = createTestDb();
    app = createTestApp(db);
  });

  // --- get_all_opcs ---
  describe('get_all_opcs', () => {
    it('返回空数组（无数据）', async () => {
      const res = await request(app).post('/api/get_all_opcs').send({});
      expect(res.status).toBe(200);
      expect(res.body).toEqual([]);
    });

    it('返回全部 OPC 列表', async () => {
      makeOpc(db, { name: 'OPC A' });
      makeOpc(db, { name: 'OPC B' });
      const res = await request(app).post('/api/get_all_opcs').send({});
      expect(res.body).toHaveLength(2);
    });
  });

  // --- get_opc ---
  describe('get_opc', () => {
    it('存在时返回 OPC 对象（含 stats）', async () => {
      const opc = makeOpc(db);
      const res = await request(app).post('/api/get_opc').send({ id: opc.id });
      expect(res.status).toBe(200);
      expect(res.body.id).toBe(opc.id);
      expect(res.body.name).toBe(opc.name);
    });

    it('不存在时返回 404', async () => {
      const res = await request(app).post('/api/get_opc').send({ id: 'nonexistent' });
      expect(res.status).toBe(404);
    });
  });

  // --- create_opc ---
  describe('create_opc', () => {
    it('创建成功，返回新对象含 id', async () => {
      const res = await request(app).post('/api/create_opc').send({ name: 'New OPC' });
      expect(res.status).toBe(200);
      expect(res.body.id).toBeTruthy();
      expect(res.body.name).toBe('New OPC');
    });

    it('缺少 name 字段返回 400', async () => {
      const res = await request(app).post('/api/create_opc').send({});
      expect(res.status).toBe(400);
    });

    it('name 重复时返回 400', async () => {
      makeOpc(db, { name: 'Duplicate' });
      const res = await request(app).post('/api/create_opc').send({ name: 'Duplicate' });
      expect(res.status).toBe(400);
    });
  });

  // --- update_opc ---
  describe('update_opc', () => {
    it('正常更新字段', async () => {
      const opc = makeOpc(db);
      const res = await request(app).post('/api/update_opc').send({ id: opc.id, name: 'Updated' });
      expect(res.status).toBe(200);
      expect(res.body.name).toBe('Updated');
    });

    it('不存在时返回 404', async () => {
      const res = await request(app).post('/api/update_opc').send({ id: 'ghost', name: 'X' });
      expect(res.status).toBe(404);
    });
  });

  // --- delete_opc ---
  describe('delete_opc', () => {
    it('删除成功', async () => {
      const opc = makeOpc(db);
      const res = await request(app).post('/api/delete_opc').send({ id: opc.id });
      expect(res.status).toBe(200);
    });

    it('级联删除关联 agents/channels/bindings', async () => {
      const { makeAgent, makeChannel, makeBinding } = await import('../helpers/db.js');
      const opc = makeOpc(db);
      const agent = makeAgent(db, opc.id);
      const channel = makeChannel(db, opc.id);
      makeBinding(db, opc.id, agent.id, channel.id);

      await request(app).post('/api/delete_opc').send({ id: opc.id });

      const agents = db.prepare('SELECT * FROM agents WHERE opc_id = ?').all(opc.id);
      const channels = db.prepare('SELECT * FROM channels WHERE opc_id = ?').all(opc.id);
      const bindings = db.prepare('SELECT * FROM bindings WHERE opc_id = ?').all(opc.id);
      expect(agents).toHaveLength(0);
      expect(channels).toHaveLength(0);
      expect(bindings).toHaveLength(0);
    });
  });

  // --- set_current_opc / get_current_opc ---
  describe('current opc', () => {
    it('设置后读取返回正确 OPC', async () => {
      const opc = makeOpc(db);
      await request(app).post('/api/set_current_opc').send({ id: opc.id });
      const res = await request(app).post('/api/get_current_opc').send({});
      expect(res.body.id).toBe(opc.id);
    });

    it('切换 current 时旧的被替换', async () => {
      const opc1 = makeOpc(db);
      const opc2 = makeOpc(db);
      await request(app).post('/api/set_current_opc').send({ id: opc1.id });
      await request(app).post('/api/set_current_opc').send({ id: opc2.id });
      const res = await request(app).post('/api/get_current_opc').send({});
      expect(res.body.id).toBe(opc2.id);
    });
  });

  // --- export_opc / import_opc ---
  describe('export_opc / import_opc', () => {
    it('导出为合法 JSON 结构，含 agents/channels/bindings', async () => {
      const opc = makeOpc(db);
      makeAgent(db, opc.id);
      makeChannel(db, opc.id);
      const res = await request(app).post('/api/export_opc').send({ id: opc.id });
      expect(res.status).toBe(200);
      expect(res.body).toHaveProperty('opc');
      expect(res.body).toHaveProperty('agents');
      expect(res.body).toHaveProperty('channels');
      expect(res.body).toHaveProperty('bindings');
    });

    it('导入恢复完整关联数据', async () => {
      const opc = makeOpc(db);
      const agent = makeAgent(db, opc.id);
      const exportRes = await request(app).post('/api/export_opc').send({ id: opc.id });
      const exported = exportRes.body;

      // 删除原 OPC
      await request(app).post('/api/delete_opc').send({ id: opc.id });

      // 导入
      const importRes = await request(app).post('/api/import_opc').send({ data: exported });
      expect(importRes.status).toBe(200);

      const agents = db.prepare('SELECT * FROM agents WHERE opc_id = ?').all(importRes.body.id);
      expect(agents).toHaveLength(1);
    });
  });

  // --- get_opc_stats ---
  describe('get_opc_stats', () => {
    it('返回正确的 agent/channel/binding 数量', async () => {
      const opc = makeOpc(db);
      const agent = makeAgent(db, opc.id);
      const channel = makeChannel(db, opc.id);
      makeBinding(db, opc.id, agent.id, channel.id);

      const res = await request(app).post('/api/get_opc_stats').send({ id: opc.id });
      expect(res.body.agent_count).toBe(1);
      expect(res.body.channel_count).toBe(1);
      expect(res.body.binding_count).toBe(1);
    });
  });
});
```

#### Agent 路由测试用例列表（`unit/agent.test.js`）

| 测试用例 | 验证点 |
|---------|--------|
| `get_agents` — 按 opc_id 过滤 | 只返回指定 OPC 的 agents |
| `get_agents` — 按 sort_order 排序 | 列表顺序与 sort_order 一致 |
| `create_agent` — 自动设置 sort_order | 新建 agent sort_order = 已有数量 |
| `create_agent` — 自动初始化 7 种文档 | agent_documents 表有 7 条记录 |
| `update_agent` — 更新基本字段 | name/role 等字段更新成功 |
| `update_agent` — 不能更改 opc_id | opc_id 变更被拒绝或忽略 |
| `delete_agent` — 级联删除文档 | agent_documents 记录同时删除 |
| `reorder_agents` — sort_order 连续 | 调整后 sort_order 值连续无空洞 |
| `get_agent_document` — 各文档类型 | 读取 SOUL/IDENTITY/AGENTS/USER/MEMORY/HEARTBEAT/TOOLS |
| `update_agent_document` — 持久化 | 写入后再读取内容一致 |

#### Model 路由测试用例列表（`unit/model.test.js`）

| 测试用例 | 验证点 |
|---------|--------|
| `get_providers` — 返回 3 个 provider | BAILIAN/VOLCENGINE/MINIMAX 均存在 |
| `get_providers` — api_key 脱敏 | api_key 不明文返回（`***` 或 null） |
| `update_provider` — 正常更新 | api_key 加密存储，读取返回脱敏值 |
| `update_provider` — 无效 provider_type | 返回 400 |
| `get_models` — 按 provider_type 过滤 | 只返回对应 provider 的 models |
| `get_models` — 返回完整元信息 | context_window/vision/streaming 字段存在 |
| `test_provider` — 成功 | 返回 `{ ok: true }`（需 mock 外部 HTTP） |
| `test_provider` — API Key 无效 | 返回错误详情（需 mock 外部 HTTP） |

#### Channel 路由测试用例列表（`unit/channel.test.js`）

| 测试用例 | 验证点 |
|---------|--------|
| `upsert_channel` — 新建 | 创建成功，返回 id |
| `upsert_channel` — 更新已有（幂等） | 相同 id 更新，不创建重复 |
| `upsert_channel` — FEISHU 字段验证 | app_id/app_secret 必填 |
| `upsert_channel` — SLACK 字段验证 | bot_token 必填 |
| `delete_channel` — 有关联 binding 时 | 级联删除 binding 或返回 409 |
| `test_feishu_connection` — 参数不完整 | 本地返回 400，不发网络请求 |

#### Binding 路由测试用例列表（`unit/binding.test.js`）

| 测试用例 | 验证点 |
|---------|--------|
| `create_binding` — agent 和 channel 同属一个 opc | 成功 |
| `create_binding` — 跨 opc 被拒绝 | 返回 400 |
| `create_binding` — 重复 binding | 返回 400 |
| `update_binding` — 更新 trigger_mode | ALL/MENTION 切换成功 |
| `toggle_binding` — enabled=true→false | binding.enabled 变为 0 |
| `toggle_binding` — 不存在时 | 返回 404 |
| `delete_binding` — 成功 | 记录从 bindings 表删除 |
| `get_feishu_channels` — 只返回 FEISHU | channel_type != FEISHU 的不出现 |

#### Office 路由测试用例列表（`unit/office.test.js`）

| 测试用例 | 验证点 |
|---------|--------|
| `create_office` — 正常创建 | 返回含 id 的 office 对象 |
| `update_office` — 更新 host/port | 字段更新成功 |
| `delete_office` — 级联删除部署记录 | office_deployments 同步删除 |
| `install_daemon` — 参数校验 | host/port/api_key 必填，缺失返回 400 |
| `install_daemon` — 网络错误 | 返回 `{ success: false, message: '...' }` |
| `check_daemon_health` — 健康 | 返回 `{ healthy: true }` |
| `check_daemon_health` — 超时/不可达 | 返回 `{ healthy: false }` |
| `deploy_to_office` — 创建 deployment_task | status=PENDING |
| `deploy_to_office` — office 不存在 | 返回 404 |

#### Snapshot 路由测试用例列表（`unit/snapshot.test.js`）

| 测试用例 | 验证点 |
|---------|--------|
| `create_snapshot` — 导出全量数据 | 包含 opc/agents/channels/bindings |
| `create_snapshot` — 设置 created_at | 时间戳非空 |
| `get_snapshots` — 按 opc_id 过滤 | 只返回指定 opc 的快照 |
| `restore_snapshot` — 恢复后数据一致 | agents 数量/内容与快照匹配 |
| `restore_snapshot` — 恢复时清除旧数据 | 快照之后新建的 agent 被移除 |
| `delete_snapshot` — 不影响 OPC 数据 | OPC 和 agents 仍存在 |

#### Log 路由测试用例列表（`unit/log.test.js`）

| 测试用例 | 验证点 |
|---------|--------|
| `write_log` — 各级别写入 | DEBUG/INFO/WARN/ERROR 均成功 |
| `write_log` — 保存 module 字段 | module 值写入并可查询 |
| `get_logs` — level 过滤 | 只返回指定 level |
| `get_logs` — module 过滤 | 只返回指定 module |
| `get_logs` — 时间范围过滤 | start_time/end_time 边界正确 |
| `get_logs` — 分页 | limit/offset 工作正常 |

---

### 4.3 集成测试 — 业务流程

#### OPC 完整生命周期（`integration/opc-lifecycle.test.js`）

```
describe('OPC 完整生命周期')

场景 1：创建 → 配置 → 导出 → 导入
  ✓ 创建 OPC
  ✓ 设为当前 OPC
  ✓ 添加 2 个 Agent（含文档）
  ✓ 添加 1 个 Channel（FEISHU）
  ✓ 建立 Binding
  ✓ 导出 → 验证 JSON 结构完整
  ✓ 导入到新 DB → 验证所有关联数据恢复（agent 数量、文档内容、binding 状态）

场景 2：删除 OPC 级联清理
  ✓ 创建 OPC + Agent + Channel + Binding + Snapshot
  ✓ 删除 OPC
  ✓ 验证 agents 表无残留
  ✓ 验证 channels 表无残留
  ✓ 验证 bindings 表无残留
  ✓ 验证 agent_documents 表无残留
  ✓ 验证 local_snapshots 根据配置处理（保留或级联删除）

场景 3：多 OPC 切换
  ✓ 创建 OPC-A、OPC-B
  ✓ 各自添加不同数量的 agents
  ✓ set_current_opc(A) → get_current_opc 返回 A
  ✓ set_current_opc(B) → get_current_opc 返回 B，A 不再是 current
  ✓ get_agents 按 current opc 过滤正确
```

#### Agent-Binding 关联流程（`integration/agent-binding.test.js`）

```
场景 1：完整 binding 创建流程
  ✓ 创建 OPC → Agent → Channel → Binding
  ✓ 验证 binding 包含正确的 agent_id 和 channel_id
  ✓ toggle off → 验证 enabled=false
  ✓ toggle on → 验证 enabled=true

场景 2：级联删除验证
  ✓ 删除 agent → 关联 binding 自动删除
  ✓ 删除 channel → 关联 binding 自动删除
  ✓ 删除 opc → 全部 bindings 删除

场景 3：跨 OPC 约束
  ✓ 尝试为不同 OPC 的 agent 和 channel 建立 binding → 返回 400

场景 4：agent 排序
  ✓ 创建 3 个 agents
  ✓ reorder_agents 打乱顺序
  ✓ get_agents 返回新顺序
  ✓ sort_order 值连续（0, 1, 2）
```

#### 部署流程（`integration/deployment-flow.test.js`）

```
场景 1：构建部署包
  ✓ 创建完整 OPC 配置（含 agents/channels/bindings）
  ✓ build_deploy_package → 返回文件路径
  ✓ 验证文件存在且为合法 tar.gz 格式
  ✓ 解压验证包含 openclaw.json 和 agents.json5

场景 2：部署任务生命周期
  ✓ start_deployment → 创建 deployment_task，status=PENDING
  ✓ get_deployment_status → 返回任务步骤列表
  ✓ cancel_deployment → status=FAILED
  ✓ 对已取消任务再次 cancel → 返回 400

场景 3：历史记录查询
  ✓ 创建多个 deployment_task（不同 office）
  ✓ get_recent_deployments → 按时间倒序返回
  ✓ get_office_deployments(officeId) → 只返回指定 office 的任务
```

#### 快照恢复流程（`integration/snapshot-restore.test.js`）

```
场景 1：完整快照 → 修改 → 恢复
  ✓ 创建 OPC + 2 个 agents
  ✓ create_snapshot → 记录快照 ID
  ✓ 添加第 3 个 agent，修改第 1 个 agent 的 SOUL 文档
  ✓ restore_snapshot → 恢复
  ✓ 验证 agents 数量回到 2
  ✓ 验证 agent 1 的 SOUL 文档内容还原

场景 2：快照数据完整性
  ✓ 快照包含 agents、channels、bindings、agent_documents
  ✓ 恢复后所有关联关系完整（bindings 指向正确的 agent_id/channel_id）

场景 3：多快照管理
  ✓ 创建 3 个快照（s1, s2, s3）
  ✓ get_snapshots → 返回 3 个，含 created_at
  ✓ delete_snapshot(s2) → 只剩 s1, s3
  ✓ 恢复 s1 → OPC 数据回到 s1 时刻
```

---

## 5. 前端测试（React/TypeScript）

### 5.1 测试基础设施

**目录结构**

```
src/
├── __tests__/
│   ├── setup.ts                   # 全局 setup：msw server 启动、testing-library 扩展
│   ├── mocks/
│   │   ├── server.ts              # msw setupServer
│   │   ├── handlers.ts            # 所有 API endpoints 的 handler 定义
│   │   └── fixtures.ts            # 测试数据常量
│   ├── unit/
│   │   ├── lib/
│   │   │   ├── api.test.ts        # call() 函数测试
│   │   │   └── types.test.ts      # 类型相关测试
│   │   └── components/
│   │       ├── Toast.test.tsx
│   │       ├── Layout.test.tsx
│   │       └── ThreeColumnLayout.test.tsx
│   └── integration/
│       ├── OpcPage.test.tsx
│       ├── AgentsPage.test.tsx
│       ├── ProvidersPage.test.tsx
│       ├── BindingsPage.test.tsx
│       └── OfficePage.test.tsx
```

**`vitest.config.ts`（根目录更新）**

```ts
import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  test: {
    environment: 'jsdom',
    setupFiles: ['./src/__tests__/setup.ts'],
    coverage: {
      provider: 'v8',
      reporter: ['text', 'lcov'],
      include: ['src/**'],
      exclude: ['src/__tests__/**', 'src/main.tsx'],
      thresholds: { lines: 70 }
    }
  }
});
```

**`src/__tests__/setup.ts`**

```ts
import '@testing-library/jest-dom';
import { beforeAll, afterEach, afterAll } from 'vitest';
import { server } from './mocks/server';

beforeAll(() => server.listen({ onUnhandledRequest: 'warn' }));
afterEach(() => server.resetHandlers());
afterAll(() => server.close());
```

**`src/__tests__/mocks/handlers.ts`**

```ts
import { http, HttpResponse } from 'msw';
import * as f from './fixtures';

export const handlers = [
  // OPC
  http.post('http://localhost:3001/api/get_all_opcs', () =>
    HttpResponse.json([f.opc1, f.opc2])),
  http.post('http://localhost:3001/api/get_opc', async ({ request }) => {
    const { id } = await request.json() as { id: string };
    const opc = [f.opc1, f.opc2].find(o => o.id === id);
    return opc ? HttpResponse.json(opc) : new HttpResponse(null, { status: 404 });
  }),
  http.post('http://localhost:3001/api/create_opc', async ({ request }) => {
    const body = await request.json() as any;
    return HttpResponse.json({ ...f.opc1, id: 'new-opc-id', name: body.name });
  }),
  http.post('http://localhost:3001/api/get_current_opc', () =>
    HttpResponse.json(f.opc1)),
  http.post('http://localhost:3001/api/set_current_opc', () =>
    HttpResponse.json({ success: true })),

  // Agents
  http.post('http://localhost:3001/api/get_agents', () =>
    HttpResponse.json([f.agent1, f.agent2])),
  http.post('http://localhost:3001/api/create_agent', async ({ request }) => {
    const body = await request.json() as any;
    return HttpResponse.json({ ...f.agent1, id: 'new-agent-id', name: body.name });
  }),

  // ... 覆盖全部 60+ endpoints
];
```

**`src/__tests__/mocks/fixtures.ts`**

```ts
export const opc1 = {
  id: 'opc-1',
  name: 'Production Team',
  description: 'Main team',
  workspace_path: '/workspace',
  created_at: '2026-01-01T00:00:00Z',
  updated_at: '2026-01-01T00:00:00Z',
};

export const agent1 = {
  id: 'agent-1',
  opc_id: 'opc-1',
  name: 'Support Bot',
  role: 'assistant',
  model_provider: 'BAILIAN',
  model_name: 'qwen-max',
  sort_order: 0,
};

// ... 其他 fixtures
```

---

### 5.2 单元测试 — 工具函数与组件

#### `lib/api.ts` 测试（`unit/lib/api.test.ts`）

```ts
describe('call() 函数', () => {
  it('DEV 模式：路由到正确的 HTTP 端点', async () => {
    // 不注入 __TAURI_INTERNALS__
    // 通过 msw 拦截 http://localhost:3001/api/get_all_opcs
    // 验证请求方法为 POST，body 序列化正确
  });

  it('返回服务器响应的数据', async () => {
    const result = await call('get_all_opcs', {});
    expect(result).toEqual([fixtures.opc1, fixtures.opc2]);
  });

  it('服务器返回 500 时抛出 Error', async () => {
    server.use(
      http.post('*/api/get_all_opcs', () => new HttpResponse(null, { status: 500 }))
    );
    await expect(call('get_all_opcs', {})).rejects.toThrow();
  });

  it('网络断开时抛出 Error', async () => {
    server.use(
      http.post('*/api/get_all_opcs', () => HttpResponse.error())
    );
    await expect(call('get_all_opcs', {})).rejects.toThrow();
  });
});

describe('具体 API 函数', () => {
  it('getOpc(id) 发送正确的 id 参数', async () => {
    let capturedBody: any;
    server.use(
      http.post('*/api/get_opc', async ({ request }) => {
        capturedBody = await request.json();
        return HttpResponse.json(fixtures.opc1);
      })
    );
    await getOpc('opc-1');
    expect(capturedBody.id).toBe('opc-1');
  });

  it('createAgent(payload) 正确序列化所有字段', async () => { /* ... */ });
  it('deployToOffice(opcId, officeId) 参数映射正确', async () => { /* ... */ });
});
```

#### Toast 组件测试（`unit/components/Toast.test.tsx`）

```ts
describe('Toast 组件', () => {
  it('渲染 success 类型，含正确图标和文字', () => {
    render(<Toast type="success" message="操作成功" />);
    expect(screen.getByText('操作成功')).toBeInTheDocument();
    expect(screen.getByRole('alert')).toHaveClass('toast-success');
  });

  it('渲染 error 类型', () => { /* ... */ });
  it('渲染 warning 类型', () => { /* ... */ });

  it('自动在 3s 后消失（timer）', async () => {
    vi.useFakeTimers();
    const onClose = vi.fn();
    render(<Toast type="info" message="test" onClose={onClose} duration={3000} />);
    vi.advanceTimersByTime(3000);
    expect(onClose).toHaveBeenCalled();
    vi.useRealTimers();
  });

  it('点击关闭按钮调用 onClose', async () => {
    const onClose = vi.fn();
    render(<Toast type="info" message="test" onClose={onClose} />);
    await userEvent.click(screen.getByRole('button', { name: /close/i }));
    expect(onClose).toHaveBeenCalled();
  });
});
```

#### ThreeColumnLayout 组件测试

```ts
describe('ThreeColumnLayout', () => {
  it('渲染左侧列表项', () => { /* ... */ });
  it('点击列表项触发 onSelect 回调', async () => { /* ... */ });
  it('items 为空时显示空状态', () => { /* ... */ });
  it('选中项高亮显示', () => { /* ... */ });
});
```

---

### 5.3 集成测试 — 页面

#### OpcPage 集成测试（`integration/OpcPage.test.tsx`）

```ts
describe('OpcPage', () => {
  function renderPage() {
    return render(
      <OpcProvider>
        <OpcPage />
      </OpcProvider>
    );
  }

  describe('初始加载', () => {
    it('显示 OPC 列表', async () => {
      renderPage();
      expect(await screen.findByText('Production Team')).toBeInTheDocument();
      expect(await screen.findByText('Dev Team')).toBeInTheDocument();
    });

    it('API 错误时显示错误 toast', async () => {
      server.use(
        http.post('*/api/get_all_opcs', () => new HttpResponse(null, { status: 500 }))
      );
      renderPage();
      expect(await screen.findByRole('alert')).toBeInTheDocument();
    });
  });

  describe('创建 OPC', () => {
    it('填写表单 → 提交 → 列表更新', async () => {
      const user = userEvent.setup();
      renderPage();
      await user.click(screen.getByRole('button', { name: /新建/i }));
      await user.type(screen.getByLabelText(/名称/i), 'New Team');
      await user.click(screen.getByRole('button', { name: /确认/i }));
      expect(await screen.findByText('New Team')).toBeInTheDocument();
    });

    it('name 为空时提交被阻止，显示验证错误', async () => {
      const user = userEvent.setup();
      renderPage();
      await user.click(screen.getByRole('button', { name: /新建/i }));
      await user.click(screen.getByRole('button', { name: /确认/i }));
      expect(screen.getByText(/名称不能为空/i)).toBeInTheDocument();
    });
  });

  describe('删除 OPC', () => {
    it('点击删除 → 出现确认对话框 → 确认后列表刷新', async () => {
      const user = userEvent.setup();
      renderPage();
      await screen.findByText('Production Team');
      await user.click(screen.getAllByRole('button', { name: /删除/i })[0]);
      expect(screen.getByRole('dialog')).toBeInTheDocument();
      await user.click(screen.getByRole('button', { name: /确认删除/i }));
      expect(screen.queryByText('Production Team')).not.toBeInTheDocument();
    });
  });
});
```

#### AgentsPage 集成测试用例（`integration/AgentsPage.test.tsx`）

| 测试用例 | 验证点 |
|---------|--------|
| 按 currentOpc 加载 agent 列表 | 调用 get_agents 携带正确 opc_id |
| 无 currentOpc 时显示引导提示 | "请先选择 OPC" 之类提示可见 |
| 创建 agent → 文档初始化 | 7 种文档 tab 可见 |
| 编辑 SOUL 文档 → 保存 → 持久化 | 内容在页面刷新后仍存在（通过 msw 验证请求） |
| 点击 agent → 右侧显示详情面板 | 详情面板出现 |

#### ProvidersPage 集成测试用例（`integration/ProvidersPage.test.tsx`）

| 测试用例 | 验证点 |
|---------|--------|
| 显示 3 个 provider 卡片 | BAILIAN/VOLCENGINE/MINIMAX 卡片可见 |
| 编辑 API Key → 输入 → 保存 | 触发 update_provider 请求 |
| Test Connection 成功 | 显示"连接成功"提示 |
| Test Connection 失败 | 显示错误详情 |
| 模型列表展开 | 点击 provider 展开显示模型列表 |

#### BindingsPage 集成测试用例（`integration/BindingsPage.test.tsx`）

| 测试用例 | 验证点 |
|---------|--------|
| 显示 agent-channel 绑定列表 | binding 行可见 |
| 创建 binding | 选择 agent + channel → 提交 |
| toggle binding 开关 | 开关状态切换，触发 toggle_binding 请求 |
| 删除 binding | 确认后从列表消失 |
| 无 agent 或无 channel 时空状态 | 显示"请先添加 Agent/Channel" |

#### OfficePage 集成测试用例（`integration/OfficePage.test.tsx`）

| 测试用例 | 验证点 |
|---------|--------|
| 办公室列表加载 | 显示已有办公室 |
| 创建办公室 | 填写 host/port → 提交 → 列表更新 |
| 检查 daemon 健康 | 点击按钮 → 显示健康/不健康 badge |
| 一键部署 | 部署进度步骤列表可见 |
| 部署失败展示 | 失败步骤标红，错误信息可见 |

---

## 6. Daemon 测试（Rust）

### 6.1 单元测试

**目录结构**

```
daemon/
└── src/
    ├── auth.rs         (含 #[cfg(test)] 模块)
    ├── deploy.rs       (含 #[cfg(test)] 模块)
    ├── state.rs        (含 #[cfg(test)] 模块)
    └── tests/
        ├── mod.rs
        ├── routes_test.rs
        └── helpers.rs
```

**`auth.rs` 单元测试**

```rust
#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_valid_api_key_passes() {
        let state = AppState::new_with_key("secret-key-123");
        let result = verify_api_key("secret-key-123", &state);
        assert!(result.is_ok());
    }

    #[test]
    fn test_wrong_api_key_rejected() {
        let state = AppState::new_with_key("secret-key-123");
        let result = verify_api_key("wrong-key", &state);
        assert!(result.is_err());
    }

    #[test]
    fn test_empty_api_key_rejected() {
        let state = AppState::new_with_key("secret-key-123");
        let result = verify_api_key("", &state);
        assert!(result.is_err());
    }

    #[test]
    fn test_api_key_generated_on_first_run() {
        let tmp = tempfile::tempdir().unwrap();
        let key_path = tmp.path().join("api.key");
        // 文件不存在时应自动生成
        let key = load_or_generate_api_key(&key_path).unwrap();
        assert!(!key.is_empty());
        assert!(key_path.exists());
    }

    #[test]
    fn test_api_key_loaded_from_file() {
        let tmp = tempfile::tempdir().unwrap();
        let key_path = tmp.path().join("api.key");
        std::fs::write(&key_path, "my-predefined-key").unwrap();
        let key = load_or_generate_api_key(&key_path).unwrap();
        assert_eq!(key, "my-predefined-key");
    }
}
```

**`deploy.rs` 单元测试**

```rust
#[cfg(test)]
mod tests {
    use super::*;
    use tempfile::tempdir;

    #[test]
    fn test_extract_tar_gz_to_dir() {
        // 创建测试用 tar.gz（内含 openclaw.json）
        let tmp = tempdir().unwrap();
        let archive = create_test_archive(&tmp, vec![
            ("openclaw.json", r#"{"name":"test"}"#),
            ("agents.json5", "{}"),
        ]);
        extract_archive(&archive, tmp.path()).unwrap();
        assert!(tmp.path().join("openclaw.json").exists());
    }

    #[test]
    fn test_validate_package_structure_valid() {
        let tmp = tempdir().unwrap();
        std::fs::write(tmp.path().join("openclaw.json"), "{}").unwrap();
        std::fs::write(tmp.path().join("agents.json5"), "{}").unwrap();
        let result = validate_package_structure(tmp.path());
        assert!(result.is_ok());
    }

    #[test]
    fn test_validate_package_structure_missing_required_file() {
        let tmp = tempdir().unwrap();
        // 缺少 openclaw.json
        let result = validate_package_structure(tmp.path());
        assert!(result.is_err());
    }

    #[test]
    fn test_build_start_command() {
        let cmd = build_openclaw_command("/opt/openclaw/bin/openclaw", "/deploy/dir");
        assert!(cmd.contains("--config"));
        assert!(cmd.contains("/deploy/dir"));
    }
}
```

**`state.rs` 单元测试**

```rust
#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_initial_state_is_idle() {
        let state = AppState::new_with_key("test");
        let status = state.deployment_status.read().unwrap();
        assert_eq!(*status, DeploymentStatus::Idle);
    }

    #[tokio::test]
    async fn test_concurrent_status_access() {
        let state = Arc::new(AppState::new_with_key("test"));
        let state2 = Arc::clone(&state);

        // 并发读写
        let write = tokio::spawn(async move {
            *state2.deployment_status.write().unwrap() = DeploymentStatus::Running;
        });
        let read = tokio::spawn(async move {
            let _ = state.deployment_status.read().unwrap();
        });
        tokio::join!(write, read);
    }
}
```

---

### 6.2 集成测试（HTTP）

**`tests/routes_test.rs`**

```rust
use axum_test::TestServer;
use crate::create_app;   // app 工厂函数

async fn create_test_server() -> (TestServer, String) {
    let api_key = "test-api-key-12345".to_string();
    let state = AppState::new_with_key(&api_key);
    let app = create_app(Arc::new(state));
    (TestServer::new(app).unwrap(), api_key)
}

#[tokio::test]
async fn test_health_endpoint_no_auth_required() {
    let (server, _) = create_test_server().await;
    let res = server.get("/health").await;
    res.assert_status_ok();
    let body: serde_json::Value = res.json();
    assert_eq!(body["status"], "ok");
}

#[tokio::test]
async fn test_deploy_without_api_key_returns_401() {
    let (server, _) = create_test_server().await;
    let res = server.post("/deploy").await;
    res.assert_status(StatusCode::UNAUTHORIZED);
}

#[tokio::test]
async fn test_deploy_with_wrong_api_key_returns_401() {
    let (server, _) = create_test_server().await;
    let res = server
        .post("/deploy")
        .add_header("Authorization", "Bearer wrong-key")
        .await;
    res.assert_status(StatusCode::UNAUTHORIZED);
}

#[tokio::test]
async fn test_deploy_with_valid_package() {
    let (server, api_key) = create_test_server().await;
    let package = create_test_tar_gz();  // 测试辅助函数

    let res = server
        .post("/deploy")
        .add_header("Authorization", format!("Bearer {}", api_key))
        .bytes(package)
        .await;
    res.assert_status_ok();
}

#[tokio::test]
async fn test_status_endpoint() {
    let (server, api_key) = create_test_server().await;
    let res = server
        .get("/status")
        .add_header("Authorization", format!("Bearer {}", api_key))
        .await;
    res.assert_status_ok();
    let body: serde_json::Value = res.json();
    assert!(body.get("status").is_some());
}

#[tokio::test]
async fn test_undeploy_endpoint() {
    let (server, api_key) = create_test_server().await;
    // 先部署
    let package = create_test_tar_gz();
    server
        .post("/deploy")
        .add_header("Authorization", format!("Bearer {}", api_key))
        .bytes(package)
        .await;

    // 再撤销
    let res = server
        .post("/undeploy")
        .add_header("Authorization", format!("Bearer {}", api_key))
        .await;
    res.assert_status_ok();
}

#[tokio::test]
async fn test_full_deploy_lifecycle() {
    // 部署 → 查状态 → 撤销 → 查状态
    let (server, api_key) = create_test_server().await;

    // 1. 部署
    let package = create_test_tar_gz();
    server
        .post("/deploy")
        .add_header("Authorization", format!("Bearer {}", api_key))
        .bytes(package)
        .await
        .assert_status_ok();

    // 2. 查状态
    let status_res = server
        .get("/status")
        .add_header("Authorization", format!("Bearer {}", api_key))
        .await;
    let body: serde_json::Value = status_res.json();
    // 状态为 deployed 或 running
    assert!(matches!(body["status"].as_str(), Some("deployed") | Some("running")));

    // 3. 撤销
    server
        .post("/undeploy")
        .add_header("Authorization", format!("Bearer {}", api_key))
        .await
        .assert_status_ok();
}
```

---

## 7. 端到端测试（Playwright）

### 7.1 环境配置

**目录结构**

```
e2e/
├── playwright.config.ts
├── fixtures/
│   ├── data.ts          # E2E 测试用数据常量
│   └── server.ts        # server 启停辅助
├── helpers/
│   ├── api.ts           # 直接调用 server API 的辅助函数（用于 setup/teardown）
│   └── pages.ts         # Page Object Model 定义
└── specs/
    ├── opc-management.spec.ts
    ├── agent-configuration.spec.ts
    ├── deployment-workflow.spec.ts
    ├── snapshot-management.spec.ts
    └── providers.spec.ts
```

**`e2e/playwright.config.ts`**

```ts
import { defineConfig, devices } from '@playwright/test';

export default defineConfig({
  testDir: './e2e/specs',
  timeout: 30_000,
  retries: process.env.CI ? 2 : 0,
  reporter: [['html', { outputFolder: 'e2e/report' }]],

  use: {
    baseURL: 'http://localhost:4173',
    trace: 'on-first-retry',
    screenshot: 'only-on-failure',
  },

  webServer: [
    {
      // 独立测试数据库
      command: 'DB_PATH=./e2e-test.db node server/index.js',
      port: 3001,
      reuseExistingServer: false,
      timeout: 10_000,
    },
    {
      command: 'vite build && vite preview --port 4173',
      port: 4173,
      reuseExistingServer: false,
      timeout: 30_000,
    },
  ],

  projects: [
    { name: 'chromium', use: { ...devices['Desktop Chrome'] } },
  ],
});
```

**Page Object Model（`e2e/helpers/pages.ts`）**

```ts
import { Page, Locator } from '@playwright/test';

export class OpcListPage {
  readonly createButton: Locator;
  readonly opcItems: Locator;

  constructor(readonly page: Page) {
    this.createButton = page.getByRole('button', { name: /新建 OPC/i });
    this.opcItems = page.locator('[data-testid="opc-item"]');
  }

  async goto() { await this.page.goto('/#/opc'); }
  async createOpc(name: string) {
    await this.createButton.click();
    await this.page.getByLabel(/名称/).fill(name);
    await this.page.getByRole('button', { name: /确认/ }).click();
  }
}

// 类似地定义 AgentsPage, BindingsPage, OfficePage
```

---

### 7.2 E2E 场景

#### 场景 1：OPC 管理完整流程（`opc-management.spec.ts`）

```ts
test.describe('OPC 管理', () => {
  test('首次打开应用，引导创建第一个 OPC', async ({ page }) => {
    await page.goto('/');
    await expect(page.getByText(/创建你的第一个 OPC/i)).toBeVisible();
  });

  test('创建 OPC → 出现在列表 → 设为当前', async ({ page }) => {
    const opcPage = new OpcListPage(page);
    await opcPage.goto();

    await opcPage.createOpc('E2E Test Team');
    await expect(page.getByText('E2E Test Team')).toBeVisible();

    await page.getByText('E2E Test Team').locator('..').getByRole('button', { name: /设为当前/ }).click();
    await expect(page.getByTestId('current-opc-name')).toHaveText('E2E Test Team');
  });

  test('导出 OPC → 下载 JSON 文件', async ({ page }) => {
    // 创建 OPC 并添加数据
    // ...

    const [download] = await Promise.all([
      page.waitForEvent('download'),
      page.getByRole('button', { name: /导出/ }).click()
    ]);
    expect(download.suggestedFilename()).toMatch(/\.json$/);
  });

  test('导入 OPC → 数据完整还原', async ({ page }) => {
    // 先导出
    // 删除
    // 再导入
    // 验证 agent/channel 数量与导出前一致
  });

  test('删除 OPC（含确认）→ 从列表消失', async ({ page }) => {
    const opcPage = new OpcListPage(page);
    await opcPage.createOpc('To Delete');
    await page.getByText('To Delete').locator('..').getByRole('button', { name: /删除/ }).click();
    await expect(page.getByRole('dialog')).toBeVisible();
    await page.getByRole('button', { name: /确认删除/ }).click();
    await expect(page.getByText('To Delete')).not.toBeVisible();
  });
});
```

#### 场景 2：Agent 配置流程（`agent-configuration.spec.ts`）

```ts
test.describe('Agent 配置', () => {
  test.beforeEach(async ({ page }) => {
    // 通过 API 创建测试 OPC 并设为当前
    await setupCurrentOpc(page, 'Agent Test OPC');
    await page.goto('/#/agents');
  });

  test('创建 agent → 填写名称/角色 → 保存', async ({ page }) => {
    await page.getByRole('button', { name: /新增 Agent/ }).click();
    await page.getByLabel(/Agent 名称/).fill('Customer Service Bot');
    await page.getByLabel(/角色/).selectOption('assistant');
    await page.getByRole('button', { name: /保存/ }).click();
    await expect(page.getByText('Customer Service Bot')).toBeVisible();
  });

  test('编辑 SOUL 文档 → 保存 → 刷新后数据持久', async ({ page }) => {
    // 点击已有 agent → 找到 SOUL tab → 编辑 → 保存
    await page.getByText('Customer Service Bot').click();
    await page.getByRole('tab', { name: 'SOUL' }).click();
    await page.getByRole('textbox').fill('You are a helpful assistant.');
    await page.getByRole('button', { name: /保存文档/ }).click();

    // 刷新验证持久化
    await page.reload();
    await page.getByText('Customer Service Bot').click();
    await page.getByRole('tab', { name: 'SOUL' }).click();
    await expect(page.getByRole('textbox')).toHaveValue('You are a helpful assistant.');
  });

  test('多 agent 排序（拖拽调整顺序）', async ({ page }) => {
    // 创建 3 个 agents
    // 拖拽第 3 个到第 1 位
    // 验证列表顺序变化
  });
});
```

#### 场景 3：部署工作流（`deployment-workflow.spec.ts`）

> **说明**：此 E2E 场景测试 ClawPilot UI 的部署交互（进度展示、状态更新等），
> 使用 OrbStack 启动的真实 VM 作为目标 office。
> VM 在测试套件的 `globalSetup` 中预先创建，此处直接使用其 host/port/api_key。

```ts
// e2e/specs/deployment-workflow.spec.ts
import { test, expect } from '@playwright/test';
import { getOrbVmInfo } from '../helpers/orb-vm';

test.describe('部署工作流', () => {
  // OrbStack VM 信息由 globalSetup 写入，此处读取
  let vmHost: string;
  let vmPort: number;
  let vmApiKey: string;

  test.beforeAll(async () => {
    const info = getOrbVmInfo();   // 读取 globalSetup 写入的 vm-info.json
    vmHost = info.host;
    vmPort = info.daemonPort;
    vmApiKey = info.apiKey;
  });

  test('完整从配置到真实 VM 部署', async ({ page }) => {
    // Step 1: 创建完整 OPC 配置
    await setupCompleteOpc(page);

    // Step 2: 进入 Office 页，填写 OrbStack VM 的真实地址
    await page.goto('/#/office');
    await page.getByRole('button', { name: /添加办公室/ }).click();
    await page.getByLabel('名称').fill('OrbStack Test VM');
    await page.getByLabel('Host').fill(vmHost);
    await page.getByLabel('Port').fill(String(vmPort));
    await page.getByLabel('API Key').fill(vmApiKey);
    await page.getByRole('button', { name: /确认/ }).click();

    // Step 3: 检查 daemon 健康状态（验证 VM 确实可达）
    await page.getByText('OrbStack Test VM').locator('..').getByRole('button', { name: /健康检查/ }).click();
    await expect(page.getByTestId('daemon-health-badge')).toHaveText('健康', { timeout: 5_000 });

    // Step 4: 执行部署
    await page.getByText('OrbStack Test VM').locator('..').getByRole('button', { name: /部署/ }).click();

    // Step 5: 验证进度步骤逐步推进
    await expect(page.getByTestId('deployment-steps')).toBeVisible();
    await expect(page.getByText(/打包配置/)).toBeVisible();
    await expect(page.getByText(/上传到目标/)).toBeVisible();
    await expect(page.getByText(/启动 OpenClaw/)).toBeVisible();

    // Step 6: 等待部署完成（真实网络，给足 60s）
    await expect(page.getByTestId('deployment-status')).toHaveText('成功', { timeout: 60_000 });

    // Step 7: 验证所有步骤标绿
    const steps = page.getByTestId('deployment-step');
    const count = await steps.count();
    for (let i = 0; i < count; i++) {
      await expect(steps.nth(i)).toHaveAttribute('data-status', 'success');
    }
  });

  test('部署后健康检查仍通过', async ({ page }) => {
    await page.goto('/#/office');
    await page.getByText('OrbStack Test VM').locator('..').getByRole('button', { name: /健康检查/ }).click();
    await expect(page.getByTestId('daemon-health-badge')).toHaveText('健康', { timeout: 5_000 });
  });

  test('一键撤销部署', async ({ page }) => {
    await page.goto('/#/office');
    await page.getByText('OrbStack Test VM').locator('..').getByRole('button', { name: /撤销部署/ }).click();
    await page.getByRole('button', { name: /确认撤销/ }).click();
    await expect(page.getByTestId('deployment-status')).toHaveText('已撤销', { timeout: 30_000 });
  });

  test('查看部署历史', async ({ page }) => {
    await page.goto('/#/office');
    await page.getByRole('tab', { name: /部署历史/ }).click();
    await expect(page.getByTestId('deployment-history-item')).toHaveCount({ minimum: 1 });
  });
});
```

#### 场景 4：快照管理（`snapshot-management.spec.ts`）

```ts
test.describe('快照管理', () => {
  test('创建快照 → 修改数据 → 恢复 → 数据回滚', async ({ page }) => {
    // 初始：2 个 agents
    await setupOpcWithAgents(page, 2);

    // 创建快照
    await page.goto('/#/opc');
    await page.getByRole('button', { name: /创建快照/ }).click();
    await page.getByLabel(/快照名称/).fill('Before Change');
    await page.getByRole('button', { name: /确认/ }).click();

    // 添加第 3 个 agent
    await page.goto('/#/agents');
    await createAgent(page, 'New Agent');
    await expect(page.getByTestId('agent-item')).toHaveCount(3);

    // 恢复快照
    await page.goto('/#/opc');
    await page.getByText('Before Change').locator('..').getByRole('button', { name: /恢复/ }).click();
    await page.getByRole('button', { name: /确认恢复/ }).click();

    // 验证回滚
    await page.goto('/#/agents');
    await expect(page.getByTestId('agent-item')).toHaveCount(2);
    await expect(page.getByText('New Agent')).not.toBeVisible();
  });

  test('删除快照不影响 OPC 数据', async ({ page }) => {
    // 创建快照 → 删除快照 → OPC 数据仍存在
  });
});
```

---

## 8. 真实环境部署测试（OrbStack）

### 8.1 测试设计思路

E2E 测试中的部署场景使用真实 VM，但 Playwright 本身不负责 VM 的生命周期管理。
真实部署测试分为两层：

```
┌─────────────────────────────────────────────────────────────┐
│  Playwright E2E（场景 3）                                    │
│  验证：UI 交互流程、进度展示、状态反馈                         │
│  依赖：globalSetup 启动的 OrbStack VM                        │
├─────────────────────────────────────────────────────────────┤
│  OrbStack 部署集成测试（独立 Vitest 套件）                    │
│  验证：从干净 VM → 安装 daemon → 部署 OPC → OpenClaw 运行    │
│  工具：orbctl CLI + Node.js child_process/execa              │
└─────────────────────────────────────────────────────────────┘
```

**核心原则**

- 每次测试使用**全新 VM**（`orbctl create ubuntu:24.04`），确保零污染
- 测试结束后**无论成功/失败都删除 VM**（finally 块保证清理）
- VM 命名格式：`clawpilot-test-<timestamp>`，避免名称冲突
- OrbStack VM 通过其内网 IP 暴露 daemon 端口，本机直接访问

---

### 8.2 测试基础设施

**目录结构**

```
e2e/
├── orb/
│   ├── vitest.config.ts          # 独立配置，timeout 更长
│   ├── helpers/
│   │   ├── orb-vm.ts             # OrbStack VM 生命周期管理
│   │   ├── ssh.ts                # VM 内命令执行封装
│   │   └── daemon-client.ts      # daemon HTTP API 客户端
│   ├── fixtures/
│   │   └── opc-package.ts        # 生成测试用 OPC 部署包
│   └── specs/
│       ├── fresh-install.test.ts  # 全新安装 daemon + 部署
│       ├── redeploy.test.ts       # 重复部署/覆盖更新
│       ├── undeploy.test.ts       # 撤销部署
│       └── failure-recovery.test.ts  # 异常场景恢复
```

**`e2e/orb/vitest.config.ts`**

```ts
import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    // 真实 VM 操作耗时长，单个测试最多 5 分钟
    testTimeout: 300_000,
    hookTimeout: 120_000,
    // 串行执行，避免并发创建过多 VM
    pool: 'forks',
    poolOptions: { forks: { singleFork: true } },
    // 单独报告文件
    reporter: [['verbose'], ['json', { outputFile: 'e2e/orb/results.json' }]],
  }
});
```

**`e2e/orb/helpers/orb-vm.ts`**

```ts
import { execSync, exec } from 'child_process';
import { promisify } from 'util';

const execAsync = promisify(exec);

export interface VmInfo {
  name: string;
  host: string;         // OrbStack 分配的内网 IP（如 198.19.x.x）
  daemonPort: number;
  apiKey: string;
}

/**
 * 创建全新的 Ubuntu 24.04 VM，并等待网络就绪
 * 返回 VM 名称和内网 IP
 */
export async function createTestVm(): Promise<VmInfo> {
  const name = `clawpilot-test-${Date.now()}`;
  console.log(`[OrbStack] 创建 VM: ${name}`);

  // 创建 VM（Ubuntu 24.04，amd64，确保与 daemon 二进制架构匹配）
  execSync(`orbctl create -a amd64 ubuntu:24.04 ${name}`, { stdio: 'inherit' });

  // 等待 VM 网络就绪（最多 60s）
  await waitForVmReady(name, 60_000);

  // 获取 OrbStack 内网 IP
  const host = await getVmIp(name);
  console.log(`[OrbStack] VM ${name} IP: ${host}`);

  return { name, host, daemonPort: 8765, apiKey: '' };  // apiKey 由安装 daemon 后填入
}

/**
 * 删除 VM（无论成功还是失败都要调用）
 */
export async function destroyTestVm(name: string): Promise<void> {
  console.log(`[OrbStack] 删除 VM: ${name}`);
  try {
    execSync(`orbctl delete --force ${name}`, { stdio: 'inherit' });
  } catch (e) {
    console.warn(`[OrbStack] 删除 VM 失败（可能已不存在）: ${e}`);
  }
}

/**
 * 在 VM 内运行 shell 命令，返回 stdout
 */
export async function runInVm(vmName: string, command: string): Promise<string> {
  const { stdout, stderr } = await execAsync(
    `orbctl run -m ${vmName} -u root -- bash -c ${JSON.stringify(command)}`
  );
  if (stderr) console.warn(`[VM stderr] ${stderr}`);
  return stdout.trim();
}

/**
 * 将本机文件复制到 VM 内
 */
export async function pushToVm(vmName: string, localPath: string, remotePath: string): Promise<void> {
  execSync(`orbctl push -m ${vmName} ${localPath} ${remotePath}`, { stdio: 'inherit' });
}

/**
 * 等待 VM 内 sshd/网络就绪
 */
async function waitForVmReady(name: string, timeoutMs: number): Promise<void> {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    try {
      execSync(`orbctl run -m ${name} echo ready`, { stdio: 'pipe' });
      return;
    } catch {
      await new Promise(r => setTimeout(r, 2000));
    }
  }
  throw new Error(`VM ${name} 未在 ${timeoutMs}ms 内就绪`);
}

/**
 * 获取 VM 的 OrbStack 内网 IP
 */
async function getVmIp(name: string): Promise<string> {
  const output = execSync(
    `orbctl info ${name} --format json`, { encoding: 'utf8' }
  );
  const info = JSON.parse(output);
  // OrbStack 内网地址在 networks[0].ip 或类似字段
  return info.networks?.[0]?.ip ?? info.ip;
}
```

**`e2e/orb/helpers/daemon-client.ts`**

```ts
import fetch from 'node-fetch';

export class DaemonClient {
  constructor(
    private readonly host: string,
    private readonly port: number,
    private readonly apiKey: string
  ) {}

  private get baseUrl() { return `http://${this.host}:${this.port}`; }
  private get headers() {
    return { 'Authorization': `Bearer ${this.apiKey}`, 'Content-Type': 'application/json' };
  }

  async health(): Promise<{ status: string }> {
    const res = await fetch(`${this.baseUrl}/health`);
    return res.json() as Promise<{ status: string }>;
  }

  async deploy(packageBuffer: Buffer): Promise<{ success: boolean }> {
    const res = await fetch(`${this.baseUrl}/deploy`, {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${this.apiKey}`, 'Content-Type': 'application/octet-stream' },
      body: packageBuffer,
    });
    return res.json() as Promise<{ success: boolean }>;
  }

  async status(): Promise<{ status: string; pid?: number }> {
    const res = await fetch(`${this.baseUrl}/status`, { headers: this.headers });
    return res.json() as Promise<{ status: string; pid?: number }>;
  }

  async undeploy(): Promise<{ success: boolean }> {
    const res = await fetch(`${this.baseUrl}/undeploy`, { method: 'POST', headers: this.headers });
    return res.json() as Promise<{ success: boolean }>;
  }

  /** 轮询等待 status 达到目标状态，最多 timeoutMs */
  async waitForStatus(target: string, timeoutMs = 60_000): Promise<void> {
    const start = Date.now();
    while (Date.now() - start < timeoutMs) {
      const { status } = await this.status();
      if (status === target) return;
      await new Promise(r => setTimeout(r, 2000));
    }
    throw new Error(`Daemon 未在 ${timeoutMs}ms 内达到状态 ${target}`);
  }
}
```

**`e2e/orb/fixtures/opc-package.ts`**

```ts
import { execSync } from 'child_process';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';

/**
 * 调用 ClawPilot server 的 build_deploy_package 接口，
 * 为指定 OPC 生成 tar.gz 部署包，返回 Buffer
 */
export async function buildTestPackage(opcId: string): Promise<Buffer> {
  const res = await fetch('http://localhost:3001/api/build_deploy_package', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ opc_id: opcId }),
  });
  if (!res.ok) throw new Error(`打包失败: ${res.statusText}`);
  return Buffer.from(await res.arrayBuffer());
}

/**
 * 生成最小化的测试用 OPC 部署包（不依赖 server，用于纯 daemon 测试）
 */
export function buildMinimalTestPackage(): Buffer {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'opc-test-'));
  try {
    // openclaw.json — 最小化配置
    fs.writeFileSync(path.join(tmpDir, 'openclaw.json'), JSON.stringify({
      name: 'test-opc',
      version: '1.0.0',
      agents: [],
    }));
    // agents.json5
    fs.writeFileSync(path.join(tmpDir, 'agents.json5'), '{}');

    // 打包为 tar.gz
    const outFile = path.join(os.tmpdir(), `test-package-${Date.now()}.tar.gz`);
    execSync(`tar -czf ${outFile} -C ${tmpDir} .`);
    return fs.readFileSync(outFile);
  } finally {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  }
}
```

**Playwright `globalSetup`（为 E2E 测试提供 VM）**

```ts
// e2e/global-setup.ts
import { createTestVm, runInVm, pushToVm, destroyTestVm } from './orb/helpers/orb-vm';
import { installDaemon, readDaemonApiKey } from './orb/helpers/daemon-install';
import * as fs from 'fs';

export default async function globalSetup() {
  const vm = await createTestVm();

  // 安装 daemon 到 VM
  const apiKey = await installDaemon(vm.name, vm.host, vm.daemonPort);
  vm.apiKey = apiKey;

  // 写入 vm-info.json 供 Playwright 测试读取
  fs.writeFileSync('e2e/.vm-info.json', JSON.stringify(vm, null, 2));

  // 返回 teardown 函数
  return async () => {
    await destroyTestVm(vm.name);
    fs.rmSync('e2e/.vm-info.json', { force: true });
  };
}

// e2e/helpers/orb-vm.ts 补充
export function getOrbVmInfo(): VmInfo {
  return JSON.parse(fs.readFileSync('e2e/.vm-info.json', 'utf8'));
}
```

---

### 8.3 测试场景

#### 场景 A：全新安装并部署（`fresh-install.test.ts`）

这是核心场景，验证从干净 Ubuntu 系统开始的完整链路：

```ts
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { createTestVm, destroyTestVm, runInVm, pushToVm, VmInfo } from '../helpers/orb-vm';
import { DaemonClient } from '../helpers/daemon-client';
import { buildMinimalTestPackage } from '../fixtures/opc-package';

describe('全新 VM 安装 + 部署', () => {
  let vm: VmInfo;
  let client: DaemonClient;
  // daemon 二进制路径（CI 中预先构建好）
  const DAEMON_BINARY = process.env.DAEMON_BINARY_PATH ?? './target/x86_64-unknown-linux-gnu/release/clawpilot-daemon';

  beforeAll(async () => {
    // 1. 创建全新 Ubuntu VM
    vm = await createTestVm();

    // 2. 安装系统依赖
    await runInVm(vm.name, 'apt-get update -qq && apt-get install -y -qq curl');

    // 3. 上传 daemon 二进制
    await pushToVm(vm.name, DAEMON_BINARY, '/tmp/clawpilot-daemon');
    await runInVm(vm.name, 'chmod +x /tmp/clawpilot-daemon && mv /tmp/clawpilot-daemon /usr/local/bin/');

    // 4. 启动 daemon（后台运行）
    await runInVm(vm.name, `
      mkdir -p /etc/clawpilot
      /usr/local/bin/clawpilot-daemon \
        --port ${vm.daemonPort} \
        --data-dir /var/lib/clawpilot \
        &> /var/log/clawpilot-daemon.log &
      echo $! > /var/run/clawpilot-daemon.pid
    `);

    // 5. 等待 daemon 启动（轮询 /health）
    await waitForDaemonStartup(vm.host, vm.daemonPort, 30_000);

    // 6. 读取 daemon 自动生成的 API Key
    const apiKey = await runInVm(vm.name, 'cat /etc/clawpilot/api.key');
    vm.apiKey = apiKey;

    client = new DaemonClient(vm.host, vm.daemonPort, vm.apiKey);
  }, 120_000);

  afterAll(async () => {
    // 无论成功失败都删除 VM
    await destroyTestVm(vm.name);
  });

  it('daemon 健康检查通过', async () => {
    const result = await client.health();
    expect(result.status).toBe('ok');
  });

  it('无 API Key 访问返回 401', async () => {
    const unauthClient = new DaemonClient(vm.host, vm.daemonPort, 'wrong-key');
    await expect(unauthClient.status()).rejects.toThrow();
    // 或检查 HTTP 状态码
  });

  it('部署最小化 OPC 包成功', async () => {
    const pkg = buildMinimalTestPackage();
    const result = await client.deploy(pkg);
    expect(result.success).toBe(true);
  });

  it('部署后状态变为 deployed', async () => {
    await client.waitForStatus('deployed', 30_000);
    const { status } = await client.status();
    expect(status).toBe('deployed');
  });

  it('部署后可在 VM 内查到 openclaw 进程', async () => {
    const output = await runInVm(vm.name, 'pgrep -l openclaw || echo "not found"');
    expect(output).not.toBe('not found');
  });

  it('部署后 openclaw.json 文件存在于 deploy 目录', async () => {
    const output = await runInVm(vm.name, 'test -f /var/lib/clawpilot/current/openclaw.json && echo exists');
    expect(output).toBe('exists');
  });

  it('撤销部署后 openclaw 进程停止', async () => {
    const result = await client.undeploy();
    expect(result.success).toBe(true);

    await client.waitForStatus('idle', 15_000);

    const output = await runInVm(vm.name, 'pgrep openclaw || echo "stopped"');
    expect(output).toBe('stopped');
  });
});
```

#### 场景 B：重复部署/热更新（`redeploy.test.ts`）

```ts
describe('重复部署覆盖更新', () => {
  let vm: VmInfo;
  let client: DaemonClient;

  beforeAll(async () => { /* 同场景 A 的 setup */ }, 120_000);
  afterAll(async () => { await destroyTestVm(vm.name); });

  it('首次部署成功', async () => {
    const pkg = buildMinimalTestPackage();
    await client.deploy(pkg);
    await client.waitForStatus('deployed', 30_000);
    expect((await client.status()).status).toBe('deployed');
  });

  it('再次部署（热更新）时旧进程先停止，新进程启动', async () => {
    // 记录第一次的 PID
    const { pid: pidBefore } = await client.status();
    expect(pidBefore).toBeGreaterThan(0);

    // 部署新版本包
    const pkg2 = buildMinimalTestPackage();  // 内容略有不同
    await client.deploy(pkg2);
    await client.waitForStatus('deployed', 30_000);

    // 新 PID 与旧 PID 不同（进程已重启）
    const { pid: pidAfter } = await client.status();
    expect(pidAfter).not.toBe(pidBefore);
  });

  it('重复部署后只有一个 openclaw 进程', async () => {
    const output = await runInVm(vm.name, "pgrep -c openclaw || echo '0'");
    expect(parseInt(output)).toBe(1);
  });
});
```

#### 场景 C：异常场景与恢复（`failure-recovery.test.ts`）

```ts
describe('异常场景与错误恢复', () => {
  let vm: VmInfo;
  let client: DaemonClient;

  beforeAll(async () => { /* setup */ }, 120_000);
  afterAll(async () => { await destroyTestVm(vm.name); });

  it('上传损坏的 tar.gz 包时返回错误', async () => {
    const corruptPackage = Buffer.from('this is not a valid tar.gz');
    const result = await client.deploy(corruptPackage);
    expect(result.success).toBe(false);
    // daemon 状态应回到 idle，不应卡在 deploying
    const { status } = await client.status();
    expect(status).toBe('idle');
  });

  it('上传缺少 openclaw.json 的包时返回验证错误', async () => {
    const pkg = buildPackageWithoutRequiredFiles();  // 辅助函数
    const result = await client.deploy(pkg);
    expect(result.success).toBe(false);
    expect(result).toHaveProperty('error');
  });

  it('部署中 VM 重启后 daemon 自动恢复', async () => {
    // 先成功部署一次
    await client.deploy(buildMinimalTestPackage());
    await client.waitForStatus('deployed', 30_000);

    // 重启 daemon 进程（模拟守护进程崩溃/重启）
    await runInVm(vm.name, 'systemctl restart clawpilot-daemon || pkill clawpilot-daemon; sleep 2; /usr/local/bin/clawpilot-daemon &');
    await waitForDaemonStartup(vm.host, vm.daemonPort, 30_000);

    // daemon 重启后 API Key 仍有效（从文件加载）
    const result = await client.health();
    expect(result.status).toBe('ok');
  });

  it('对未运行 OpenClaw 的实例执行 undeploy 时优雅处理', async () => {
    // 确保当前是 idle 状态
    const { status } = await client.status();
    if (status !== 'idle') {
      await client.undeploy();
      await client.waitForStatus('idle', 15_000);
    }

    // 再次 undeploy 应返回 success（幂等）
    const result = await client.undeploy();
    expect(result.success).toBe(true);
  });
});
```

#### 场景 D：从 ClawPilot Server 全链路部署（`full-chain.test.ts`）

这是最完整的场景，通过 ClawPilot server API 生成真实 OPC 配置包并部署到 VM：

```ts
describe('全链路：ClawPilot Server → OrbStack VM', () => {
  let vm: VmInfo;
  let client: DaemonClient;
  let opcId: string;

  beforeAll(async () => {
    // 1. 启动 ClawPilot server（测试实例）
    // server 在 vitest globalSetup 中以 DB_PATH=':memory:' 启动

    // 2. 创建测试数据（通过 server API）
    const opc = await serverApi('create_opc', { name: 'E2E Test OPC' });
    opcId = opc.id;
    await serverApi('set_current_opc', { id: opcId });

    const agent = await serverApi('create_agent', { opc_id: opcId, name: 'Test Agent' });
    await serverApi('upsert_channel', {
      opc_id: opcId,
      name: 'Test Channel',
      channel_type: 'FEISHU',
      config: { app_id: 'test', app_secret: 'test' }
    });

    // 3. 创建 OrbStack VM 并安装 daemon
    vm = await createAndSetupVm();
    client = new DaemonClient(vm.host, vm.daemonPort, vm.apiKey);

    // 4. 注册 office（通过 server API）
    await serverApi('create_office', {
      name: 'OrbStack VM',
      host: vm.host,
      port: vm.daemonPort,
      api_key: vm.apiKey,
    });
  }, 180_000);

  afterAll(async () => { await destroyTestVm(vm.name); });

  it('通过 server build_deploy_package 生成包', async () => {
    const pkg = await buildTestPackage(opcId);  // 调用 server API
    expect(pkg.length).toBeGreaterThan(100);  // 非空包
  });

  it('通过 server deploy_to_office 发起部署', async () => {
    const office = await serverApi('get_offices', {});
    const result = await serverApi('deploy_to_office', {
      opc_id: opcId,
      office_id: office[0].id,
    });
    expect(result.task_id).toBeTruthy();

    // 轮询 server 侧状态
    let taskStatus = 'PENDING';
    const start = Date.now();
    while (taskStatus !== 'SUCCESS' && Date.now() - start < 90_000) {
      const task = await serverApi('get_deployment_status', { task_id: result.task_id });
      taskStatus = task.status;
      if (taskStatus === 'FAILED') throw new Error(`部署失败: ${JSON.stringify(task)}`);
      await new Promise(r => setTimeout(r, 3000));
    }
    expect(taskStatus).toBe('SUCCESS');
  });

  it('VM 内 OpenClaw 进程已启动', async () => {
    const output = await runInVm(vm.name, 'pgrep -l openclaw || echo "not running"');
    expect(output).not.toContain('not running');
  });

  it('VM 内 openclaw.json 与 OPC 配置一致', async () => {
    const content = await runInVm(vm.name, 'cat /var/lib/clawpilot/current/openclaw.json');
    const config = JSON.parse(content);
    expect(config.name).toBe('E2E Test OPC');
  });
});
```

---

### 8.4 VM 生命周期管理

**VM 命名约定**

```
clawpilot-test-<unix-timestamp-ms>
例：clawpilot-test-1742400000000
```

**VM 规格**

| 项目 | 配置 |
|------|------|
| 发行版 | Ubuntu 24.04 LTS |
| 架构 | amd64（与 daemon 二进制一致） |
| 端口 | 8765（daemon HTTP） |
| 数据目录 | `/var/lib/clawpilot/` |
| API Key 文件 | `/etc/clawpilot/api.key` |
| 日志 | `/var/log/clawpilot-daemon.log` |

**守护进程安装辅助函数（`helpers/daemon-install.ts`）**

```ts
import { runInVm, pushToVm } from './orb-vm';

export async function installDaemon(
  vmName: string,
  host: string,
  port: number,
  binaryPath = process.env.DAEMON_BINARY_PATH ?? './daemon/target/release/clawpilot-daemon'
): Promise<string> {
  // 1. 上传二进制
  await pushToVm(vmName, binaryPath, '/tmp/clawpilot-daemon');

  // 2. 安装并启动
  await runInVm(vmName, `
    chmod +x /tmp/clawpilot-daemon
    mv /tmp/clawpilot-daemon /usr/local/bin/clawpilot-daemon
    mkdir -p /etc/clawpilot /var/lib/clawpilot /var/log

    # 生成随机 API Key
    API_KEY=$(openssl rand -hex 32)
    echo "$API_KEY" > /etc/clawpilot/api.key
    chmod 600 /etc/clawpilot/api.key

    # 后台启动 daemon
    nohup /usr/local/bin/clawpilot-daemon \
      --port ${port} \
      --api-key-file /etc/clawpilot/api.key \
      --data-dir /var/lib/clawpilot \
      > /var/log/clawpilot-daemon.log 2>&1 &

    echo "daemon started, PID=$!"
  `);

  // 3. 等待就绪
  await waitForDaemonStartup(host, port, 30_000);

  // 4. 读取 API Key
  const apiKey = await runInVm(vmName, 'cat /etc/clawpilot/api.key');
  return apiKey.trim();
}

async function waitForDaemonStartup(host: string, port: number, timeoutMs: number): Promise<void> {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    try {
      const res = await fetch(`http://${host}:${port}/health`, { signal: AbortSignal.timeout(2000) });
      if (res.ok) return;
    } catch { /* 还没起来 */ }
    await new Promise(r => setTimeout(r, 1500));
  }
  throw new Error(`Daemon 未在 ${timeoutMs}ms 内响应 /health`);
}
```

**CI 中的 daemon 二进制构建**

```yaml
# .github/workflows/test.yml 中的构建步骤
- name: 编译 daemon（Linux amd64）
  run: |
    rustup target add x86_64-unknown-linux-gnu
    cd daemon && cargo build --release --target x86_64-unknown-linux-gnu
  env:
    CARGO_TARGET_X86_64_UNKNOWN_LINUX_GNU_LINKER: x86_64-linux-gnu-gcc

- name: 缓存 daemon 二进制
  uses: actions/cache@v4
  with:
    path: daemon/target/x86_64-unknown-linux-gnu/release/clawpilot-daemon
    key: daemon-${{ hashFiles('daemon/src/**', 'daemon/Cargo.lock') }}
```

**失败时保留 VM 日志**

```ts
afterAll(async () => {
  if (process.env.CI) {
    // 在 CI 中，失败时先拉取日志再删除
    try {
      await execAsync(`orbctl pull -m ${vm.name} /var/log/clawpilot-daemon.log ./e2e/orb/vm-daemon.log`);
    } catch { /* 日志拉取失败不影响清理 */ }
  }
  await destroyTestVm(vm.name);
});
```

---

## 9. 覆盖率目标

| 层次 | 覆盖率目标 | 关键指标 | 优先级 |
|------|-----------|---------|--------|
| Server 单元测试 | **≥ 85%** 行覆盖 | 全部 13 个路由模块覆盖 | P0 |
| Server 集成测试 | 覆盖全部业务流程 | 4 个集成场景，含正常/异常路径 | P0 |
| 前端组件单元测试 | **≥ 70%** 行覆盖 | 所有 3 个公共组件 | P1 |
| 前端页面集成测试 | 覆盖主要交互 | 5 个核心页面，每页 ≥ 3 个场景 | P1 |
| Daemon 单元测试 | **≥ 80%** 行覆盖 | auth/deploy/state 模块 | P1 |
| Daemon HTTP 集成 | 覆盖全部 endpoints | health/deploy/status/undeploy | P1 |
| E2E 测试 | 覆盖 5 条核心用户旅程 | 每条旅程含 happy path 和关键异常 | P2 |
| OrbStack 真实部署测试 | 覆盖 4 个部署场景 | 全新安装/重复部署/异常恢复/全链路 | P2 |

---

## 10. CI/CD 集成

**GitHub Actions 配置（`.github/workflows/test.yml`）**

```yaml
name: Test

on: [push, pull_request]

jobs:
  server-tests:
    name: Server Tests
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with: { node-version: '20' }
      - run: cd server && npm ci
      - run: cd server && npm test -- --coverage
      - uses: actions/upload-artifact@v4
        with:
          name: server-coverage
          path: server/coverage/

  frontend-tests:
    name: Frontend Tests
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with: { node-version: '20' }
      - run: npm ci
      - run: npm run test:unit -- --coverage
      - uses: actions/upload-artifact@v4
        with:
          name: frontend-coverage
          path: coverage/

  daemon-tests:
    name: Daemon Tests
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: dtolnay/rust-toolchain@stable
      - uses: Swatinem/rust-cache@v2
        with: { workspaces: daemon }
      - run: cd daemon && cargo test --all-features

  # daemon 二进制编译（跨平台，用于 OrbStack 真实部署测试）
  build-daemon-linux:
    name: Build Daemon (Linux amd64)
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: dtolnay/rust-toolchain@stable
        with: { targets: x86_64-unknown-linux-gnu }
      - uses: Swatinem/rust-cache@v2
        with: { workspaces: daemon }
      - run: cd daemon && cargo build --release --target x86_64-unknown-linux-gnu
      - uses: actions/upload-artifact@v4
        with:
          name: daemon-linux-amd64
          path: daemon/target/x86_64-unknown-linux-gnu/release/clawpilot-daemon

  e2e-tests:
    name: E2E Tests (Playwright + OrbStack VM)
    # OrbStack 仅在 macOS runner 上可用
    runs-on: macos-latest
    needs: [server-tests, frontend-tests, build-daemon-linux]
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with: { node-version: '20' }
      - run: npm ci && cd server && npm ci
      - run: npx playwright install --with-deps chromium
      - run: npm run build
      # 下载 daemon 二进制（E2E globalSetup 需要用它安装到 VM）
      - uses: actions/download-artifact@v4
        with:
          name: daemon-linux-amd64
          path: ./daemon-bin/
      - run: chmod +x ./daemon-bin/clawpilot-daemon
      # 启动 OrbStack（macOS runner 需要先启动服务）
      - run: brew install orbstack && open -a OrbStack && sleep 15
      - run: npx playwright test
        env:
          DAEMON_BINARY_PATH: ./daemon-bin/clawpilot-daemon
      - uses: actions/upload-artifact@v4
        if: failure()
        with:
          name: playwright-report
          path: e2e/report/
      - uses: actions/upload-artifact@v4
        if: failure()
        with:
          name: vm-daemon-log
          path: e2e/orb/vm-daemon.log

  orb-deploy-tests:
    name: OrbStack Deployment Tests
    runs-on: macos-latest
    needs: [build-daemon-linux]
    # 仅在 main 分支或手动触发时运行（真实 VM 测试较慢，约 10-15 分钟）
    if: github.ref == 'refs/heads/main' || github.event_name == 'workflow_dispatch'
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with: { node-version: '20' }
      - run: npm ci && cd server && npm ci
      - uses: actions/download-artifact@v4
        with:
          name: daemon-linux-amd64
          path: ./daemon-bin/
      - run: chmod +x ./daemon-bin/clawpilot-daemon
      - run: brew install orbstack && open -a OrbStack && sleep 15
      - run: npm run test:orb
        env:
          DAEMON_BINARY_PATH: ./daemon-bin/clawpilot-daemon
      - uses: actions/upload-artifact@v4
        if: failure()
        with:
          name: orb-test-results
          path: e2e/orb/results.json
      - uses: actions/upload-artifact@v4
        if: failure()
        with:
          name: orb-vm-daemon-log
          path: e2e/orb/vm-daemon.log
```

**package.json scripts 更新**

```json
{
  "scripts": {
    "test:unit": "vitest run",
    "test:unit:watch": "vitest",
    "test:unit:coverage": "vitest run --coverage",
    "test:e2e": "playwright test",
    "test:e2e:ui": "playwright test --ui",
    "test:orb": "vitest run --config e2e/orb/vitest.config.ts",
    "test:orb:watch": "vitest --config e2e/orb/vitest.config.ts",
    "test": "npm run test:unit && npm run test:e2e"
  }
}
```

```json
// server/package.json
{
  "scripts": {
    "test": "vitest run",
    "test:watch": "vitest",
    "test:coverage": "vitest run --coverage"
  }
}
```

---

## 11. 实施路径

### 阶段 1：基础设施搭建（2-3天）

- [ ] 完成 server 依赖注入重构（db 参数化、路由工厂函数）
- [ ] `db.js` 导出 `applySchema`/`runMigrations`/`createDb`
- [ ] server 安装 vitest + supertest，配置 `vitest.config.js`
- [ ] 创建 `__tests__/helpers/db.js` 和 `__tests__/helpers/app.js`
- [ ] 根目录安装 Vitest + testing-library + msw
- [ ] 创建 `src/__tests__/setup.ts`、`mocks/server.ts`、`mocks/fixtures.ts`
- [ ] daemon 添加 axum-test、tempfile 到 `[dev-dependencies]`

### 阶段 2：Server 单元测试（3-4天）

- [ ] `opc.test.js` — 覆盖 10 个 endpoint
- [ ] `agent.test.js` — 覆盖 8 个 endpoint
- [ ] `model.test.js` — 覆盖 4 个 endpoint（外部调用 mock）
- [ ] `channel.test.js` — 覆盖 5 个 endpoint
- [ ] `binding.test.js` — 覆盖 6 个 endpoint
- [ ] `office.test.js` — 覆盖 9 个 endpoint（网络调用 mock）
- [ ] `snapshot.test.js` / `log.test.js` / `skill.test.js` / `tool.test.js`

### 阶段 3：Server 集成测试（2天）

- [ ] `opc-lifecycle.test.js`
- [ ] `agent-binding.test.js`
- [ ] `deployment-flow.test.js`
- [ ] `snapshot-restore.test.js`

### 阶段 4：前端测试（3天）

- [ ] 完善 msw handlers（覆盖全部 60+ endpoints）
- [ ] `api.test.ts`、组件单元测试（Toast、ThreeColumnLayout）
- [ ] 5 个页面集成测试（OpcPage、AgentsPage、ProvidersPage、BindingsPage、OfficePage）

### 阶段 5：Daemon 测试（2天）

- [ ] `auth.rs` 单元测试
- [ ] `deploy.rs` 单元测试（含 tar.gz 辅助函数）
- [ ] `state.rs` 单元测试
- [ ] `routes_test.rs` HTTP 集成测试

### 阶段 6：E2E 测试（2-3天）

- [ ] Playwright 配置、Page Object Model
- [ ] 4 条 Playwright E2E 场景（含部署场景对接 OrbStack VM）
- [ ] Playwright `globalSetup`：自动创建 VM、安装 daemon、写入 vm-info.json
- [ ] `globalTeardown`：测试后删除 VM

### 阶段 7：OrbStack 真实部署测试（2-3天）

- [ ] `e2e/orb/` 目录结构和 `vitest.config.ts`
- [ ] `orb-vm.ts`：VM 生命周期管理（create/run/push/destroy）
- [ ] `daemon-install.ts`：安装辅助函数
- [ ] `daemon-client.ts`：HTTP 客户端封装
- [ ] `fresh-install.test.ts`：全新安装场景（核心）
- [ ] `redeploy.test.ts`：热更新场景
- [ ] `failure-recovery.test.ts`：异常恢复场景
- [ ] `full-chain.test.ts`：全链路场景
- [ ] daemon 跨平台编译（`x86_64-unknown-linux-gnu` target）
- [ ] CI/CD：`orb-deploy-tests` job（仅 main 分支）

### 总工时估算

| 阶段 | 天数 |
|------|------|
| 阶段 1：基础设施 | 2-3 |
| 阶段 2：Server 单元测试 | 3-4 |
| 阶段 3：Server 集成测试 | 2 |
| 阶段 4：前端测试 | 3 |
| 阶段 5：Daemon 测试 | 2 |
| 阶段 6：E2E 测试 | 2-3 |
| 阶段 7：OrbStack 真实部署测试 | 2-3 |
| **合计** | **16-20 天** |
