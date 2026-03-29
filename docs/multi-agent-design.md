# 多智能体协同系统设计

## 概述

基于 OpenClaw 的多智能体协同框架，用于处理复杂的多步骤任务。用户在飞书发出指令，主 agent 拆解完整的任务 DAG，Daemon 驱动 DAG 执行，协调多个 worker agent 完成工作，结果逐级汇报。

---

## 架构原则

### Agent 是纯 LLM 执行者

OpenClaw agent 在本系统中只做一件事：**接收任务 context，调用 LLM，输出结果**。agent 不持有任务状态，不知道 DAG 结构，不决定下一步干什么。一切调度、依赖分析、重试、超时、产物管理均由 Daemon 负责。

这条原则的好处：
- agent 可以随时上下线，不影响整体调度正确性
- DAG 逻辑集中在 Daemon，易于推理和调试
- agent 代码保持简单，无需处理并发和状态

### 调度算法在 Daemon（Rust）实现，不在 OpenClaw 里

所有 DAG 调度逻辑（sweep、依赖检查、重试策略、版本管理）作为 `scheduler/` 模块实现在 `daemon/` crate 中，**不通过 OpenClaw 的 heartbeat 或 plugin 机制实现**。

`daemon/` 是运行在远程服务器上的单一二进制，同时承载 OPC 部署（`deploy/`）和多智能体调度（`scheduler/`）两个功能，用户只需启动一个服务。

原因：
- **保密性**：调度算法是 ClawPilot 的核心竞争力，不能暴露在 agent 的 HEARTBEAT.md 或 Python 脚本里
- **可靠性**：Rust 进程比 agent 内嵌脚本更稳定，daemon 重启可恢复完整状态
- **可观测性**：所有状态存 SQLite，可随时查询；不依赖 OpenClaw 的日志
- **部署简单**：用户只装一个二进制，不需要管理多个进程

### 与 claude-code-harness 的关系

`claude-code-harness` 是 Claude Code 开发环境的 agent 调度框架，用于开发时协调多个 Claude Code 实例。本系统是生产运行时的业务调度，两者**完全不同层次**：

| | claude-code-harness | ClawPilot Daemon |
|-|--------------------|-----------------|
| 运行时机 | 开发时 | 生产运行时 |
| 调度对象 | Claude Code 实例 | OpenClaw agent |
| 任务类型 | 代码实现/审查 | 业务任务 |
| 持久化 | 无（会话级） | SQLite（跨会话） |

可以用 harness 来**开发** ClawPilot Daemon 本身，但 Daemon 不依赖 harness。

---

## 两个独立系统

```
┌─────────────────────────┐        ┌──────────────────────────┐
│        OpenClaw         │        │      ClawPilot Daemon     │
│                         │        │                           │
│  Agent 身份、记忆、LLM   │        │  任务调度、DAG 执行        │
│  SOUL / AGENTS / MEMORY │        │  信箱、产物、状态管理       │
│                         │        │                           │
│  权威来源：Agent 列表    │        │  权威来源：任务执行状态     │
└──────────┬──────────────┘        └────────────┬─────────────┘
           │                                    │
           │   openclaw agents list --json      │
           │ ◄───────────────────────────────── │  daemon 主动拉取 agent 列表
           │                                    │
           │   openclaw agent --message         │
           │ ◄───────────────────────────────── │  任务派发 / 结果通知
           │                                    │
```

**同步方式：**
| 数据 | 权威来源 | 同步方式 |
|------|---------|---------|
| Agent 列表和能力 | OpenClaw | Daemon 定时调用 `openclaw agents list --json` 主动拉取 |
| 任务执行状态 | Daemon | Daemon 调用 `openclaw agent --message` 通知 |
| 计划和任务详情 | Daemon DB | 不同步到 OpenClaw，派发时通过 `--message` 推送给 agent |

**无需 heartbeat**：所有 agent 均不配置 heartbeat，daemon 完全自驱。

---

## 共享层

两个系统通过以下共享层协作：

### 共享文件系统（产物存储）

```
/artifacts/
  └── plans/
        └── {plan-slug}/            ← 计划根目录
              └── {agent_id}/
                    └── {run_id}/   ← 每次执行独立目录，重启重试不覆盖
                          └── {filename}
```

- `start_task` 拿到 `runId` 后预创建对应目录
- Agent 直接读写共享文件系统，无需通过任何接口
- 输入产物路径（上游任务的 `./artifacts/plans/{plan-slug}/{agent_id}/{run_id}/`）由 daemon 在 context 中告知 agent
- 重启重新派发时产生新 runId，新旧产物目录互不干扰

### OpenClaw CLI 与事件系统

Daemon 通过两种方式与 OpenClaw 交互：

**Token 获取**

Daemon 定时读取 `~/.openclaw/openclaw.json`，提取 `token` 字段用于所有 Gateway 交互（token 可能随 OpenClaw 重启而变化）：

```json
// ~/.openclaw/openclaw.json
{
  "token": "xxxxx",
  ...
}
```

**CLI（指令下发）**

```bash
# 拉取 agent 列表
openclaw agents list --json

# 派发任务给 agent（立即返回 runId）
openclaw gateway call agent \
  --params '{"message": "<context>", "agentId": "worker-frontend"}' \
  --token "<token>"
# 返回：{"runId": "abc123", "acceptedAt": 1234567890}

# 探查 runId 状态（仅用于 daemon 重启恢复）
openclaw gateway call agent.wait \
  --params '{"runId": "abc123", "timeoutMs": 0}' \
  --token "<token>"

# 取消任务
openclaw gateway call chat.abort \
  --params '{"sessionKey": "agent:worker-frontend:main", "runId": "abc123"}' \
  --token "<token>"
```

**WebSocket 事件流（结果接收）**

Daemon 启动时建立一条到 OpenClaw Gateway 的 WebSocket 长连接，接收所有 agent 的实时事件：

```
ws://localhost:18789?token=<token>
```

事件结构：

```typescript
type AgentEventPayload = {
  runId: string;       // 对应 start_task 时拿到的 runId
  seq: number;         // 序列号
  stream: "lifecycle" | "tool" | "assistant" | "error" | "compaction";
  ts: number;
  data: Record<string, unknown>;
  sessionKey?: string;
};
```

Daemon 内部维护 `runId → agent_id` 路由表，按 runId 将事件分发到对应任务处理逻辑：

```
WebSocket 事件
  stream = lifecycle(end/error) → handle_task_result / handle_task_failure → dag_sweep
  stream = assistant / tool     → 推送到 /api/agents/:agent_id/stream SSE
```

WebSocket 断线时自动重连；重连后 `agent.wait` 探查仍在运行的 runId，重新注册路由表。

### Feishu chat_id 获取（已验证）

当用户从飞书发消息给 agent 时，OpenClaw 在系统提示里注入发送者信息：

```
Session Key: agent:media-cto:feishu:direct:ou_0369653f12b828363a6086f4c7c4e263
Inbound context: "chat_id": "user:ou_0369653f12b828363a6086f4c7c4e263"
Conversation info: "sender_id": "ou_0369653f12b828363a6086f4c7c4e263"
```

主 agent 创建 plan 时，从系统提示里直接读取：
- `reply_channel` = `feishu`
- `reply_to` = `sender_id`（即 `ou_xxx`）

写入 plan 记录，供 daemon 在计划完成后精准回复原始用户。

---

## 整体执行流程

```
1. 用户在飞书发送指令："开发 xx 网站"
2. OpenClaw 路由到主 agent，LLM 分析需求
3. 主 agent 生成 plan slug（如 develop-xx-website-20260328T1000）
4. 主 agent 调用 POST /api/plans，提交完整 DAG + reply_channel + reply_to
   （plan 状态：pending_approval）
5. 主 agent 在飞书展示计划，请用户确认
6. 用户回复"确认" → 主 agent 从会话历史取 slug → 调用 PATCH /api/plans/:slug/approve
   或 daemon 内部定时器检测超时 → 自动 approve
7. Daemon approve → 立即找出所有 depends_on=[] 的任务 → 并行派发
8. 每个 task 完成 → Daemon 检查 DAG → 依赖满足的任务立即派发
9. aggregate 完成 → report 任务启动
10. report 完成 → plan 标记 completed
    → Daemon 调用 openclaw agent 通知主 agent
    → 主 agent 用 plan 里的 reply_to 发飞书告知用户
```

---

## 任务 DAG 结构

主 agent 拆解计划时，一次性产出完整 DAG，aggregate 和 report 作为固定的最后两步：

```json
{
  "id": "develop-xx-website-20260328T1000",
  "reply_channel": "feishu",
  "reply_to": "ou_b0facc602e28e4d3d6947001d6346126",
  "tasks": [
    { "id": "t1", "type": "write_frontend", "depends_on": [], "receiver": "worker-frontend" },
    { "id": "t2", "type": "write_backend",  "depends_on": [], "receiver": "worker-backend" },
    { "id": "t3", "type": "write_docs",     "depends_on": [], "receiver": "worker-docs" },
    { "id": "t4", "type": "aggregate",      "depends_on": ["t1","t2","t3"], "receiver": "orchestrator" },
    { "id": "t5", "type": "report",         "depends_on": ["t4"], "receiver": "orchestrator" }
  ]
}
```

DAG 可视化：
```
write_frontend ─┐
write_backend  ─┼→ aggregate → report → [通知用户]
write_docs     ─┘
```

---

## 计划（Plan）设计

### Plan Slug 命名规则

格式：`{project-prefix}-{timestamp}`

```
develop-xx-website-20260328T1000   ← 初版
develop-xx-website-20260329T0930   ← 用户要求修改后重新制定
develop-xx-website-20260330T1400   ← blocked 后取消重来
```

同前缀的 plans 属于同一件事，可按前缀查询历史：

```sql
SELECT * FROM plans WHERE id LIKE 'develop-xx-website-%' ORDER BY created_at
```

orchestrator 修改计划时，从会话上下文取旧 slug 提取前缀，拼新时间戳。

### 计划变更策略

- 用户说"改一下" → 旧 plan 标记 superseded，orchestrator 创建新 plan（同前缀，新时间戳）
- 用户说"算了不做了" → 调用 PATCH /api/plans/:id/cancel
- 全部取消重来：已派发任务全部 cancelled，产物标记 invalidated

### 计划状态流转

```
pending_approval → approved → executing → completed
                                        ↘ blocked（agent 消失，无法继续）
                ↘ cancelled
                ↘ superseded（被新版本取代）
```

`blocked`：`sync_agents_from_openclaw` 检测到 agent 消失，立即将该 agent 所有 `pending`/`in_progress` 任务标记 `blocked`，plan 同步标记 `blocked`，通过 `reply_channel` 通知用户。用户取消或重新制定 plan，无自动恢复。

---

## 数据模型

### plans 表

```sql
CREATE TABLE plans (
  id TEXT PRIMARY KEY,                    -- {project-prefix}-{timestamp}，由主 agent 生成
  publisher_agent_id TEXT NOT NULL,
  reply_channel TEXT,                     -- 用户所在渠道，如 feishu
  reply_to TEXT,                          -- 用户 open_id，用于主动回复
  status TEXT NOT NULL DEFAULT 'pending_approval',
  -- pending_approval / approved / executing / completed / blocked / cancelled / superseded
  content TEXT NOT NULL,                  -- 计划内容 JSON
  created_at TEXT NOT NULL,
  approved_at TEXT
);
```

### tasks 表

```sql
CREATE TABLE tasks (
  id TEXT PRIMARY KEY,
  plan_id TEXT NOT NULL,
  plan_version INTEGER NOT NULL,
  publisher_agent_id TEXT NOT NULL,
  receiver_agent_id TEXT NOT NULL,
  type TEXT NOT NULL,
  priority INTEGER NOT NULL DEFAULT 0,
  params TEXT NOT NULL DEFAULT '{}',
  input_artifact_ids TEXT NOT NULL DEFAULT '[]',
  result_schema TEXT NOT NULL DEFAULT '{}',       -- publisher 定义期望结果格式
  status TEXT NOT NULL DEFAULT 'pending',
  -- pending / in_progress / completed / failed / blocked / cancelled
  current_run_id TEXT,                    -- 本次执行的 openclaw runId，重试时更新
  retry_count INTEGER NOT NULL DEFAULT 0,
  max_retries INTEGER NOT NULL DEFAULT 3,
  timeout_seconds INTEGER NOT NULL DEFAULT 3600,
  in_progress_at TEXT,
  result TEXT,
  output_artifact_ids TEXT NOT NULL DEFAULT '[]',
  error TEXT,
  created_at TEXT NOT NULL,
  completed_at TEXT
);
```

### task_dependencies 表

```sql
CREATE TABLE task_dependencies (
  task_id TEXT NOT NULL,
  depends_on_task_id TEXT NOT NULL,
  PRIMARY KEY (task_id, depends_on_task_id)
);
```

### inbox_messages 表

```sql
CREATE TABLE inbox_messages (
  id TEXT PRIMARY KEY,
  to_agent_id TEXT NOT NULL,
  from_agent_id TEXT NOT NULL,
  type TEXT NOT NULL,
  task_id TEXT NOT NULL,
  payload TEXT NOT NULL DEFAULT '{}',
  read INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL
);

CREATE INDEX idx_inbox ON inbox_messages(to_agent_id, read, created_at);
```

### artifacts 表

```sql
CREATE TABLE artifacts (
  id TEXT PRIMARY KEY,
  owner_agent_id TEXT NOT NULL,
  task_id TEXT NOT NULL,
  plan_id TEXT NOT NULL,
  filename TEXT NOT NULL,
  file_path TEXT NOT NULL,
  mime_type TEXT NOT NULL DEFAULT 'application/octet-stream',
  size_bytes INTEGER NOT NULL DEFAULT 0,
  status TEXT NOT NULL DEFAULT 'valid',   -- valid / invalidated
  created_at TEXT NOT NULL
);
```

### agents 表（注册表，daemon 维护）

```sql
CREATE TABLE agents (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'active',  -- active / offline
  capabilities TEXT NOT NULL DEFAULT '[]', -- 可接受的任务类型 JSON
  last_seen_at TEXT NOT NULL
);
```

---

## 信箱消息类型

| 类型 | 方向 | 含义 | payload 关键字段 |
|------|------|------|-----------------|
| `task_started` | daemon → publisher | 任务已开始执行 | receiver_agent_id, started_at |
| `task_done` | worker → publisher | 任务完成 | result, output_artifact_ids |
| `task_failed` | worker → publisher | 任务失败（重试耗尽） | error, retry_count |
| `task_cancelled` | publisher → worker | 取消任务 | reason |
| `task_progress` | worker → publisher | 进度汇报（可选） | progress, message |

---

## Daemon 核心接口

```
# 执行控制
POST   /api/plans                      -- 创建计划 + 完整 DAG（主 agent 调用）
PATCH  /api/plans/:id/approve          -- 用户确认，立即触发 DAG 执行
PATCH  /api/plans/:id/cancel           -- 取消整个计划

# 监控（UI 用）
GET    /api/agents/activity            -- 所有 agent 当前活动状态（忙碌/空闲详情）
GET    /api/agents/:agent_id           -- 单个 agent 详情
GET    /api/agents/:agent_id/tasks     -- 任务历史（支持分页）
GET    /api/agents/:agent_id/stream    -- SSE：agent 实时事件流（喃喃自语）
GET    /api/plans/:id                  -- 计划详情 + DAG 执行状态
```

---

## Daemon 目录结构

Cargo workspace：crate 分开维护，编译为单一二进制，用户只需启动一个服务。

```
daemon/                              -- Cargo workspace 根
├── Cargo.toml                       -- [workspace] members = ["bin", "crates/deploy", "crates/scheduler"]
│
├── bin/                             -- 二进制 crate（唯一入口）
│   ├── Cargo.toml
│   └── src/
│       └── main.rs                  -- 启动唯一 axum 实例，合并 deploy + scheduler 路由，注册定时器
│
├── crates/
│   ├── deploy/                      -- 【现有】OPC 部署 lib crate
│   │   ├── Cargo.toml
│   │   └── src/
│   │       ├── lib.rs
│   │       ├── routes.rs            -- POST /deploy, GET /deploy/:id, POST /rollback
│   │       ├── run.rs               -- run_deploy, run_rollback
│   │       ├── auth.rs
│   │       ├── error.rs
│   │       └── state.rs
│   │
│   └── scheduler/                   -- 【新增】多智能体调度 lib crate（调度算法保密）
│       ├── Cargo.toml
│       └── src/
│           ├── lib.rs
│           ├── routes.rs            -- POST /api/plans, PATCH /api/plans/:id/approve, ...
│           ├── db.rs                -- SQLite 建表 + 迁移（plans/tasks/artifacts/inbox/agents）
│           ├── dag.rs               -- DAG 驱动：get_ready_tasks, dag_sweep
│           ├── worker.rs            -- start_task, stop_task, running_tasks
│           ├── recovery.rs          -- recover_on_startup, handle_timeouts, auto_approve
│           ├── openclaw.rs          -- openclaw CLI 封装（agents list / agent --message）
│           ├── inbox.rs             -- 信箱投递
│           ├── artifacts.rs         -- 产物目录管理
│           └── context.rs           -- build_context（组装派发给 agent 的 message）
│
└── artifacts/                       -- 共享产物存储根目录（agent 和 daemon 均可访问）
```

---

## DAG 调度逻辑

### Sweep 机制

DAG 调度的核心是一个 `dag_sweep`，在两个时机触发：
1. **任务完成时**立即触发（响应快）
2. **内部定时器**每 N 秒触发（兜底，覆盖所有异常情况）

```rust
fn dag_sweep(plan_id: &str) {
    let ready_tasks = get_ready_tasks(plan_id); // 依赖全部 completed 的 pending 任务

    for task in ready_tasks {
        if running_tasks.contains_key(&task.receiver_agent_id) {
            // agent 忙，跳过，下次 sweep 再派
            continue;
        }
        start_task(&task);
    }
}
```

这个机制统一处理所有情况：
- 同一 agent 多个并行任务 → busy 时跳过，下次 sweep 捡起
- daemon 重启恢复后 → 定时器 sweep 自然重新派发
- 任务失败重试 → 定时器 sweep 会捡起重置后的任务

### 可执行任务查询

```sql
SELECT t.* FROM tasks t
WHERE t.plan_id = ?
  AND t.status = 'pending'
  AND NOT EXISTS (
    SELECT 1 FROM task_dependencies d
    JOIN tasks dep ON dep.id = d.depends_on_task_id
    WHERE d.task_id = t.id
      AND dep.status != 'completed'
  )
ORDER BY t.priority DESC
```

### approve 触发执行

```
PATCH /api/plans/:id/approve
  → 更新 plan 状态为 approved
  → 立即调用 dag_sweep(plan_id)
```

---

## 任务执行

### startTask

```rust
async fn start_task(task: &Task) {
    // 1. 调用 gateway call agent（立即返回 runId）
    let output = Command::new("openclaw")
        .args(["gateway", "call", "agent",
               "--params", &json!({"message": build_context(task), "agentId": &task.receiver_agent_id}).to_string()])
        .output().await;

    let run_id = parse_run_id(output); // 解析 {"runId": "abc123", ...}

    // 2. 预创建产物目录
    fs::create_dir_all(format!("./artifacts/plans/{}/{}/{}", task.plan_id, task.receiver_agent_id, run_id));

    // 3. 持久化 runId，标记 in_progress
    db.update_task_run_id(task.id, &run_id);
    mark_in_progress(task.id);

    running_tasks.insert(task.receiver_agent_id.clone(), RunningTask { run_id: run_id.clone(), task_id: task.id.clone() });

    // 4. 投递 task_started 到 publisher inbox
    inbox_deliver(task.publisher_agent_id, "daemon", "task_started", task.id, ...);

    // 5. 注册到 runId 路由表，结果由 WebSocket 事件驱动
    run_id_router.insert(run_id.clone(), task.id.clone());
    // lifecycle(end/error) 事件到来时 → handle_task_result / handle_task_failure
}
```

### stopTask

```rust
async fn stop_task(agent_id: &str) {
    if let Some(running) = running_tasks.remove(agent_id) {
        Command::new("openclaw")
            .args(["gateway", "call", "chat.abort",
                   "--params", &json!({"sessionKey": format!("agent:{}:main", agent_id), "runId": running.run_id}).to_string()])
            .spawn();
    }
}
```

---

## Context 组装

Daemon 派发任务时，将所有必要信息一次性推送给 agent：

```
你正在执行一个任务。

## 任务信息
- 任务ID：{task.id}
- 类型：{task.type}
- 参数：{task.params}

## 背景
- 所属计划：{plan.title}
- 整体目标：{plan.goal}
- 当前是第 {task.step} 步，共 {task.total_steps} 步

## 输入材料
- {artifact.filename}：{artifact.file_path}

## 输出要求
- 产出文件写到：./artifacts/plans/{plan.id}/{agent_id}/{run_id}/
- 完成后以如下格式返回结果（格式为）：
  {"status": "done|failed", "error": "...", "data": {result_schema}}
```

前提：worker agent 启用 `llm-task` 插件约束输出格式：
```json
{
  "plugins": { "entries": { "llm-task": { "enabled": true } } },
  "agents": {
    "list": [{ "id": "worker", "tools": { "allow": ["llm-task"] } }]
  }
}
```

---

## 结果处理

### 统一返回格式

```json
{
  "status": "done|failed",
  "error": "失败原因（仅失败时）",
  "data": { ... }
}
```

`data` 内层由 publisher 通过 `result_schema` 定义，daemon 透传给 publisher 的信箱。

### 失败重试

```
task 失败
  → retry_count < max_retries → 重置为 pending，retry_count++，重新进入 DAG 调度
  → retry_count >= max_retries → 标记 failed，投递 task_failed 到 publisher inbox
```

---

## Daemon 自驱机制（无需 heartbeat）

### 启动时恢复

```rust
async fn recover_on_startup() {
    for task in get_in_progress_tasks() {
        let run_id = &task.current_run_id;

        let result = Command::new("openclaw")
            .args(["gateway", "call", "agent.wait",
                   "--params", &json!({"runId": run_id, "timeoutMs": 0}).to_string()])
            .output().await;

        match parse_wait_result(result) {
            WaitResult::Done(output)  => { handle_task_result(&task, output).await; }
            WaitResult::Failed(error) => { handle_task_failure(&task, error).await; }
            WaitResult::TimedOut      => {
                // 任务仍在运行，重新注册路由表，后续由 WebSocket 事件驱动
                running_tasks.insert(task.receiver_agent_id.clone(), RunningTask { run_id: run_id.clone(), task_id: task.id.clone() });
                run_id_router.insert(run_id.clone(), task.id.clone());
            }
            WaitResult::NotFound      => {
                // runId 已消失，重置为 pending 重新派发
                reset_task_to_pending(&task.id);
            }
        }
    }

    // 对所有 executing 状态的 plan 触发 sweep（捡起 pending 任务）
    for plan in get_executing_plans() {
        dag_sweep(&plan.id);
    }
}
```

### 内部定时器

```rust
tokio::spawn(async {
    loop {
        sync_token_from_openclaw().await;    // 读取 ~/.openclaw/openclaw.json 更新 token
        sync_agents_from_openclaw().await;   // 拉取最新 agent 列表
        handle_timeouts().await;             // 超时任务重试或失败
        auto_approve_expired_plans().await;  // 超时未确认的计划自动审批
        sweep_all_executing_plans().await;   // 兜底 sweep，捡起 busy agent 跳过的任务
        sleep(Duration::from_secs(60)).await;
    }
});
```

---

## 主 Agent 约束（防止绕过 Daemon）

禁用原生 sub-agent 能力，通过 skill 封装所有 daemon 交互：

```json
{
  "agents": {
    "list": [{
      "id": "orchestrator",
      "tools": { "deny": ["subagents"] }
    }]
  }
}
```

`daemon-interface` skill 定义所有 daemon 调用方式（创建 plan、approve、cancel），AGENTS.md 保持干净。

---

## 监控接口返回示例

### GET /api/agents/activity

```json
[
  {
    "agent_id": "worker-frontend",
    "status": "busy",
    "busy_since": "2026-03-29T10:00:00Z",
    "busy_duration_seconds": 120,
    "current_task": {
      "task_id": "t1",
      "task_type": "write_frontend",
      "plan_id": "develop-xx-website-20260329T1000",
      "run_id": "abc123"
    }
  },
  {
    "agent_id": "worker-backend",
    "status": "idle",
    "idle_since": "2026-03-29T09:45:00Z",
    "idle_duration_seconds": 900,
    "last_task": {
      "task_id": "t2",
      "task_type": "write_backend",
      "plan_id": "develop-xx-website-20260329T1000",
      "completed_at": "2026-03-29T09:45:00Z"
    }
  },
  {
    "agent_id": "worker-docs",
    "status": "idle",
    "idle_since": null,
    "idle_duration_seconds": null,
    "last_task": null
  }
]
```

`busy_duration_seconds` 和 `idle_duration_seconds` 由 daemon 在返回时实时计算（`now - busy_since` / `now - idle_since`）。`idle_since` 从 tasks 表查该 agent 最近一次 `completed_at`，无历史任务时为 null。

### GET /api/agents/:agent_id/stream（SSE）

客户端订阅后实时收到 agent 的事件，daemon 从 OpenClaw WebSocket 转发：

```
data: {"stream":"lifecycle","data":{"status":"start"},"runId":"abc123","ts":1743200000}

data: {"stream":"assistant","data":{"delta":"我先分析一下需求，"},"runId":"abc123","ts":1743200001}

data: {"stream":"assistant","data":{"delta":"前端需要三个页面：首页、关于、联系。"},"runId":"abc123","ts":1743200002}

data: {"stream":"tool","data":{"name":"write_file","status":"start","params":{"path":"index.html"}},"runId":"abc123","ts":1743200005}

data: {"stream":"tool","data":{"name":"write_file","status":"result"},"runId":"abc123","ts":1743200006}

data: {"stream":"lifecycle","data":{"status":"end"},"runId":"abc123","ts":1743200030}
```

- agent 空闲时连接保持，无事件推送
- daemon 在内存中为每个 agent 缓存最近 N 条事件，客户端连接时先收到历史再接实时
- 事件不持久化到 DB

### GET /api/plans/:id

```json
{
  "id": "develop-xx-website-20260328T1000",
  "title": "开发 xx 网站",
  "status": "executing",
  "tasks": [
    { "id": "t1", "type": "write_frontend", "status": "completed" },
    { "id": "t2", "type": "write_backend",  "status": "in_progress" },
    { "id": "t3", "type": "write_docs",     "status": "pending" },
    { "id": "t4", "type": "aggregate",      "status": "pending", "depends_on": ["t1","t2","t3"] },
    { "id": "t5", "type": "report",         "status": "pending", "depends_on": ["t4"] }
  ]
}
```

---

## Agent 测试方案

详见 [how-to-run-daemon-tests.md](./how-to-run-daemon-tests.md)。
