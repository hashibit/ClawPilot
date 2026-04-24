# ClawPilot Skills Bundle

预打包的技能集合，用于 ClawPilot 应用发布时内置技能库。

## 目录结构

```
bundle/
├── bundled-skills-metadata.json    # 技能元数据（唯一事实来源）
└── skills/
    ├── multi-round-memory/
    ├── proactive-speak/
    ├── scheduled-heartbeat/
    ├── mention-response/
    ├── direct-response/
    ├── message-routing/
    ├── context-compression/
    ├── tool-calling/
    ├── memory-persistence/
    ├── emotional-aware/
    ├── github-helper/
    ├── web-search/
    └── feishu-helper/
```

## bundled-skills-metadata.json

这是所有技能元数据的 **唯一事实来源（Source of Truth）**，包含：
- 技能 slug（唯一标识）
- 技能名称（name, display_name）
- 技能描述（description）
- 技能分类（category: core / integration）
- 图标（icon）
- 标签（tags）

后端（Rust）和前端都从这个文件读取技能元数据进行注册和展示。

## 技能使用流程

### 1. 后端（Rust，Tauri App / dev-server 共用）

后端在启动时从 JSON 文件读取技能元数据，并注册到数据库：

```rust
// src-tauri/src/services/skill_service.rs
pub fn register_bundle_skills(pool: &DbPool) -> Result<()> {
    let metadata = load_bundle_skills_metadata()?;  // 从 JSON 读取
    for skill in &metadata.skills {
        // 注册到数据库
    }
}
```

同时通过 axum 路由暴露 API 端点供前端读取元数据：
```
POST /api/get_bundle_skills_metadata
```

### 2. 前端

前端在 App 启动时通过 API 获取技能元数据，缓存到 `window.__BUNDLE_SKILLS_METADATA`：

```typescript
// src/App.tsx
async function loadBundleSkillsMetadata() {
  const res = await fetch('/api/get_bundle_skills_metadata')
  window.__BUNDLE_SKILLS_METADATA = await res.json()
}

// src/pages/AgentsPage.tsx
const SKILL_REGISTRY = window.__BUNDLE_SKILLS_METADATA?.skills?.map(...)
```

### 3. OPC 部署

当用户部署 OPC 时，已安装的技能会被打包到部署包中，随 bundle 目录一起发布。

## 添加新技能

1. 在 `bundle/skills/` 目录下创建技能目录
2. 在 `bundled-skills-metadata.json` 的 `skills` 数组中添加技能元数据
3. 后端（dev-server / Tauri App）启动时会自动注册

示例元数据：
```json
{
  "slug": "my-new-skill",
  "name": "my-new-skill",
  "display_name": "我的新技能",
  "description": "这是一个新技能的描述",
  "category": "core",
  "icon": "🔧",
  "tags": ["new", "feature"]
}
```

## 技能列表

| Slug | 名称 | 分类 | 描述 |
|------|------|------|------|
| `multi-round-memory` | 多轮记忆 | core | 保持对话上下文记忆 |
| `proactive-speak` | 主动发言 | core | 满足条件时主动发起消息 |
| `scheduled-heartbeat` | 定时心跳 | core | 按计划定期执行任务 |
| `mention-response` | @响应 | core | 群聊中被@时才回复 |
| `direct-response` | 私聊响应 | core | 私聊中响应所有消息 |
| `message-routing` | 消息路由 | core | 将消息分发给合适的 Agent |
| `context-compression` | 上下文压缩 | core | 压缩长对话节省 token |
| `tool-calling` | 工具调用 | core | 自动选择调用工具 |
| `memory-persistence` | 记忆持久化 | core | 跨会话保存重要记忆 |
| `emotional-aware` | 情绪感知 | core | 识别情绪调整回复风格 |
| `github-helper` | GitHub 助手 | integration | GitHub 仓库管理、PR/Issue 操作 |
| `web-search` | 网页搜索 | integration | 多引擎网页搜索 |
| `feishu-helper` | 飞书助手 | integration | 飞书消息、日历、文档管理 |
