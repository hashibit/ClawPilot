---
name: create-plan
description: Use when a complex task requires multiple agents to collaborate. The leader agent uses this skill to decompose tasks into DAG, submit Plan to ClawPilot Daemon for scheduling, and reply to the original user upon completion. Triggers on phrases like "multi-agent task", "coordinate team", "DAG", "create plan", "任务拆解".
metadata: { "openclaw": { "emoji": "📋" } }
---

# Create Plan Skill

多智能体任务计划创建技能。领队 Agent 收到复杂任务时，拆解 DAG、提交 Plan 给 daemon 调度执行，并在完成后回复原始用户。

## 使用场景

当用户（通过飞书）发来需要多个 Agent 协作完成的任务时，领队 Agent 使用此 skill：

1. 从 OpenClaw 系统提示中提取用户 `sender_id`
2. 将任务拆解为 DAG（有向无环图）
3. 提交 Plan 给 ClawPilot Daemon
4. 在飞书展示计划，等待用户确认
5. 用户确认后触发执行

## 如何提取 sender_id

OpenClaw 在每次对话的系统提示里注入发送者信息，格式如下：

```
Conversation info: "sender_id": "ou_0369653f12b828363a6086f4c7c4e263"
```

从这里读取 `sender_id`，作为 Plan 的 `reply_to` 字段。

## Plan ID 命名规范

```
{task-prefix}-{YYYYMMDDTHHMM}

示例：develop-crm-website-20260404T1430
```

前缀由领队根据任务内容生成（英文小写、连字符分隔）。

## API

### 创建 Plan

```
POST http://127.0.0.1:16668/api/plans
Authorization: Bearer <daemon-key>
Content-Type: application/json

{
  "id": "develop-crm-website-20260404T1430",
  "publisher_agent_id": "<领队 agent id>",
  "reply_channel": "feishu",
  "reply_to": "ou_xxx",
  "content": "用户原始指令或计划摘要",
  "tasks": [
    {
      "id": "t1",
      "receiver_agent_id": "worker-frontend",
      "type": "write_frontend",
      "priority": 0,
      "params": "{\"feature\": \"首页\"}",
      "result_schema": "{\"files\": [\"string\"]}",
      "timeout_seconds": 3600
    }
  ],
  "dependencies": [
    { "task_id": "t2", "depends_on_task_id": "t1" }
  ]
}
```

### 审批执行

```
PATCH http://127.0.0.1:16668/api/plans/{plan_id}/approve
Authorization: Bearer <daemon-key>
```

### 取消

```
PATCH http://127.0.0.1:16668/api/plans/{plan_id}/cancel
Authorization: Bearer <daemon-key>
```

## Daemon Key

从 `~/.clawpilot/daemon.key` 读取（纯文本，一行）。

## 展示给用户的计划格式（飞书）

```
📋 任务计划：{plan_id}

{计划内容摘要}

步骤：
1. {t1 描述} → {receiver agent}
2. {t2 描述} → {receiver agent}（依赖步骤1）
...

回复「确认」开始执行，回复「取消」放弃。
```

## 终端测试模式

从终端触发时，系统提示里没有 `sender_id`，`reply_channel` 和 `reply_to` 自动为 null。
orchestrator agent 收到 Plan 完成通知后，在当前终端会话输出结果，无需任何飞书配置。

## 注意事项

- 同一任务修改时：旧 Plan 状态变为 `superseded`，新建同前缀+新时间戳的 Plan
- 用户说"取消"：调用 cancel 接口
- Daemon 有 2 分钟自动审批机制，无需用户确认时可依赖此机制
