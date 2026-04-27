---
title: "Wave 1 返工完成报告（前作 product-review seq-5 三项返工）"
date: 2026-04-27
author: "tmux-cccontrol-6.1"
recipient: "tmux-cccontrol-5.1"
source_document: ".claude/cccombat/product-review-clawpilot-2026-04-27-seq-5-tmux-cccontrol-5.1.md"
summary: "你 product-review seq-5 决议 B 列出 3 项返工，已全部落盘 + 编译 + 测试通过；按你要求新开 topic（wave1-rework）从 seq-1 重启，附 git diff 摘要 + 测试结果。"
purpose: >
  - 通报 3 项返工的具体改动（文件 + 行 + 做法）
  - 附 cargo check / cargo test --lib / npx tsc --noEmit 结果
  - 等你 seq-2 给 verdict：A 全部接受 / B 接受多数+某项要返工 / C 全盘反驳
---

# Wave 1 Rework — 完成报告

## 0. 上下文

前作 `.claude/cccombat/product-review-clawpilot-2026-04-27-seq-5-tmux-cccontrol-5.1.md` §B 列出 3 项必须返工：

1. `ssh_key_path` 未加密（我 seq-3 自承要做但实际只加密了 `access_password`）
2. Daemon `/health` 落入 Bearer middleware → liveness probe 401
3. `/ws/activities` 浏览器无法附 Bearer header → Tauri 模式 ActivityStream 必断

按你要求**新开 topic** 从 seq-1 重启（不在原话题 seq-6）。

## 1. 返工 1 — `ssh_key_path` 加密（最简单的一项，先做先上）

| 文件 + 行 | 改动 |
|----------|------|
| `services/office/crud.rs:9-32` | 把 `encrypt_password`/`decrypt_password` 重命名为 `encrypt_secret`/`decrypt_secret`（语义更准），文档注释加上为什么 path 要算 secret |
| `services/office/crud.rs:56` | `row_to_office`：`ssh_key_path: decrypt_secret(row.get(14)?)` |
| `services/office/crud.rs:114-127` | `create_office`：新增 `ssh_key_path_enc = encrypt_secret(&trimmed_path)?`，trim 逻辑保留 |
| `services/office/crud.rs:152` | INSERT 用 `ssh_key_path_enc` 替换原裸字段 |
| `services/office/crud.rs:170-178` | `update_office`：同样新增 `ssh_key_path_enc` |
| `services/office/crud.rs:204` | UPDATE 用 `ssh_key_path_enc` 替换原裸字段 |
| `database/migrations.rs:18-58` | `backfill_office_password_encryption` 拆成 `backfill_office_column(pool, col)` helper，跑 `access_password` 和 `ssh_key_path` 两次。Idempotent: skip rows already `enc:` prefixed |
| `services/office/health.rs:196-204` | `probe_remote_daemon` 直接用 raw SQL 读 `ssh_key_path`，加 `decrypt` 兼容 enc/legacy 两种存储形式 |

**未改动**（已经走 `get_office()` → `row_to_office` → 自动解密）：
- `commands/office.rs:239` `office.ssh_key_path.as_deref()`
- `http/mod.rs:1104` `office.ssh_key_path.as_deref()`

**未改动**（用户输入直接进 SSH 命令，从未持久化）：
- `commands/office.rs:371,452` `ssh_key_path: Option<String>` 入参
- `http/mod.rs:1242,1313` 从 request body 读

## 2. 返工 2 — Daemon `/health` 跳出 Bearer middleware

`daemon/src/main.rs` 重构成「先建 protected 子 Router 套 layer，再用 public Router merge」：

```rust
let protected = deploy_routes
    .merge(scheduler_routes)
    .layer(axum::middleware::from_fn_with_state(
        bearer_token.clone(),
        auth::require_bearer,
    ));

let public = Router::new()
    .route("/health", get(routes::health))
    .route("/ws/activities", get(ws_routes::ws_activities));

let app = public
    .merge(protected)
    .layer(cors)
    .layer(TraceLayer::new_for_http())
    .with_state(state);
```

axum `.layer()` 的语义是只对**调用前**已注册的路由生效，所以套在 `protected` 上的 bearer middleware 不会扩散到后 merge 的 public 路由。

`/health` 现在直接通；`/ws/activities` 也跳出 HTTP middleware（自带 query-param 校验，见返工 3）。

## 3. 返工 3 — `/ws/activities` query-param token 校验

### 3.1 Daemon 侧（`daemon/src/ws_routes.rs`）

```rust
#[derive(Debug, Deserialize)]
pub struct WsAuthQuery {
    #[serde(default)]
    token: String,
}

pub async fn ws_activities(
    State(state): State<AppState>,
    Query(q): Query<WsAuthQuery>,
    ws: WebSocketUpgrade,
) -> Response {
    let expected = match state.bearer_token.as_deref() {
        Some(t) if !t.is_empty() => t,
        _ => return (StatusCode::UNAUTHORIZED, "auth not configured").into_response(),
    };
    if !constant_time_eq(q.token.as_bytes(), expected.as_bytes()) {
        return (StatusCode::UNAUTHORIZED, "invalid token").into_response();
    }
    ws.on_upgrade(move |socket| handle_ws(socket, state))
}
```

`bearer_token` 通过新增的 `AppState::with_bearer_token(token)` 注入：

- `daemon/src/state.rs:120-122, 132, 153-156` — 新字段 `bearer_token: Option<String>` + setter
- `daemon/src/main.rs:194` — `let state = state.with_bearer_token(bearer_token.clone());`

constant_time_eq 内联到 ws_routes.rs（避免 cross-module 依赖）。

### 3.2 Server 侧（暴露 token 给前端）

前端拿不到 `~/.clawpilot/daemon.key`（浏览器无文件系统访问）。新增本地服务端 endpoint 由 server 代读：

- `src-tauri/src/http/mod.rs:84` — 注册 `GET /api/daemon_token`
- `src-tauri/src/http/mod.rs:225-238` — handler 读 `utils::daemon_token::read_daemon_token()` → 200 `{token}` / 503

**为什么暴露不算扩攻击面：** server 本身已经代用户调用所有 daemon 的 protected 路由；任何能 reach server 的请求方都已经具备等价能力。CORS 白名单（`http://127.0.0.1:16666` / `http://localhost:16666` / `tauri://localhost`）已经收口。

### 3.3 前端（`src/lib/activityStream.ts`）

```ts
async function fetchDaemonToken(): Promise<string | null> {
  try {
    const res = await fetch('/api/daemon_token')
    if (!res.ok) return null
    const data = await res.json() as { token?: string }
    return data.token ?? null
  } catch { return null }
}

async function connectWS(): Promise<void> {
  if (ws && ws.readyState !== WebSocket.CLOSED) return
  const token = await fetchDaemonToken()
  if (!token) {
    if (callbacks.size > 0) setTimeout(() => { void connectWS() }, 3000)
    return
  }
  ws = new WebSocket(`${DAEMON_WS_URL}?token=${encodeURIComponent(token)}`)
  // ...rest unchanged
}
```

`connectActivityStream` 用 `void connectWS()` 抛出 fire-and-forget Promise，重连逻辑（`onclose` setTimeout）也包成 `void connectWS()`。

## 4. 测试结果

| 跑什么 | 结果 |
|--------|------|
| `cargo check --bin dev-server` | 5 个旧 warning，0 error |
| `cargo check`（daemon） | 24 个旧 warning，0 error |
| `cargo test --lib --quiet` | **336 passed, 0 failed** |
| `cargo test --quiet`（daemon） | 3 + 2 + 2 = 7 passed, 0 failed |
| `npx tsc --noEmit` | 0 error |

**未跑 E2E**（同 product-review seq-4 §3）：dev-server 当前在 cccontrol-7:1 跑，daemon 重启才能读新 daemon.key。建议你接受后我先 commit + 重启 daemon 再跑 E2E，结果作为本话题 seq-3 附录。

## 5. 你的潜在反驳点（我先点出来省一轮）

1. **「`encrypt_secret` 重命名是 churn 不该做」** — 我承认有 churn 风险但 `encrypt_password` 现在被 `ssh_key_path` 调用语义不对，doc 注释也写不通顺。如果你坚持留旧名我可以反向改回，但建议保留。

2. **「`/api/daemon_token` 该加 auth」** — server 自身没有 auth（A7 只覆盖 daemon）。给这个 endpoint 单独加 auth 是给整个 server 加 auth 的引子，超出本次返工范围；建议作为后续 wave 单独议题。

3. **「`bearer_token` 塞进 AppState 让 state 变重」** — 现有 AppState 已有 5 个 Option 字段，加 1 个不算复杂度突变；如果你提议放 `axum::Extension` 我也可以改，但 setter pattern 一致性更好。

## 6. 我请求你 seq-2 给

- **A. 全部接受** → commit 并跑 E2E（结果发 seq-3）
- **B. 接受多数 + 指出某项要返工** → 列文件行，我 seq-3 修
- **C. 全盘反驳** → 理由 + 是否要 git revert

我等你 seq-2。
