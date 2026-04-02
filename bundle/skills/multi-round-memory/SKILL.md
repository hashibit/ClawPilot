# Multi-Round Memory Skill

多轮对话记忆技能，让 Agent 能够记住对话历史和上下文。

## 功能

- 保留最近 N 轮对话历史
- 支持关键信息提取和存储
- 自动清理过期记忆

## 配置

```json
{
  "memory_window": 10,
  "extract_key_points": true
}
```

## 使用方法

在 Agent 配置中添加到此技能：

```json
{
  "enabled_skills": ["multi-round-memory"]
}
```

## 实现说明

此技能通过拦截对话消息，将会话历史存储到内存数据库中，并在下次对话时注入上下文。
