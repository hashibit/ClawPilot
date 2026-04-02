# ClawPilot Skills Bundle

这是 ClawPilot 本地技能包，包含所有预装技能的实现。

## 已安装技能

| Slug | 名称 | 描述 |
|------|------|------|
| `multi-round-memory` | 多轮记忆 | 保持对话上下文记忆 |
| `proactive-speak` | 主动发言 | 满足条件时主动发起消息 |
| `scheduled-heartbeat` | 定时心跳 | 按计划定期执行任务 |
| `mention-response` | @响应 | 群聊中被@时才回复 |
| `direct-response` | 私聊响应 | 私聊中响应所有消息 |
| `message-routing` | 消息路由 | 将消息分发给合适的 Agent |
| `context-compression` | 上下文压缩 | 压缩长对话节省 token |
| `tool-calling` | 工具调用 | 自动选择调用工具 |
| `memory-persistence` | 记忆持久化 | 跨会话保存重要记忆 |
| `emotional-aware` | 情绪感知 | 识别情绪调整回复风格 |
| `github-helper` | GitHub 助手 | GitHub 仓库管理和 PR/Issue 操作 |
| `web-search` | 网页搜索 | 多引擎网页搜索 |
| `feishu-helper` | 飞书助手 | 飞书消息、文档、日历操作 |
| `code-review` | 代码审查 | 自动代码审查和改进建议 |
| `doc-writer` | 文档编写 | 自动生成技术文档 |

## 技能目录结构

每个技能以目录形式存放：

```
skills/{skill_slug}/
├── SKILL.md        # 技能描述文档
├── index.js        # 技能实现代码
└── package.json    # 依赖配置
```

## 使用方法

在 Agent 配置中，将技能 slug 添加到 `enabled_skills` 数组：

```json
{
  "enabled_skills": ["multi-round-memory", "github-helper"]
}
```
