# ClawPilot 数据模型关系

## 文件结构

```
proto/
├── clawpilot.proto        # 核心功能（免费）
└── clawpilot-pro.proto    # Pro 付费功能
```

## Pro 付费功能

- 用户认证 (User, AuthToken)
- 订阅管理 (Subscription, Order)
- 模板市场 (Template, TemplateCategory, TemplateStatus)
- 云同步 (CloudSnapshot)
- 自动化选择器 (SelectorConfig - 阿里百炼/火山方舟/飞书)

## 核心关系结构（免费）

### OpenClawConfig
主配置文件，包含当前激活的 OPC。

### OPCConfig
OpenClaw 团队配置，包含：
- 基本信息：id, name, display_name, description, avatar_color, avatar_initials
- 状态：is_active, is_running
- 统计：OPCStats（agent_count, channel_count, message_count_today 等）
- 子配置：AgentConfig[], ModelsConfig, ChannelsConfig, BindingsConfig

### AgentConfig
Agent 配置，包含：
- 基本信息：id, name, display_name, job_title, initials, gradient_start/end
- 布局：is_default, order_index
- 文档：AgentDocuments（soul, identity, agents, user, memory, heartbeat, tools）
- 工具：enabled_tools[], disabled_tools[]
- 护栏：GuardrailRule[]
- 模型：model_provider, model_name
- 技能：enabled_skills[]
- 汇报关系：reports_to[], manages[]

### ModelsConfig
模型配置，包含：
- default_provider
- ProviderConfig[]
- ModelInfo[]

### ChannelsConfig
渠道配置，包含 ChannelConfig[]

### ChannelConfig
渠道配置，包含：
- type (ChannelType: FEISHU)
- is_enabled
- oneof config: FeishuConfig

### FeishuConfig
飞书配置，包含：
- app_id
- app_secret (加密)

### BindingsConfig
绑定配置，包含：
- BindingRule[] - 简单的飞书频道到 Agent 的绑定
- default_agent - 默认 Agent（可选，用于兜底）

### BindingRule
绑定规则，包含：
- id, channel_id, channel_name, channel_type
- agent_id, agent_name
- trigger_mode (@机器人/所有消息)
- is_enabled, created_at, updated_at

### LocalSnapshot
本地快照（免费功能），包含：
- id, label, opc_name
- config_data (JSON 序列化)
- is_auto

### DeploymentTask
部署任务，包含：
- id, opc_name, status, message
- DeploymentStep steps[]
- current_step
- created_at, started_at, completed_at

### LogEntry
日志条目，包含：
- timestamp, level (LogLevel)
- component, message
- agent_id, channel
- metadata (map<string, string>)

## 工具和技能库（来自 clawhub.ai）

### ToolInfo
工具信息，包含：
- id (slug), name, slug
- description, author
- size, url, version, updated_at
- tags[], category
- downloads, is_builtin

### ToolRegistry
工具库，包含：
- ToolInfo tools[]
- last_synced, version

### SkillInfo
技能信息，包含：
- id, name, slug
- description, author
- size, url, version, updated_at
- tags[], category
- downloads, is_builtin

### SkillRegistry
技能库，包含：
- SkillInfo skills[]
- last_synced, version

## Enum 定义

### 核心功能

- ProviderType: BAILIAN, VOLCENGINE, MINIMAX
- ChannelType: FEISHU, DINGTALK, WECHAT
- FeishuChannelType: GROUP, DM
- TriggerMode: MENTION, ALL
- GuardrailType: ALLOW, DENY
- LogLevel: DEBUG, INFO, WARN, ERROR
- DeploymentStatus: PENDING, RUNNING, SUCCESS, FAILED, ROLLBACK
- StepStatus: PENDING, RUNNING, SUCCESS, FAILED, SKIPPED

### Pro 付费功能

- SubscriptionPlan: FREE, MONTHLY, YEARLY
- SubscriptionStatus: INACTIVE, ACTIVE, CANCELED, EXPIRED
- PaymentMethod: WECHAT, ALIPAY
- OrderStatus: PENDING, PAID, FAILED, REFUNDED, CANCELED
- TemplateCategory: UNKNOWN, DEVELOPMENT, MARKETING, EDUCATION, MEDIA, FINANCE, CUSTOM
- TemplateStatus: DRAFT, REVIEWING, PUBLISHED, REJECTED, ARCHIVED
- PlatformType: UNKNOWN, BAILIAN, VOLCENGINE, FEISHU

## 文件映射

- OpenClawConfig → openclaw.json
- OPCConfig → opc_name/opc.json
- AgentConfig → opc_name/agents.json
- AgentDocuments → opc_name/agents/{agent_id}/{SOUL|IDENTITY|AGENTS|USER|MEMORY|HEARTBEAT|TOOLS}.md
- ModelsConfig → opc_name/models.json
- ChannelsConfig → opc_name/channels.json
- BindingsConfig → opc_name/bindings.json
- LocalSnapshot → snapshots/local/{id}.json
- DeploymentTask → tasks/{id}.json
- LogEntry → logs/{opc_name}_{timestamp}.log
- ToolRegistry → (运行时，从 clawhub.ai 同步)
- SkillRegistry → (运行时，从 clawhub.ai 同步)