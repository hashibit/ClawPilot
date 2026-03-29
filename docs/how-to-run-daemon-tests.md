# Daemon 集成测试方案

> 本文档为多智能体调度系统的集成测试场景，在代码实现后逐条验证。每个场景描述**前置条件、操作步骤、预期结果**，以 curl 或飞书操作为测试入口。

---

## 测试环境准备

| 项目 | 说明 |
|------|------|
| OpenClaw 实例 | 本地运行，含以下 agent：`orchestrator`、`worker-frontend`、`worker-backend`、`worker-docs` |
| `~/.openclaw/openclaw.json` | 存在且包含有效 `token` 字段 |
| Daemon | 本地启动，监听 `http://localhost:3001/api` |
| 飞书 | 已绑定 orchestrator，测试账号可发消息 |
| 共享文件系统 | `./artifacts/` 目录存在且可读写 |
| `openclaw agents list --json` | 返回上述 4 个 agent |

---

## T01 — 完整正向流程（Happy Path）

**目标**：验证从飞书下发指令到用户收到完成通知的完整链路。

**前置**：所有 agent 空闲，Daemon 已启动。

**步骤**：
1. 用户在飞书私聊 orchestrator，发送：`帮我写一个介绍页，包含前端和后端`
2. 等待 orchestrator 回复计划摘要（含 plan slug，格式如 `intro-page-20260329T1000`）并请求确认
3. 用户回复：`确认`
4. 等待约 N 分钟

**预期结果**：
- [ ] `GET /api/plans/{slug}` 返回 `status: executing`，t1/t2/t3 并行启动
- [ ] `GET /api/agents/activity` 中对应 agent 状态为 `busy`，`current_task.plan_id` 正确
- [ ] t1、t2、t3 各自完成后，`./artifacts/plans/{slug}/{agent_id}/{run_id}/` 下有产出文件
- [ ] t4（aggregate）在 t1、t2、t3 全部 completed 后自动启动
- [ ] t5（report）在 t4 完成后自动启动
- [ ] plan status 最终变为 `completed`
- [ ] orchestrator 主动在飞书发消息告知用户完成，`reply_to` 正确对应最初发指令的用户

---

## T02 — 用户超时未确认，Daemon 自动批准

**目标**：验证 `auto_approve_expired_plans` 定时逻辑正常工作。

**前置**：Daemon `auto_approve_timeout` 配置为 2 分钟（测试用）。

**步骤**：
1. 用户发送指令，orchestrator 回复计划并等待确认
2. **不回复**，等待超过 2 分钟

**预期结果**：
- [ ] Daemon 定时器触发后，plan status 由 `pending_approval` → `approved` → `executing`
- [ ] DAG 正常执行，最终完成

---

## T03 — Agent Busy，Sweep 重试派发

**目标**：验证同一 agent 串行执行、sweep 机制在 agent 空闲后捡起等待任务。

**前置**：DAG 中 `worker-frontend` 被分配了三个串行任务：

```json
"tasks": [
  { "id": "t1", "depends_on": [],     "receiver": "worker-frontend" },
  { "id": "t2", "depends_on": ["t1"], "receiver": "worker-frontend" },
  { "id": "t3", "depends_on": ["t2"], "receiver": "worker-frontend" }
]
```

**步骤**：
1. approve 计划，DAG 启动
2. 在 t1 执行期间查询 agent 状态

**预期结果**：
- [ ] `GET /api/agents/activity` 中 worker-frontend `status: busy`，`busy_since` 有值
- [ ] t2 处于 `pending`（依赖未满足），不会提前派发
- [ ] t1 完成后，t2 自动进入 `in_progress`（WebSocket lifecycle 事件触发 sweep）
- [ ] t2 完成后，t3 自动进入 `in_progress`
- [ ] 整个过程 worker-frontend 始终只有一个任务在跑

---

## T04 — 任务失败重试，耗尽后标记 failed

**目标**：验证 `retry_count` / `max_retries` 逻辑与 `task_failed` 信箱消息。

**前置**：将某 worker agent 的 SOUL 临时改为"总是返回失败"，`max_retries = 2`。

**步骤**：
1. 下发包含该 worker 任务的计划并 approve
2. 观察任务状态变化

**预期结果**：
- [ ] 每次失败后产生新 `current_run_id`，产物目录 `./artifacts/plans/{slug}/{agent_id}/{run_id}/` 互不覆盖
- [ ] 第三次失败后 `retry_count = 3 >= max_retries`，任务状态变为 `failed`
- [ ] orchestrator inbox 收到 `task_failed` 消息，payload 含 `error` 和 `retry_count: 3`
- [ ] 依赖该任务的下游任务保持 `pending`，DAG 不再推进

---

## T05 — 用户取消计划

**目标**：验证 cancel 级联取消所有未完成任务，并标记产物 invalidated。

**步骤**：
1. approve 计划，等待 t1 进入 `in_progress`
2. 调用 `PATCH /api/plans/{slug}/cancel`

**预期结果**：
- [ ] plan status → `cancelled`
- [ ] in_progress 的任务：调用 `chat.abort` 取消 runId，任务状态 → `cancelled`
- [ ] pending 的任务直接标记 `cancelled`
- [ ] 已完成任务对应的产物 status → `invalidated`
- [ ] `GET /api/plans/{slug}` 各任务状态符合上述预期

---

## T06 — 用户要求修改计划（版本迭代）

**目标**：验证计划版本切换：旧版本标记 superseded，新版本同前缀新时间戳。

**步骤**：
1. orchestrator 提交计划 `intro-page-20260329T1000`，处于 `pending_approval`
2. 用户回复：`再加一个测试模块`
3. orchestrator 提交新计划 `intro-page-20260329T1005`（同前缀，新时间戳），再次等待确认
4. 用户回复：`确认`

**预期结果**：
- [ ] 旧计划 `intro-page-20260329T1000` status → `superseded`
- [ ] 新计划 `intro-page-20260329T1005` status → `approved` → `executing`
- [ ] 新计划包含新增的测试任务节点
- [ ] 按前缀查询 `GET /api/plans?prefix=intro-page` 返回两条记录

---

## T07 — Daemon 重启恢复

**目标**：验证 `recover_on_startup` 按 runId 探查状态，正确处理三种情况。

**步骤**：
1. approve 计划，等待至少一个任务进入 `in_progress`
2. **强制重启 Daemon 进程**
3. 等待 Daemon 启动完成

**预期结果**：
- [ ] Daemon 启动时用 `current_run_id` 调用 `agent.wait` 探查状态
- [ ] 仍在运行的任务：重新注册路由表，WebSocket 事件继续驱动，**不重新派发**
- [ ] 已完成的任务：直接处理结果，DAG 推进
- [ ] runId 消失的任务：重置为 `pending`，sweep 重新派发，产生新 runId 和新产物目录
- [ ] DAG 最终 completed

---

## T08 — 并发计划执行

**目标**：验证多个计划同时执行时，agent 资源不冲突，每个计划独立推进。

**步骤**：
1. 用户 A 下发计划 P1（使用 worker-frontend、worker-backend）
2. 用户 B 下发计划 P2（使用 worker-backend、worker-docs）
3. 两个计划均 approve

**预期结果**：
- [ ] P1 和 P2 独立调度，互不影响
- [ ] worker-backend 同一时刻只执行一个任务（busy 时，另一计划的任务等待 sweep）
- [ ] `GET /api/agents/activity` 正确反映各 agent 当前归属哪个 plan
- [ ] P1、P2 最终均 completed，各自用 reply_to 回复正确的用户

---

## T09 — Agent 消失触发 blocked

**目标**：验证 agent 消失后计划立即进入 blocked，而非等待重试耗尽。

**步骤**：
1. approve 计划，等待任务进入 `in_progress`
2. 在 OpenClaw 中停止该 worker agent
3. 等待 daemon 定时器执行 `sync_agents_from_openclaw`

**预期结果**：
- [ ] agents 表中该 agent `status` 更新为 `offline`
- [ ] 该 agent 的所有 `pending`/`in_progress` 任务**立即**标记 `blocked`（不等重试耗尽）
- [ ] 对应 plan status → `blocked`
- [ ] 用户通过 `reply_channel` 收到通知
- [ ] `GET /api/agents/activity` 中该 agent 显示 `offline`

---

## T10 — Context 完整性与产物路径验证

**目标**：验证 context 正确传递输入产物路径，产物写入新格式目录。

**步骤**：
1. 下发一个有输入产物依赖的任务（t2 依赖 t1 的产出）
2. 等待 t1 完成后 t2 启动
3. 查看 t2 收到的 message 内容

**预期结果**：
- [ ] t1 产物写入 `./artifacts/plans/{slug}/worker-frontend/{run_id_t1}/`
- [ ] t2 收到的 context 中输入路径指向上述目录，且文件实际存在
- [ ] t2 产物写入 `./artifacts/plans/{slug}/worker-backend/{run_id_t2}/`
- [ ] t2 返回的 JSON 符合 publisher 定义的 `result_schema`
- [ ] daemon 解析结果，task status → `completed`，`current_run_id` 保存 t2 的 runId

---

## T11 — Agent 实时事件流（喃喃自语）

**目标**：验证 SSE 接口能实时推送 agent 执行过程中的事件。

**步骤**：
1. approve 计划，等待某 worker agent 进入 `in_progress`
2. 订阅 `GET /api/agents/worker-frontend/stream`
3. 观察事件推送

**预期结果**：
- [ ] 连接后立即收到内存缓存中的历史事件
- [ ] 实时收到 `stream: assistant` 事件（agent 的文字输出增量）
- [ ] 实时收到 `stream: tool` 事件（工具调用 start/result）
- [ ] 任务完成后收到 `stream: lifecycle` `status: end` 事件
- [ ] agent 空闲后连接保持，无新事件推送

---

## T12 — Token 刷新

**目标**：验证 daemon 定时刷新 token，token 变化后 Gateway 交互正常。

**步骤**：
1. Daemon 正常运行中，修改 `~/.openclaw/openclaw.json` 中的 `token` 值
2. 等待定时器触发 `sync_token_from_openclaw`
3. 下发新计划并 approve

**预期结果**：
- [ ] 定时器触发后 daemon 内存中的 token 更新为新值
- [ ] 新计划的任务派发使用新 token，`gateway call agent` 调用成功
- [ ] WebSocket 连接使用新 token 重连成功
