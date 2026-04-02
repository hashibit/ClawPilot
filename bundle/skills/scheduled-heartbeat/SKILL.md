# Scheduled Heartbeat Skill

定时心跳技能，按计划定期执行 HEARTBEAT 任务。

## 功能

- 支持 cron 表达式调度
- 定期执行健康检查
- 自动报告状态

## 配置

```json
{
  "schedule": "*/30 * * * *",
  "tasks": ["health_check", "status_report"]
}
```
