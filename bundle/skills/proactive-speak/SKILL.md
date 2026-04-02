# Proactive Speak Skill

主动发言技能，让 Agent 在满足特定条件时主动发起消息。

## 功能

- 定时检查触发条件
- 满足条件时主动发送消息
- 支持多种触发规则

## 触发规则

1. 时间触发：每天/每周固定时间
2. 事件触发：特定事件发生时
3. 条件触发：满足特定条件时

## 配置

```json
{
  "triggers": [
    { "type": "schedule", "cron": "0 9 * * *" },
    { "type": "event", "event": "task_completed" }
  ]
}
```
