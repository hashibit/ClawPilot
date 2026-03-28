# 多智能体协同系统设计

## 概述

基于 OpenClaw 的多智能体协同框架，用于处理复杂的多步骤任务。用户在飞书发出指令，主 agent 拆解完整的任务 DAG，Daemon 驱动 DAG 执行，协调多个 worker agent 完成工作，结果逐级汇报。

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

```
server/                              -- Rust 实现，调度算法保密
├── src/
│   ├── main.rs
│   ├── db/                          -- SQLite 连接 + 迁移
│   ├── routes/
│   │   ├── plans.rs
│   │   └── agents.rs
│   ├── services/
│   │   ├── dag.rs                   -- DAG 驱动：依赖检查、任务派发
│   │   ├── worker.rs                -- startTask、stopTask、runningTasks
│   │   ├── recovery.rs              -- 启动恢复、超时检测、自动审批
│   │   ├── openclaw.rs              -- openclaw CLI 调用封装
│   │   ├── inbox.rs                 -- 信箱投递
│   │   ├── artifacts.rs             -- 产物目录管理
│   │   └── context.rs              -- buildContext（组装 agent message）
│   └── handlers/                   -- 任务类型注册表
│
└── artifacts/                       -- 共享产物存储根目录
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
