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
/artifacts/                         ← 所有 agent 和 daemon 均可直接访问
  ├── tasks/
  │     └── {task_id}/              ← 各任务原始产物，永久保留
  │           └── {filename}
  └── plans/
        └── {plan_id}/              ← 计划级汇总交付物（aggregate 任务产出）
              └── {filename}
```

- Daemon 在派发任务前预创建 `tasks/{task_id}/` 目录
- Agent 直接读写共享文件系统，无需通过任何接口
- 输入产物路径由 daemon 在 context 中告知 agent

### OpenClaw CLI

Daemon 通过 `openclaw` CLI 与 OpenClaw 交互：

```bash
# 拉取 agent 列表
openclaw agents list --json

# 派发任务给 agent
openclaw agent --agent worker-frontend --message "<context>" --timeout <seconds>

# 通知用户（主动发飞书）
openclaw agent --agent orchestrator --message "<结果>" \
  --deliver --reply-channel feishu --reply-to <open_id>

# 停止 agent（daemon 重启恢复时）
openclaw agent --agent worker-frontend --message "stop"
```

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
3. 主 agent 生成 plan slug（如 plan-develop-xx-website-20260328-a3f2）
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
  "id": "plan-develop-xx-website-20260328-a3f2",
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

### 计划版本

- 用户说"改一下" → 主 agent 生成新版本 DAG，旧版本标记 superseded
- 用户说"算了不做了" → 调用 PATCH /api/plans/:id/cancel

计划变更策略（简单版）：全部取消重来，已派发任务全部 cancelled，产物标记 invalidated。

### 计划状态流转

```
pending_approval → approved → executing → completed
                ↘ cancelled
                ↘ superseded（被新版本取代）
```

---

## 数据模型

### plans 表

```sql
CREATE TABLE plans (
  id TEXT PRIMARY KEY,                    -- 由主 agent 生成的 slug
  version INTEGER NOT NULL DEFAULT 1,
  parent_plan_id TEXT,                    -- 同一需求的不同版本关联
  publisher_agent_id TEXT NOT NULL,
  reply_channel TEXT,                     -- 用户所在渠道，如 feishu
  reply_to TEXT,                          -- 用户 open_id，用于主动回复
  status TEXT NOT NULL DEFAULT 'pending_approval',
  -- pending_approval / approved / cancelled / superseded / executing / completed
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
  -- pending / in_progress / completed / failed / cancelled
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
POST   /api/plans                    -- 创建计划 + 完整 DAG（主 agent 调用）
PATCH  /api/plans/:id/approve        -- 用户确认，立即触发 DAG 执行
PATCH  /api/plans/:id/cancel         -- 取消整个计划

# 监控（UI 用）
GET    /api/agents                   -- 所有 agent 状态概览
GET    /api/agents/:agent_id         -- 单个 agent 详情
GET    /api/agents/:agent_id/tasks   -- 任务历史（支持分页）
GET    /api/plans/:id                -- 计划详情 + DAG 执行状态
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
fn start_task(task: &Task) {
    fs::create_dir_all(format!("./artifacts/tasks/{}", task.id));

    let child = Command::new("openclaw")
        .args([
            "agent",
            "--agent", &task.receiver_agent_id,
            "--message", &build_context(task),
            "--timeout", &task.timeout_seconds.to_string(),
        ])
        .spawn();

    running_tasks.insert(task.receiver_agent_id.clone(), RunningTask { child, task_id: task.id });
    mark_in_progress(task.id);

    // 投递 task_started 到 publisher inbox
    inbox_deliver(task.publisher_agent_id, "daemon", "task_started", task.id, ...);

    // 监听进程退出 → handle_task_result
}
```

### stopTask（先 kill，再发 stop）

```rust
fn stop_task(agent_id: &str) {
    if let Some(running) = running_tasks.remove(agent_id) {
        running.child.kill();
        // 发 stop 确保 agent session 状态干净
        Command::new("openclaw")
            .args(["agent", "--agent", agent_id, "--message", "stop"])
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
- 产出文件写到：./artifacts/tasks/{task.id}/
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
fn recover_on_startup() {
    // 1. 检查 gateway 是否在线
    let gateway_online = check_gateway_health();

    for task in get_in_progress_tasks() {
        if gateway_online {
            // gateway 在线，发 stop 确保 agent session 状态干净
            stop_task(&task.receiver_agent_id);
        }
        // gateway 不在线则直接跳过 stop，任务重置即可
    }

    // 2. 重置为 pending，重新进入 DAG 调度
    reset_in_progress_to_pending();

    // 3. 对所有 executing 状态的 plan 触发 sweep
    for plan in get_executing_plans() {
        dag_sweep(&plan.id);
    }
}
```

### 内部定时器

```rust
tokio::spawn(async {
    loop {
        handle_timeouts().await;             // 超时任务重试或失败
        auto_approve_expired_plans().await;  // 超时未确认的计划自动审批
        sync_agents_from_openclaw().await;   // 拉取最新 agent 列表
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

### GET /api/agents

```json
[
  {
    "agent_id": "worker-frontend",
    "status": "busy",
    "running_task": {
      "task_id": "task-abc",
      "type": "write_frontend",
      "plan_title": "开发 xx 网站",
      "started_at": "2026-03-28T10:00:00Z"
    }
  },
  {
    "agent_id": "worker-backend",
    "status": "idle",
    "running_task": null
  }
]
```

### GET /api/plans/:id

```json
{
  "id": "plan-develop-xx-website-20260328-a3f2",
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

> 本节为系统集成测试场景，在代码实现后逐条验证。每个场景描述**前置条件、操作步骤、预期结果**，以 curl 或飞书操作为测试入口。

---

### 测试环境准备

| 项目 | 说明 |
|------|------|
| OpenClaw 实例 | 本地运行，含以下 agent：`orchestrator`、`worker-frontend`、`worker-backend`、`worker-docs` |
| Daemon | 本地启动，监听 `http://localhost:3001/api` |
| 飞书 | 已绑定 orchestrator，测试账号可发消息 |
| 共享文件系统 | `./artifacts/` 目录存在且可读写 |
| `openclaw agents list --json` | 返回上述 4 个 agent |

---

### T01 — 完整正向流程（Happy Path）

**目标**：验证从飞书下发指令到用户收到完成通知的完整链路。

**前置**：所有 agent 空闲，Daemon 已启动。

**步骤**：
1. 用户在飞书私聊 orchestrator，发送：`帮我写一个介绍页，包含前端和后端`
2. 等待 orchestrator 回复计划摘要（含 plan slug）并请求确认
3. 用户回复：`确认`
4. 等待约 N 分钟

**预期结果**：
- [ ] `GET /api/plans/{slug}` 返回 `status: executing`，t1/t2/t3 并行启动
- [ ] t1、t2、t3 各自完成后，`./artifacts/tasks/{task_id}/` 下有产出文件
- [ ] t4（aggregate）在 t1、t2、t3 全部 completed 后自动启动
- [ ] t5（report）在 t4 完成后自动启动
- [ ] plan status 最终变为 `completed`
- [ ] orchestrator 主动在飞书发消息告知用户完成，`reply_to` 正确对应最初发指令的用户

---

### T02 — 用户超时未确认，Daemon 自动批准

**目标**：验证 `auto_approve_expired_plans` 定时逻辑正常工作。

**前置**：Daemon `auto_approve_timeout` 配置为 2 分钟（测试用）。

**步骤**：
1. 用户发送指令，orchestrator 回复计划并等待确认
2. **不回复**，等待超过 2 分钟

**预期结果**：
- [ ] Daemon 定时器触发后，plan status 由 `pending_approval` → `approved` → `executing`
- [ ] DAG 正常执行，最终完成

---

### T03 — Agent Busy，Sweep 重试派发

**目标**：验证同一 agent 串行执行、sweep 机制在 agent 空闲后捡起等待任务。

**前置**：DAG 中 `worker-frontend` 被分配了两个任务 t1、t2（t2 依赖 t1）。调整测试 DAG：

```json
"tasks": [
  { "id": "t1", "depends_on": [],     "receiver": "worker-frontend" },
  { "id": "t2", "depends_on": ["t1"], "receiver": "worker-frontend" },
  { "id": "t3", "depends_on": ["t2"], "receiver": "worker-frontend" }
]
```

**步骤**：
1. approve 计划，DAG 启动
2. 在 t1 执行期间，查询 agent 状态

**预期结果**：
- [ ] t1 执行时，`GET /api/agents/worker-frontend` 返回 `status: busy`
- [ ] t2 处于 `pending`（依赖未满足），不会提前派发
- [ ] t1 完成后，t2 自动进入 `in_progress`（sweep 触发）
- [ ] t2 完成后，t3 自动进入 `in_progress`
- [ ] 整个过程 worker-frontend 始终只有一个任务在跑

---

### T04 — 任务失败重试，耗尽后标记 failed

**目标**：验证 `retry_count` / `max_retries` 逻辑与 `task_failed` 信箱消息。

**前置**：将某 worker agent 的 SOUL 临时改为"总是返回失败"，`max_retries = 2`。

**步骤**：
1. 下发包含该 worker 任务的计划并 approve
2. 观察任务状态变化

**预期结果**：
- [ ] 任务首次失败后 `retry_count = 1`，状态重置为 `pending`，进入下次 sweep
- [ ] 第二次失败后 `retry_count = 2`，再次重置
- [ ] 第三次失败后 `retry_count = 3 >= max_retries`，任务状态变为 `failed`
- [ ] orchestrator inbox 收到 `task_failed` 消息，payload 含 `error` 和 `retry_count: 3`
- [ ] 依赖该任务的下游任务保持 `pending`，DAG 不再推进

---

### T05 — 用户取消计划

**目标**：验证 cancel 级联取消所有未完成任务，并标记产物 invalidated。

**步骤**：
1. approve 计划，等待 t1 进入 `in_progress`
2. 调用 `PATCH /api/plans/{slug}/cancel`

**预期结果**：
- [ ] plan status → `cancelled`
- [ ] in_progress 的任务：子进程被 kill，随后发送 `stop` 消息，任务状态 → `cancelled`
- [ ] pending 的任务直接标记 `cancelled`
- [ ] 已完成任务对应的产物 status → `invalidated`
- [ ] `GET /api/plans/{slug}` 各任务状态符合上述预期

---

### T06 — 用户要求修改计划（版本迭代）

**目标**：验证计划版本切换：旧版本标记 superseded，新版本从头执行。

**步骤**：
1. orchestrator 提交 v1 计划，处于 `pending_approval`
2. 用户回复：`再加一个测试模块`
3. orchestrator 提交 v2 计划（`parent_plan_id = v1.id`），再次等待确认
4. 用户回复：`确认`

**预期结果**：
- [ ] v1 plan status → `superseded`
- [ ] v2 plan status → `approved` → `executing`
- [ ] v2 包含新增的测试任务节点
- [ ] `GET /api/plans/{v1_slug}` 返回 `status: superseded`

---

### T07 — Daemon 重启恢复

**目标**：验证 `recover_on_startup` 逻辑：in_progress 任务重置，DAG 重新推进。

**步骤**：
1. approve 计划，等待至少一个任务进入 `in_progress`
2. **强制重启 Daemon 进程**
3. 等待 Daemon 启动完成

**预期结果**：
- [ ] Daemon 启动时，in_progress 的任务状态重置为 `pending`
- [ ] OpenClaw 发送 stop 消息（如果 gateway 在线）
- [ ] 定时器首次触发后，sweep 重新派发这些任务
- [ ] DAG 继续正常推进，最终 completed

---

### T08 — 并发计划执行

**目标**：验证多个计划同时执行时，agent 资源不冲突，每个计划独立推进。

**步骤**：
1. 用户 A 下发计划 P1（使用 worker-frontend、worker-backend）
2. 用户 B 下发计划 P2（使用 worker-backend、worker-docs）
3. 两个计划均 approve

**预期结果**：
- [ ] P1 和 P2 独立调度，互不影响
- [ ] worker-backend 同一时刻只执行一个任务（busy 时，另一计划的任务等待 sweep）
- [ ] P1、P2 最终均 completed，各自用 reply_to 回复正确的用户

---

### T09 — Agent 离线（openclaw agents list 中消失）

**目标**：验证 daemon sync 检测到 agent 离线后的行为。

**步骤**：
1. 在任务执行过程中，停止 OpenClaw 中某个 worker agent
2. 等待 daemon 定时器执行 `sync_agents_from_openclaw`

**预期结果**：
- [ ] agents 表中该 agent `status` 更新为 `offline`
- [ ] `GET /api/agents/{agent_id}` 返回 `status: offline`
- [ ] 正在执行的任务超时后按重试逻辑处理（不会立即失败）
- [ ] agent 重新上线后，`status` 恢复 `idle`，任务在下次 sweep 正常派发

---

### T10 — Context 完整性验证

**目标**：验证 daemon 派发任务时组装的 context 包含所有必要信息，agent 能正确执行并返回符合 result_schema 的结果。

**步骤**：
1. 下发一个有输入产物依赖的任务（t2 依赖 t1 的产出）
2. 等待 t1 完成后 t2 启动
3. 查看 t2 的 openclaw 执行日志（或 agent 回复内容）

**预期结果**：
- [ ] t2 收到的 message 包含：任务ID、类型、参数、所属计划、输入产物路径
- [ ] 输入产物路径指向 `./artifacts/tasks/{t1_id}/`，且文件实际存在
- [ ] t2 输出文件写入 `./artifacts/tasks/{t2_id}/`
- [ ] t2 返回的 JSON 符合 publisher 定义的 `result_schema`
- [ ] daemon 成功解析结果，task status → `completed`
