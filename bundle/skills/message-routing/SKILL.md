# Message Routing Skill

消息路由协调技能，将消息分发给合适的 Agent。

## 功能

- 分析消息意图
- 匹配最佳处理 Agent
- 支持路由规则配置

## 配置

```json
{
  "routes": [
    { "pattern": "代码|bug|错误", "agent": "developer" },
    { "pattern": "文档|帮助", "agent": "writer" }
  ]
}
```
