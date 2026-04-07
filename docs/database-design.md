# ClawPilot SQLite 数据库设计

## 数据库文件

- 数据库文件位置：`~/.clawpilot/clawpilot.db`

## 表结构

### 1. 核心配置表

#### `openclaw_config`
主配置表，存储全局配置

```sql
CREATE TABLE openclaw_config (
    id INTEGER PRIMARY KEY CHECK (id = 1),
    current_opc TEXT NOT NULL,           -- 当前激活的 OPC 名称
    version TEXT DEFAULT '1.0.0',        -- OpenClaw 版本
    last_updated INTEGER NOT NULL,       -- 最后更新时间戳 (Unix)
    created_at INTEGER NOT NULL DEFAULT (strftime('%s', 'now'))
);
```

#### `opc_config`
OPC (OpenClaw 团队) 配置表

```sql
CREATE TABLE opc_config (
    id TEXT PRIMARY KEY,                 -- OPC 唯一标识
    name TEXT NOT NULL UNIQUE,           -- 团队名称（目录名）
    display_name TEXT NOT NULL,          -- 显示名称
    description TEXT,                    -- 描述
    avatar_color TEXT,                   -- 头像颜色
    avatar_initials TEXT,                -- 头像文字
    is_active INTEGER DEFAULT 0,         -- 是否激活 (0/1)
    is_running INTEGER DEFAULT 0,        -- 是否运行中 (0/1)

    -- 统计数据
    agent_count INTEGER DEFAULT 0,
    channel_count INTEGER DEFAULT 0,
    group_count INTEGER DEFAULT 0,
    dm_count INTEGER DEFAULT 0,
    message_count_today INTEGER DEFAULT 0,
    message_growth REAL DEFAULT 0.0,     -- 消息增长率（百分比）

    created_at INTEGER NOT NULL,
    updated_at INTEGER NOT NULL
);

CREATE INDEX idx_opc_is_active ON opc_config(is_active);
CREATE INDEX idx_opc_name ON opc_config(name);
```

### 2. Agent 配置表

#### `agents`
Agent 配置表

```sql
CREATE TABLE agents (
    id TEXT PRIMARY KEY,                 -- Agent 唯一标识
    opc_id TEXT NOT NULL,                -- 所属 OPC ID
    name TEXT NOT NULL,                  -- Agent 名称
    display_name TEXT NOT NULL,          -- 显示名称（中文名）
    job_title TEXT,                      -- 职位/职称
    personality TEXT,                    -- 性格特征
    description TEXT,                    -- 简介描述
    initials TEXT,                       -- 英文标识
    gradient_start TEXT,                 -- 渐变色起始
    gradient_end TEXT,                   -- 渐变色结束
    is_default INTEGER DEFAULT 0,        -- 是否为默认响应者 (0/1)
    order_index INTEGER DEFAULT 0,       -- 排序索引

    -- 模型配置
    model_provider TEXT,                 -- 模型提供商
    model_name TEXT,                     -- 模型名称

    -- JSON 字段
    enabled_tools TEXT,                  -- JSON 数组：启用的工具 ID
    disabled_tools TEXT,                 -- JSON 数组：禁用的工具 ID
    enabled_skills TEXT,                 -- JSON 数组：启用的 Skill slug
    guardrail_rules TEXT,                -- JSON 数组：护栏规则
    reports_to TEXT,                     -- JSON 数组：汇报给哪些 Agent
    manages TEXT,                        -- JSON 数组：管理哪些 Agent

    created_at INTEGER NOT NULL,
    updated_at INTEGER NOT NULL,

    FOREIGN KEY (opc_id) REFERENCES opc_config(id) ON DELETE CASCADE
);

CREATE INDEX idx_agents_opc_id ON agents(opc_id);
CREATE INDEX idx_agents_is_default ON agents(is_default);
CREATE INDEX idx_agents_order_index ON agents(opc_id, order_index);
```

#### `agent_documents`
Agent 文档表（SOUL, IDENTITY 等）

```sql
CREATE TABLE agent_documents (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    agent_id TEXT NOT NULL,              -- 关联 Agent ID
    document_type TEXT NOT NULL,         -- 文档类型：SOUL/IDENTITY/AGENTS/USER/MEMORY/HEARTBEAT/TOOLS
    content TEXT NOT NULL,               -- 文档内容

    UNIQUE(agent_id, document_type),
    FOREIGN KEY (agent_id) REFERENCES agents(id) ON DELETE CASCADE
);

CREATE INDEX idx_agent_documents_agent_id ON agent_documents(agent_id);
CREATE INDEX idx_agent_documents_type ON agent_documents(document_type);
```

### 3. 模型配置表

#### `model_providers`
模型提供商配置表

```sql
CREATE TABLE model_providers (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    provider_type TEXT NOT NULL,        -- BAILIAN/VOLCENGINE/MINIMAX
    api_key TEXT NOT NULL,               -- API Key (加密存储)
    endpoint TEXT,                       -- API 端点
    is_enabled INTEGER DEFAULT 1,        -- 是否启用 (0/1)
    is_available INTEGER DEFAULT 0,      -- 是否可用 (0/1)
    last_tested INTEGER,                 -- 最后测试时间戳
    created_at INTEGER NOT NULL,
    updated_at INTEGER NOT NULL,

    UNIQUE(provider_type)
);
```

#### `model_info`
模型信息表

```sql
CREATE TABLE model_info (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL UNIQUE,          -- 模型名称
    display_name TEXT NOT NULL,         -- 显示名称
    provider_type TEXT NOT NULL,        -- 提供商类型

    -- 能力信息
    context_window INTEGER DEFAULT 0,   -- 上下文窗口大小
    input_price REAL DEFAULT 0.0,       -- 输入价格 (元/千tokens)
    output_price REAL DEFAULT 0.0,      -- 输出价格 (元/千tokens)
    supported_types TEXT,               -- JSON 数组：支持的输入类型

    -- 模型特性
    supports_vision INTEGER DEFAULT 0,  -- 是否支持视觉 (0/1)
    supports_function_calling INTEGER DEFAULT 0,  -- 是否支持函数调用 (0/1)
    supports_streaming INTEGER DEFAULT 0,  -- 是否支持流式输出 (0/1)

    updated_at INTEGER NOT NULL,

    FOREIGN KEY (provider_type) REFERENCES model_providers(provider_type)
);

CREATE INDEX idx_model_info_provider ON model_info(provider_type);
```

### 4. 渠道配置表

#### `channels`
渠道配置表

```sql
CREATE TABLE channels (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    opc_id TEXT NOT NULL,                -- 所属 OPC ID
    channel_type TEXT NOT NULL,         -- FEISHU/DINGTALK/WECHAT
    is_enabled INTEGER DEFAULT 1,        -- 是否启用 (0/1)

    -- 飞书配置 (JSON)
    feishu_config TEXT,                 -- JSON：{app_id, app_secret}

    -- 连接状态
    is_connected INTEGER DEFAULT 0,     -- 是否已连接 (0/1)
    last_connected INTEGER,             -- 最后连接时间戳

    created_at INTEGER NOT NULL,
    updated_at INTEGER NOT NULL,

    FOREIGN KEY (opc_id) REFERENCES opc_config(id) ON DELETE CASCADE
);

CREATE INDEX idx_channels_opc_id ON channels(opc_id);
CREATE INDEX idx_channels_type ON channels(channel_type);
```

### 5. 绑定配置表

#### `bindings`
频道绑定表

```sql
CREATE TABLE bindings (
    id TEXT PRIMARY KEY,                 -- 绑定 ID
    opc_id TEXT NOT NULL,                -- 所属 OPC ID
    channel_id TEXT NOT NULL,            -- 频道 ID (群ID/用户ID)
    channel_name TEXT NOT NULL,          -- 频道名称
    channel_type TEXT NOT NULL,          -- GROUP/DM
    agent_id TEXT NOT NULL,              -- 绑定的 Agent ID
    agent_name TEXT NOT NULL,            -- Agent 名称（冗余）
    trigger_mode TEXT NOT NULL,          -- MENTION/ALL
    is_enabled INTEGER DEFAULT 1,        -- 是否启用 (0/1)
    created_at INTEGER NOT NULL,
    updated_at INTEGER NOT NULL,

    FOREIGN KEY (opc_id) REFERENCES opc_config(id) ON DELETE CASCADE,
    FOREIGN KEY (agent_id) REFERENCES agents(id) ON DELETE CASCADE
);

CREATE INDEX idx_bindings_opc_id ON bindings(opc_id);
CREATE INDEX idx_bindings_channel_id ON bindings(channel_id);
CREATE INDEX idx_bindings_agent_id ON bindings(agent_id);
```

#### `opc_defaults`
OPC 默认配置表

```sql
CREATE TABLE opc_defaults (
    opc_id TEXT PRIMARY KEY,             -- OPC ID
    default_agent TEXT,                  -- 默认 Agent ID

    FOREIGN KEY (opc_id) REFERENCES opc_config(id) ON DELETE CASCADE,
    FOREIGN KEY (default_agent) REFERENCES agents(id) ON DELETE SET NULL
);
```

### 6. 工具和技能库表

#### `tools`
全局工具库表（从 clawhub.ai 同步）

```sql
CREATE TABLE tools (
    id TEXT PRIMARY KEY,                 -- 工具 ID (slug)
    name TEXT NOT NULL,                  -- 工具名称
    slug TEXT NOT NULL UNIQUE,           -- URL slug
    description TEXT,                    -- 工具描述
    author TEXT,                         -- 作者
    size INTEGER DEFAULT 0,              -- 包大小（字节）
    url TEXT,                            -- ClawHub URL
    version TEXT,                        -- 版本号
    updated_at INTEGER NOT NULL,         -- 最后更新时间戳
    tags TEXT,                           -- JSON 数组：标签
    category TEXT,                       -- 分类
    downloads INTEGER DEFAULT 0,         -- 下载次数
    is_builtin INTEGER DEFAULT 0,        -- 是否为内置工具 (0/1)
    last_synced INTEGER                  -- 最后同步时间戳
);

CREATE INDEX idx_tools_category ON tools(category);
CREATE INDEX idx_tools_is_builtin ON tools(is_builtin);
```

#### `skills`
全局技能库表（从 clawhub.ai 同步）

```sql
CREATE TABLE skills (
    id TEXT PRIMARY KEY,                 -- 技能 ID
    name TEXT NOT NULL,                  -- 技能名称
    slug TEXT NOT NULL UNIQUE,           -- URL slug
    description TEXT,                    -- 技能描述
    author TEXT,                         -- 作者
    size INTEGER DEFAULT 0,              -- 包大小（字节）
    url TEXT,                            -- ClawHub URL
    version TEXT,                        -- 版本号
    updated_at INTEGER NOT NULL,         -- 最后更新时间戳
    tags TEXT,                           -- JSON 数组：标签
    category TEXT,                       -- 分类
    downloads INTEGER DEFAULT 0,         -- 下载次数
    is_builtin INTEGER DEFAULT 0,        -- 是否为内置技能 (0/1)
    last_synced INTEGER                  -- 最后同步时间戳
);

CREATE INDEX idx_skills_category ON skills(category);
CREATE INDEX idx_skills_is_builtin ON skills(is_builtin);
```

### 7. 快照和部署表

#### `local_snapshots`
本地快照表（免费功能）

```sql
CREATE TABLE local_snapshots (
    id TEXT PRIMARY KEY,                 -- 快照 ID
    label TEXT NOT NULL,                 -- 快照标签
    opc_name TEXT NOT NULL,              -- OPC 名称
    config_data TEXT NOT NULL,           -- 配置数据 (JSON 序列化)
    is_auto INTEGER DEFAULT 0,           -- 是否自动生成 (0/1)
    created_at INTEGER NOT NULL
);

CREATE INDEX idx_snapshots_opc_name ON local_snapshots(opc_name);
CREATE INDEX idx_snapshots_created_at ON local_snapshots(created_at DESC);
```

#### `deployment_tasks`
部署任务表

```sql
CREATE TABLE deployment_tasks (
    id TEXT PRIMARY KEY,                 -- 任务 ID
    opc_name TEXT NOT NULL,              -- OPC 名称
    status TEXT NOT NULL,                -- PENDING/RUNNING/SUCCESS/FAILED/ROLLBACK
    message TEXT,                        -- 状态消息
    steps TEXT NOT NULL,                 -- JSON 数组：执行步骤
    current_step INTEGER DEFAULT 0,      -- 当前步骤索引
    created_at INTEGER NOT NULL,
    started_at INTEGER,
    completed_at INTEGER
);

CREATE INDEX idx_deployment_opc_name ON deployment_tasks(opc_name);
CREATE INDEX idx_deployment_status ON deployment_tasks(status);
CREATE INDEX idx_deployment_created_at ON deployment_tasks(created_at DESC);
```

### 8. 日志表

#### `log_entries`
日志表

```sql
CREATE TABLE log_entries (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    timestamp INTEGER NOT NULL,          -- 时间戳
    level TEXT NOT NULL,                 -- DEBUG/INFO/WARN/ERROR
    component TEXT,                      -- 组件/模块
    message TEXT NOT NULL,               -- 消息
    agent_id TEXT,                       -- 相关 Agent ID (可选)
    channel TEXT,                        -- 相关渠道 (可选)
    metadata TEXT,                       -- JSON：元数据

    FOREIGN KEY (agent_id) REFERENCES agents(id) ON DELETE SET NULL
);

CREATE INDEX idx_log_timestamp ON log_entries(timestamp DESC);
CREATE INDEX idx_log_level ON log_entries(level);
CREATE INDEX idx_log_component ON log_entries(component);
CREATE INDEX idx_log_agent_id ON log_entries(agent_id);
```

### 9. Pro 功能表（可选）

#### `users`
用户表（Pro 功能）

```sql
CREATE TABLE users (
    id TEXT PRIMARY KEY,                 -- 用户 ID
    phone TEXT,                          -- 手机号
    wechat_openid TEXT,                  -- 微信 OpenID
    nickname TEXT,                       -- 昵称
    avatar_url TEXT,                     -- 头像 URL
    created_at INTEGER NOT NULL,
    last_login_at INTEGER
);

CREATE INDEX idx_users_phone ON users(phone);
CREATE INDEX idx_users_wechat_openid ON users(wechat_openid);
```

#### `auth_tokens`
登录凭证表

```sql
CREATE TABLE auth_tokens (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id TEXT NOT NULL,               -- 用户 ID
    access_token TEXT NOT NULL,          -- 访问令牌
    refresh_token TEXT NOT NULL,         -- 刷新令牌
    expires_in INTEGER NOT NULL,         -- 过期时间 (秒)
    token_type TEXT DEFAULT 'Bearer',    -- 令牌类型
    created_at INTEGER NOT NULL,

    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);

CREATE INDEX idx_auth_tokens_access_token ON auth_tokens(access_token);
CREATE INDEX idx_auth_tokens_user_id ON auth_tokens(user_id);
```

#### `subscriptions`
订阅表

```sql
CREATE TABLE subscriptions (
    id TEXT PRIMARY KEY,                 -- 订阅 ID
    user_id TEXT NOT NULL,               -- 用户 ID
    plan TEXT NOT NULL,                  -- FREE/MONTHLY/YEARLY
    status TEXT NOT NULL,                -- INACTIVE/ACTIVE/CANCELED/EXPIRED
    started_at INTEGER NOT NULL,         -- 开始时间
    expires_at INTEGER NOT NULL,         -- 到期时间
    auto_renew INTEGER DEFAULT 0,        -- 是否自动续费 (0/1)
    created_at INTEGER NOT NULL,
    updated_at INTEGER NOT NULL,

    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);

CREATE INDEX idx_subscriptions_user_id ON subscriptions(user_id);
CREATE INDEX idx_subscriptions_status ON subscriptions(status);
```

#### `orders`
订单表

```sql
CREATE TABLE orders (
    id TEXT PRIMARY KEY,                 -- 订单 ID
    user_id TEXT NOT NULL,               -- 用户 ID
    amount INTEGER NOT NULL,             -- 金额 (分)
    plan TEXT NOT NULL,                  -- 购买计划
    payment_method TEXT NOT NULL,        -- WECHAT/ALIPAY
    status TEXT NOT NULL,                -- PENDING/PAID/FAILED/REFUNDED/CANCELED
    transaction_id TEXT,                 -- 第三方交易 ID
    paid_at INTEGER,                     -- 支付时间
    raw_callback TEXT,                   -- 原始回调数据
    created_at INTEGER NOT NULL,
    updated_at INTEGER NOT NULL,

    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);

CREATE INDEX idx_orders_user_id ON orders(user_id);
CREATE INDEX idx_orders_status ON orders(status);
```

#### `templates`
模板市场表

```sql
CREATE TABLE templates (
    id TEXT PRIMARY KEY,                 -- 模板 ID
    author_id TEXT,                      -- 作者 ID
    author_name TEXT,                    -- 作者名称
    title TEXT NOT NULL,                 -- 标题
    description TEXT,                    -- 描述
    category TEXT,                       -- 分类
    tags TEXT,                           -- JSON 数组：标签
    content BLOB,                        -- 模板内容 (压缩的 OPCConfig)
    thumbnail BLOB,                      -- 缩略图

    -- 统计
    downloads INTEGER DEFAULT 0,         -- 下载次数
    views INTEGER DEFAULT 0,             -- 浏览次数
    rating REAL DEFAULT 0.0,             -- 评分 (0-5)
    rating_count INTEGER DEFAULT 0,      -- 评分人数

    -- 状态
    status TEXT DEFAULT 'DRAFT',         -- DRAFT/REVIEWING/PUBLISHED/REJECTED/ARCHIVED
    created_at INTEGER NOT NULL,
    updated_at INTEGER NOT NULL,
    published_at INTEGER                 -- 发布时间
);

CREATE INDEX idx_templates_category ON templates(category);
CREATE INDEX idx_templates_status ON templates(status);
CREATE INDEX idx_templates_author_id ON templates(author_id);
```

#### `cloud_snapshots`
云同步快照表（Pro 功能）

```sql
CREATE TABLE cloud_snapshots (
    id TEXT PRIMARY KEY,                 -- 快照 ID
    user_id TEXT NOT NULL,               -- 用户 ID
    opc_name TEXT NOT NULL,              -- OPC 名称
    label TEXT NOT NULL,                 -- 快照标签
    encrypted_content BLOB NOT NULL,     -- 加密内容
    size INTEGER DEFAULT 0,              -- 大小 (字节)
    created_at INTEGER NOT NULL,

    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);

CREATE INDEX idx_cloud_snapshots_user_id ON cloud_snapshots(user_id);
CREATE INDEX idx_cloud_snapshots_opc_name ON cloud_snapshots(opc_name);
```

#### `selector_configs`
自动化选择器配置表

```sql
CREATE TABLE selector_configs (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    platform_type TEXT NOT NULL,        -- BAILIAN/VOLCENGINE/FEISHU
    version TEXT NOT NULL,               -- 版本号
    published_at TEXT NOT NULL,         -- 发布时间
    config_data TEXT NOT NULL,          -- JSON：选择器配置

    UNIQUE(platform_type)
);
```

## 数据库初始化 SQL

```sql
-- 创建表顺序（考虑外键依赖）
-- 1. 核心配置表
-- 2. Agent 配置表
-- 3. 模型配置表
-- 4. 渠道配置表
-- 5. 绑定配置表
-- 6. 工具和技能库表
-- 7. 快照和部署表
-- 8. 日志表
-- 9. Pro 功能表

-- 初始化数据
INSERT INTO openclaw_config (id, current_opc, version, last_updated)
VALUES (1, '', '1.0.0', strftime('%s', 'now'));
```

## 数据迁移策略

- 使用 `PRAGMA user_version` 管理数据库版本号
- 每次升级时检查版本号并执行迁移脚本
- 保持向后兼容，必要时添加默认值

## 性能优化建议

1. 为常用的查询字段创建索引
2. 对 JSON 字段使用 SQLite 的 JSON 函数（`json_extract`, `json_each`）
3. 大文本/BLOB 字段（如 config_data, content, thumbnail）考虑单独存储
4. 日志表定期清理或归档
5. 使用事务批量插入/更新数据