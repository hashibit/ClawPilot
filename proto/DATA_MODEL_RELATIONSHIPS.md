# ClawPilot 数据模型关系图

## 文件结构

```
proto/
├── clawpilot.proto        # 核心功能（免费）
└── clawpilot-pro.proto    # Pro 付费功能
```

┌─────────────────────────────────────────────────────────────────────────────┐
│                           ClawPilot 数据模型                                │
└─────────────────────────────────────────────────────────────────────────────┘

## Pro 付费功能

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                      ClawPilot Pro 功能模块                                  │
├─────────────────────────────────────────────────────────────────────────────┤
│  • 用户认证 (User, AuthToken)                                               │
│  • 订阅管理 (Subscription, Order)                                             │
│  • 模板市场 (Template, TemplateCategory, TemplateStatus)                     │
│  • 云同步 (CloudSnapshot)                                                    │
│  • 自动化选择器 (SelectorConfig - 阿里百炼/火山方舟/飞书)                    │
└─────────────────────────────────────────────────────────────────────────────┘
         │
         │ 订阅关系
         ▼
┌──────────────────┐
│      User        │
└──────────────────┘
```

## 核心关系结构（免费）

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                           ClawCopilot 数据模型                              │
└─────────────────────────────────────────────────────────────────────────────┘

                                    ┌─────────────────┐
                                    │  OpenClawConfig │
                                    │  (主配置文件)   │
                                    └────────┬────────┘
                                             │
                                             │ current_opc
                                             ▼
┌─────────────────────────────────────────────────────────────────────────────┐
│                                  OPCConfig                                  │
│                              (OpenClaw 团队配置)                            │
├─────────────────────────────────────────────────────────────────────────────┤
│  • id                          • display_name                               │
│  • name (目录名)                • description                               │
│  • avatar_color                • is_active                                  │
│  • avatar_initials             • is_running                                 │
│  ───────────────────────────────────────────────────────────────────────    │
│  • OPCStats                    • created_at / updated_at                    │
│  ───────────────────────────────────────────────────────────────────────    │
│  • repeated AgentConfig agents  • ModelsConfig models                       │
│  • ChannelsConfig channels      • BindingsConfig bindings                   │
└─────────────────────────────────────────────────────────────────────────────┘
         │                    │                    │                    │
         │ agents             │ models             │ channels           │ bindings
         ▼                    ▼                    ▼                    ▼

┌──────────────────┐  ┌──────────────────┐  ┌──────────────────┐  ┌──────────────────┐
│   AgentConfig    │  │  ModelsConfig    │  │ ChannelsConfig   │  │ BindingsConfig   │
├──────────────────┤  ├──────────────────┤  ├──────────────────┤  ├──────────────────┤
│ • id             │  │ •default_provider│  • repeated         │  │ • repeated       │
│ • name           │  │ • providers[]    │  │   ChannelConfig  │  │   BindingRule[]  │
│ • display_name   │  │ • models[]       │  │                  │  │ • default_agent  │
│ • job_title      │  └──────────────────┘  └──────────────────┘  │ • routing_rules[]│
│ • initials       │                                              └──────────────────┘
│ • gradient_start │
│ • is_default     │
│ • order_index    │
├──────────────────┤
│ • documents      │
│ • tools[]        │
│ • skills[]       │
│ • guardrail_rules│
│ • model_provider │
│ • model_name     │
├──────────────────┤
│ • reports_to[]   │ ←─────┐
│ • manages[]      │ ──┐   │  Agent 之间的汇报关系
└────────┬─────────┘   │   │  （组织结构）
         │             │   │
         │             └───┘
         │
         │ documents.soul
         │ documents.identity
         │ documents.agents
         ▼
┌─────────────────────────────────────────────────────────────────────────────┐
│                          AgentDocuments (Agent 灵魂文档)                    │
├─────────────────────────────────────────────────────────────────────────────┤
│  • soul         (SOUL.md)     - 人格、沟通风格、行为边界                    │
│  • identity     (IDENTITY.md) - 名称、人格标签、emoji                       │
│  • agents       (AGENTS.md)   - 如何使用记忆、与其他Agent协作               │
│  • user         (USER.md)     - 用户身份信息、沟通偏好                      │
│  • memory       (MEMORY.md)   - 长期记忆（仅私人会话）                      │
│  • heartbeat    (HEARTBEAT.md)- 心跳任务清单                                │
│  • tools        (TOOLS.md)    - 工具使用指南                                │
└─────────────────────────────────────────────────────────────────────────────┘


## 工具和技能库关系（ClawHub.ai）

┌─────────────────────────────────────────────────────────────────────────────┐
│                            ClawHub.ai                                       │
│                       (工具和技能的中央仓库)                                  │
├─────────────────────────────────────────────────────────────────────────────┤
│  • ToolRegistry      - 全局工具库                                            │
│  • SkillRegistry     - 全局技能库                                            │
└─────────────────────────────────────────────────────────────────────────────┘
         │                           │
         │ last_synced               │ last_synced
         │ 从 ClawHub 同步            │ 从 ClawHub 同步
         ▼                           ▼
┌──────────────────┐       ┌──────────────────┐
│  ToolInfo[]      │       │  SkillInfo[]     │
├──────────────────┤       ├──────────────────┤
│ • id (slug)      │       │ • id             │
│ • name           │       │ • name           │
│ • slug (URL)     │       │ • slug (URL)     │
│ • description    │       │ • description    │
│ • author         │       │ • author         │
│ • size           │       │ • size           │
│ • url            │       │ • url            │
│ • version        │       │ • version        │
│ • updated_at     │       │ • updated_at     │
│ • tags[]         │       │ • tags[]         │
│ • category       │       │ • category       │
│ • downloads      │       │ • downloads      │
│ • is_builtin     │       │ • is_builtin     │
└──────────────────┘       └──────────────────┘
         │                           │
         │                           │
         │ 被 AgentConfig 引用        │ 被 AgentConfig 引用
         │                           │
         ▼                           ▼
┌─────────────────────────────────────────────────────────────────────────────┐
│                           AgentConfig                                        │
├─────────────────────────────────────────────────────────────────────────────┤
│  • enabled_tools[]    ←────────┘  (ToolInfo.id)                             │
│  • disabled_tools[]   (全局排除)                                             │
│  • enabled_skills[]   ←──────────── (SkillInfo.slug)                         │
└─────────────────────────────────────────────────────────────────────────────┘

### 示例：ClawHub 工具

```
ToolInfo {
  id: "openai-whisper-api"
  name: "OpenAI Whisper API"
  slug: "steipete/openai-whisper-api"
  description: "OpenAI Whisper API for speech-to-text"
  author: "steipete"
  size: 24576
  url: "https://clawhub.ai/steipete/openai-whisper-api"
  version: "1.2.0"
  updated_at: 1710844800
  tags: ["speech", "transcription", "ai"]
  category: "audio"
  downloads: 1234
  is_builtin: false
}
```

### AgentConfig 使用方式

```protobuf
// AgentConfig 中存储的是引用
message AgentConfig {
  // 启用的工具 ID 列表（从 ToolRegistry 选择）
  repeated string enabled_tools = [
    "openai-whisper-api",
    "web-search",
    "code-interpreter"
  ];

  // 全局禁用的工具 ID（用于排除某些不合适的工具）
  repeated string disabled_tools = [
    "system-command"  // 不允许执行系统命令
  ];

  // 启用的技能 slug 列表（从 SkillRegistry 选择）
  repeated string enabled_skills = [
    "multi-round-memory",
    "scheduled-heartbeat"
  ];
}
```

┌─────────────────────────────────────────────────────────────────────────────┐
│                              ModelsConfig                                   │
├─────────────────────────────────────────────────────────────────────────────┤
│  • default_provider                                                         │
│  • providers[]            ←─────┬────────┐                                  │
│  • models[]                     │        │                                  │
└─────────────────────────────────────────────────────────────────────────────┘
         │                        │        │
         │ providers              │        │
         ▼                        │        │
┌──────────────────┐              │        │
│ ProviderConfig   │              │        │
├──────────────────┤              │        │
│ • type           │              │        │
│ • api_key        │              │        │
│ • endpoint       │              │        │
│ • is_enabled     │              │        │
│ • is_available   │              │        │
│ • last_tested    │              │        │
└──────────────────┘              │        │
         │                        │        │
         │ (ProviderType)         │        │
         │                        │        │
    ┌────┴────┐                   │        │
    │         │                   │        │
    ▼         ▼                   │        │
BAILIAN  VOLCENGINE  MINIMAX      │        │
                                  │        │
                                  │ models │
                                  ▼        ▼
                           ┌──────────────────────────┐
                           │    ModelInfo             │
                           ├──────────────────────────┤
                           │ • name                   │
                           │ • display_name           │
                           │ • provider               │
                           │ • context_window         │
                           │ • input_price            │
                           │ • output_price           │
                           │ • supported_types        │
                           │ • supports_vision        │
                           │ • supports_function      │
                           │ • supports_streaming     │
                           └──────────────────────────┘

## Channels & Bindings 关系

┌─────────────────────────────────────────────────────────────────────────────┐
│                            ChannelsConfig                                   │
├─────────────────────────────────────────────────────────────────────────────┤
│  • channels[]          ←──────┐                                             │
└───────────────────────────────┘─────────────────────────────────────────────
                                │
                                │
┌─────────────────────────────────────────────────────────────────────────────┐
│                            ChannelConfig                                    │
├─────────────────────────────────────────────────────────────────────────────┤
│  • type                (ChannelType)                                        │
│  • is_enabled                                                               │
│  • oneof config:                                                            │
│      • feishu        (FeishuConfig)                                         │
│      • dingtalk      (预留)                                                 │
│      • wechat        (预留)                                                 │
└─────────────────────────────────────────────────────────────────────────────┘
         │
         │ FeishuConfig
         ▼
┌─────────────────────────────────────────────────────────────────────────────┐
│                            FeishuConfig                                     │
├─────────────────────────────────────────────────────────────────────────────┤
│  • app_id             • app_secret     • use_websocket                      │
│  • verify_token       • encrypt_key    • permissions[]                      │
│  • is_published       • bot_name       • bot_description                    │
│  • is_connected       • last_connected                                      │
└─────────────────────────────────────────────────────────────────────────────┘
         │
         │ 被 bindings 引用
         │
         ▼
┌─────────────────────────────────────────────────────────────────────────────┐
│                          BindingsConfig                                     │
├─────────────────────────────────────────────────────────────────────────────┤
│  • bindings[]                                                               │
│  • default_agent                                                            │
│  • routing_rules[]                                                          │
└─────────────────────────────────────────────────────────────────────────────┘
         │
         │ bindings
         ▼
┌─────────────────────────────────────────────────────────────────────────────┐
│                           BindingRule                                       │
├─────────────────────────────────────────────────────────────────────────────┤
│  • id                 • target_type      • target_id                        │
│  • target_name        • agent_id         • agent_name                       │
│  • channel            • trigger_mode     • keywords[]                       │
│  • is_enabled         • created_at       • updated_at                       │
└─────────────────────────────────────────────────────────────────────────────┘
         │                          │
         │ agent_id                 │ target_id
         ▼                          ▼
┌──────────────────┐    ┌──────────────────┐
│   AgentConfig    │    │  FeishuChannel   │
└──────────────────┘    └──────────────────┘


## 部署 & 快照关系

┌─────────────────────────────────────────────────────────────────────────────┐
│                          DeploymentTask                                     │
├─────────────────────────────────────────────────────────────────────────────┤
│  • id                 • opc_name        • status                            │
│  • message            • current_step    • created_at                        │
│  • started_at         • completed_at                                        │
│  ───────────────────────────────────────────────────────────────────────    │
│  • steps[]      ←─    (DeploymentStep[])                                    │
└─────────────────────────────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────────────────────────────┐
│                        LocalSnapshot / CloudSnapshot                        │
├─────────────────────────────────────────────────────────────────────────────┤
│  • id                 • opc_name        • label                             │
│  • config_data        • encrypted_content                                   │
│  • created_at         • is_auto         • size                              │
└─────────────────────────────────────────────────────────────────────────────┘


## 模板市场关系

┌─────────────────────────────────────────────────────────────────────────────┐
│                             Template                                        │
├─────────────────────────────────────────────────────────────────────────────┤
│  • id                 • author_id       • author_name                       │
│  • title              • description     • category                          │
│  • tags[]             • content         • thumbnail                         │
│  ───────────────────────────────────────────────────────────────────────    │
│  • downloads          • views           • rating / rating_count             │
│  • status             • created_at      • updated_at / published_at         │
└─────────────────────────────────────────────────────────────────────────────┘
         │
         │ author_id
         ▼
┌──────────────────┐
│      User        │
└──────────────────┘


## 用户 & 订阅关系

┌──────────────────┐  subscription_id  ┌──────────────────┐
│      User        │ ─────────────────→│  Subscription    │
├──────────────────┤                   ├──────────────────┤
│ • id             │                   │ • id             │
│ • phone          │                   │ • user_id        │
│ • wechat_openid  │                   │ • plan           │
│ • nickname       │                   │ • status         │
│ • avatar_url     │                   │ • started_at     │
│ • created_at     │                   │ • expires_at     │
│ • last_login_at  │                   │ • auto_renew     │
└──────────────────┘                   └────────┬─────────┘
         │                                      │
         │ user_id                              │ order_id
         ▼                                      ▼
┌──────────────────┐                  ┌──────────────────┐
│     Order        │                  │  Order (payment) │
├──────────────────┤                  ├──────────────────┤
│ • id             │                  │ • transaction_id │
│ • user_id        │                  │ • paid_at        │
│ • amount         │                  │ • raw_callback   │
│ • plan           │                  └──────────────────┘
│ • payment_method │
│ • status         │
│ • created_at     │
└──────────────────┘


## 自动化选择器关系

┌─────────────────────────────────────────────────────────────────────────────┐
│                         SelectorConfig                                      │
├─────────────────────────────────────────────────────────────────────────────┤
│  • version            • published_at                                        │
│  ───────────────────────────────────────────────────────────────────────    │
│  • oneof platform:                                                          │
│      • bailian      (BailianSelectors)                                      │
│      • volcengine   (VolcengineSelectors)                                   │
│      • feishu       (FeishuSelectors)                                       │
└─────────────────────────────────────────────────────────────────────────────┘


## 数据流向

### 1. 配置创建流程
```
用户描述角色 → LLM 生成 → AgentConfig + AgentDocuments → 保存到 OPCConfig
                                              ↓
                                         models.json5
                                         agents/{agent}/*.md
```

### 2. 部署流程
```
OPCConfig 编辑 → 创建 LocalSnapshot → 验证 → 写入文件 → 重启 OpenClaw
                                              ↓
                         ~/.openclaw/{opc}/openclaw.json
                         ~/.openclaw/{opc}/agents.json5
                         ~/.openclaw/{opc}/channels.json5
                         ~/.openclaw/{opc}/bindings.json5
```

### 3. 消息路由流程
```
飞书消息 → BindingsConfig 匹配 → 找到对应 AgentConfig → 调用 LLM
                      ↓
              RoutingRule 规则引擎
```

### 4. 云同步流程
```
OPCConfig → 客户端加密 → CloudSnapshot → 上传到后端
                            ↓
                     用户设备下载解密 → 恢复 OPCConfig
```

## 枚举类型总结

### 核心功能

| 枚举类型 | 说明 | 可选值 |
|---------|------|-------|
| GuardrailType | 护栏类型 | ALLOW, DENY |
| ProviderType | 模型提供商 | BAILIAN, VOLCENGINE, MINIMAX |
| ChannelType | 渠道类型 | FEISHU, DINGTALK, WECHAT |
| BindingTargetType | 绑定目标类型 | USER, GROUP, ALL |
| TriggerMode | 触发模式 | MENTION, ALL, KEYWORD |
| FeishuChannelType | 飞书频道类型 | GROUP, DM |
| LogLevel | 日志级别 | DEBUG, INFO, WARN, ERROR |
| DeploymentStatus | 部署状态 | PENDING, RUNNING, SUCCESS, FAILED, ROLLBACK |
| StepStatus | 步骤状态 | PENDING, RUNNING, SUCCESS, FAILED, SKIPPED |

### Pro 付费功能

| 枚举类型 | 说明 | 可选值 |
|---------|------|-------|
| SubscriptionPlan | 订阅计划 | FREE, MONTHLY, YEARLY |
| SubscriptionStatus | 订阅状态 | INACTIVE, ACTIVE, CANCELED, EXPIRED |
| PaymentMethod | 支付方式 | WECHAT, ALIPAY |
| OrderStatus | 订单状态 | PENDING, PAID, FAILED, REFUNDED, CANCELED |
| TemplateCategory | 模板分类 | DEVELOPMENT, MARKETING, EDUCATION, MEDIA, FINANCE, CUSTOM |
| TemplateStatus | 模板状态 | DRAFT, REVIEWING, PUBLISHED, REJECTED, ARCHIVED |
| PlatformType | 平台类型 | BAILIAN, VOLCENGINE, FEISHU |

## 文件映射关系

### 核心文件

| Proto 类型 | 对应 OpenClaw 文件 | 说明 |
|-----------|-------------------|------|
| OpenClawConfig | openclaw.json | 主配置，包含 current_opc |
| OPCConfig | {opc}/openclaw.json | 团队配置根 |
| AgentConfig | agents.json5 | Agent 列表配置 |
| AgentDocuments | agents/{agent}/*.md | Agent 的各个灵魂文件 |
| ModelsConfig | models.json5 | Provider 和模型配置 |
| ChannelConfig | channels.json5 | 飞书等渠道配置 |
| BindingsConfig | bindings.json5 | 消息路由绑定配置 |
| LocalSnapshot | snapshots/*.json | 本地快照（免费） |
| DeploymentTask | 部署任务管理 | 内存中的任务状态 |

### Pro 功能文件

| Proto 类型 | 存储位置 | 说明 |
|-----------|----------|------|
| User | 数据库 | 用户信息 |
| Subscription | 数据库 | 订阅状态 |
| Order | 数据库 | 订单记录 |
| Template | 数据库 | 模板市场内容 |
| CloudSnapshot | 数据库 | 云端配置备份（加密） |
| SelectorConfig | 数据库 | 自动化选择器配置 |

## 关键设计点

1. **分离关注点**：Agent 的逻辑配置和运行时配置分离
2. **类型安全**：使用枚举替代字符串魔法值
3. **扩展性**：ChannelConfig 使用 oneof 支持多种渠道
4. **安全性**：敏感信息（API Key）标注为加密存储
5. **审计性**：关键配置包含 created_at/updated_at
6. **UI 友好**：OPCConfig、AgentConfig 包含 UI 显示所需的字段（颜色、图标等）
7. **版本控制**：支持快照回滚机制
8. **路由灵活性**：BindingsConfig 支持复杂的路由规则
9. **工具技能库化**：工具和技能通过引用全局库管理，便于扩展
10. **免费/付费分离**：核心功能免费，高级功能（模板市场、云同步、自动化）需订阅
