# 重构计划：统一后端，砍掉 Node.js Server

> ✅ **已完成**（截止 2026-04-23）：`server/` 目录及所有 Node.js 路由已删除，业务逻辑全部迁至 `src-tauri/src/services/`，通过 `src-tauri/src/http/mod.rs` 暴露为 `POST /api/<cmd>`；dev-server 独立二进制在 `src-tauri/src/bin/dev_server.rs`。下文保留作为迁移决策/路径的历史记录。

## 背景

当前维护两套后端（Node.js 9,800 行 + Rust 16,600 行），99 个 Tauri command 与 15 个 Node.js 路由模块功能重复。每次改字段要同步两边，维护成本高。

## 目标架构

```
开发模式:
  Vite dev server (16666) → 提供 HTML/JS/HMR
  axum HTTP server (16667) → 业务 API（独立进程，cargo watch 热重载）
  前端 JS → fetch → http://127.0.0.1:16667/api/{cmd}

生产模式:
  Tauri App（单二进制）
    ├── 内嵌前端静态文件（Vite build 产物）
    ├── 内嵌 axum server（同进程，监听 127.0.0.1:16667）
    └── SQLite
```

## 前提条件

- daemon/ 已经在用 axum 0.7，团队有经验
- services/ 层已经与 commands/ 层分离，业务逻辑可直接复用
- `call()` 函数已经支持 HTTP 模式，前端改动极小

---

## Phase 1：在 src-tauri 中加入 axum HTTP 层

### 1.1 添加依赖

`src-tauri/Cargo.toml` 新增：

```toml
axum = { version = "0.7", features = ["multipart"] }
tower-http = { version = "0.5", features = ["cors", "trace"] }
```

已有 `tokio`（full）和 `serde_json`，无需额外添加。

### 1.2 创建 HTTP 路由模块

新建 `src-tauri/src/http/` 目录：

```
src-tauri/src/http/
├── mod.rs          # pub fn routes(state: AppState) -> Router
├── opc.rs          # 11 个 endpoint
├── agent.rs        # 12 个 endpoint
├── model.rs        # 10 个 endpoint
├── channel.rs      # 5 个 endpoint
├── binding.rs      # 7 个 endpoint
├── tool.rs         # 3 个 endpoint
├── skill.rs        # 9 个 endpoint
├── snapshot.rs     # 5 个 endpoint
├── office.rs       # 14 个 endpoint
├── deployment.rs   # 8 个 endpoint
├── log.rs          # 2 个 endpoint
├── process.rs      # 5 个 endpoint
├── settings.rs     # 5 个 endpoint
├── ai.rs           # 3 个 endpoint
└── activities.rs   # SSE 流（活动事件）
```

### 1.3 路由模式

每个 handler 的模式极其统一，可以批量写：

```rust
// 现有 Tauri command:
#[tauri::command]
pub fn get_agents(pool: State<'_, DbPool>, opc_id: String) -> Result<Vec<AgentConfig>> {
    agent_service::get_agents(&pool, &opc_id)
}

// 对应的 axum handler（新增）:
async fn get_agents(
    State(state): State<AppState>,
    Json(body): Json<Value>,
) -> Result<Json<Vec<AgentConfig>>, AppError> {
    let opc_id = body["opc_id"].as_str().unwrap_or_default();
    let result = agent_service::get_agents(&state.pool, opc_id)?;
    Ok(Json(result))
}
```

路由注册：

```rust
pub fn routes(state: AppState) -> Router {
    Router::new()
        .route("/api/get_agents", post(get_agents))
        .route("/api/get_agent", post(get_agent))
        // ... 99 个 endpoint
        .layer(CorsLayer::permissive())
        .with_state(state)
}
```

### 1.4 AppState 定义

```rust
#[derive(Clone)]
pub struct AppState {
    pub pool: DbPool,           // 现有
    pub tunnel_pool: TunnelPool, // 现有（SSH 隧道缓存）
}
```

`DbPool` 目前是 `Arc<Mutex<Connection>>`，已经是 `Clone`，可直接用。

### 1.5 特殊 endpoint 处理

以下 endpoint 不是简单的 JSON-in/JSON-out，需要特别处理：

| endpoint | 特殊性 | 处理方式 |
|----------|--------|----------|
| `/api/activities/stream` | SSE 推送 | axum 的 `Sse` + `tokio::sync::broadcast` |
| `/api/install_daemon` | 长时间 + 进度日志 | SSE 流式返回进度 |
| `/api/install_decoration` | 同上 | SSE 流式返回进度 |
| `/api/import_opc` | 大 JSON 上传 | 提高 body size limit |
| `/api/export_opc` | 大 JSON 下载 | 正常 JSON 响应即可 |

---

## Phase 2：独立运行模式（开发用）

### 2.1 新建二进制入口

新建 `src-tauri/src/bin/dev_server.rs`：

```rust
// 独立的 axum server，不依赖 Tauri
// cargo run --bin dev_server -- --port 16667
#[tokio::main]
async fn main() {
    let pool = DbPool::new(&db_path).unwrap();
    migrations::run_migrations(&pool).unwrap();

    let state = AppState { pool, tunnel_pool: TunnelPool::new() };
    let app = http::routes(state);

    let listener = tokio::net::TcpListener::bind("127.0.0.1:16667").await.unwrap();
    axum::serve(listener, app).await.unwrap();
}
```

`Cargo.toml` 加：

```toml
[[bin]]
name = "dev-server"
path = "src/bin/dev_server.rs"
```

### 2.2 开发启动方式

```bash
# 终端 1：Rust API server（cargo watch 热重载）
cd src-tauri && cargo watch -x 'run --bin dev-server'

# 终端 2：前端（Vite HMR）
npm run dev:web
```

更新 `scripts/dev.sh`，用上述两个进程替代原来的三个。

---

## Phase 3：Tauri 集成 axum

### 3.1 Tauri 启动时内嵌 axum

修改 `src-tauri/src/lib.rs`：

```rust
pub fn run() {
    // ... 现有 DB 初始化 ...

    let state = AppState { pool: pool.clone(), tunnel_pool: TunnelPool::new() };

    // 后台启动 axum server
    let rt = tokio::runtime::Runtime::new().unwrap();
    rt.spawn(async move {
        let app = http::routes(state);
        let listener = tokio::net::TcpListener::bind("127.0.0.1:16667").await.unwrap();
        axum::serve(listener, app).await.unwrap();
    });

    // Tauri app 照常启动
    tauri::Builder::default()
        .manage(pool)
        // 不再需要 invoke_handler 里的 99 个 command
        // 只保留少量原生命令（文件对话框、窗口管理等）
        .run(tauri::generate_context!())
        .unwrap();
}
```

### 3.2 前端 `call()` 简化

```typescript
// 不再区分 Tauri/HTTP，统一走 HTTP
const API_BASE = 'http://127.0.0.1:16667/api'

export async function call<T>(cmd: string, args: Record<string, unknown> = {}): Promise<T> {
    const res = await fetch(`${API_BASE}/${cmd}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(args),
    })
    if (!res.ok) {
        const text = await res.text()
        let message = text
        try { message = JSON.parse(text).error ?? text } catch {}
        throw new Error(message)
    }
    return res.json() as Promise<T>
}
```

删除 `invoke()` 相关代码、`toInvokeArgs()`、`@tauri-apps/api/core` 依赖。

### 3.3 更新 CSP

`tauri.conf.json` 的 CSP 需要允许连接 `127.0.0.1:16667`：

```json
"security": {
    "csp": "default-src 'self'; connect-src 'self' http://127.0.0.1:16667; ..."
}
```

---

## Phase 4：清理

### 4.1 删除 Node.js Server

```bash
rm -rf server/
```

清理 `package.json` 中：
- `server:dev` 脚本
- `better-sqlite3`、`express`、`cors` 等依赖

### 4.2 删除 Tauri Commands

删除 `src-tauri/src/commands/` 整个目录（保留少量原生命令如有需要）。

从 `lib.rs` 中删除 `invoke_handler(tauri::generate_handler![...])` 的 99 个注册项。

### 4.3 删除对比脚本

`scripts/compare-api-signatures.js` 不再需要（只有一套后端了）。

### 4.4 更新文档

- `CLAUDE.md` — 删除"阶段一/阶段二"开发模式说明，更新目录结构
- `docs/dev-setup.md` — 更新启动方式（2 个服务而非 3 个）
- `docs/dev-conventions.md` — 删除"API 签名对比"相关内容

---

## Phase 5：验证

### 5.1 功能验证清单

逐一验证 15 个模块的所有 endpoint：

- [ ] OPC：CRUD、导入导出、当前选择、统计
- [ ] Agent：CRUD、排序、文档、批量创建、设置领队
- [ ] Model：Provider CRUD、模型列表、连通性测试
- [ ] Channel：CRUD、飞书连接测试
- [ ] Binding：CRUD、启停、飞书频道列表
- [ ] Tool：CRUD
- [ ] Skill：CRUD、远程搜索安装
- [ ] Snapshot：创建、恢复、删除
- [ ] Office：CRUD、SSH、Daemon 安装探测
- [ ] Deployment：部署、回滚、状态轮询
- [ ] Log：查询、写入
- [ ] Process：启停重载
- [ ] Settings：License、OPC Root
- [ ] AI：Agent 生成
- [ ] Activities：SSE 实时推送

### 5.2 E2E 测试

现有 `tests/` 目录的 Playwright 测试应全部通过（只改了传输层，不改业务逻辑）。

### 5.3 Tauri 打包验证

```bash
npm run tauri build
```

确认：
- 单二进制包含 axum server
- 启动后 16667 端口可用
- 所有功能正常

---

## 代码量变化预估

| 项目 | 变化 |
|------|------|
| 删除 `server/` | -9,800 行 JS |
| 删除 `commands/` | -3,000 行 Rust（估）|
| 删除 `compare-api-signatures.js` | -200 行 |
| 新增 `http/` 路由层 | +2,000 行 Rust（估）|
| **净减少** | **约 -11,000 行** |

## 风险与注意事项

1. **端口冲突**：生产模式下 axum 绑定 16667，需确保不与其他进程冲突。可考虑随机端口 + 传递给前端。
2. **SSE/WebSocket**：activities 和安装进度的 SSE 实现需要仔细对照 Node.js 版本的行为。
3. **加密兼容**：`server/utils/crypto.js` 和 `utils/crypto.rs` 的加密算法必须一致（已有，无需改动）。
4. **并发写入**：SQLite `Arc<Mutex<Connection>>` 在 axum 多线程环境下需要注意。当前 daemon 已有相同模式，已验证可行。
5. **macOS App Sandbox**：如果启用 sandbox，需确保 App 能监听本地端口。Tauri 2 默认不启用 sandbox。

## 执行顺序建议

Phase 1 → Phase 2 → 在开发模式充分测试 → Phase 3 → Phase 4 → Phase 5

**Phase 2 完成后就可以日常开发使用了**，Phase 3/4 可以稍后再做。
