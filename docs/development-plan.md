# ClawPilot Tauri 开发计划

## 项目概述

ClawPilot 是一个本地桌面应用，基于 Tauri 框架开发，用于管理 OpenClaw 团队配置。

**技术栈**：
- 前端：原生 HTML/CSS/JavaScript（已设计的高保真 UI）
- 后端：Rust (Tauri)
- 数据库：SQLite
- 配置格式：JSON/JSON5（与 OpenClaw 兼容）

**仓库结构**：
```
ClawCopilot/
├── src-tauri/              # Tauri 后端 (Rust)
│   ├── src/
│   │   ├── main.rs
│   │   ├── commands/       # Tauri 命令
│   │   ├── models/         # 数据模型
│   │   ├── database/       # SQLite 数据库
│   │   ├── services/       # 业务逻辑
│   │   └── utils/          # 工具函数
│   ├── Cargo.toml
│   └── tauri.conf.json
├── src/                    # 前端资源
│   ├── index.html
│   ├── *.html              # 各页面
│   ├── *.css               # 样式文件
│   └── *.js                # JavaScript 逻辑
├── proto/                  # Protobuf 定义
├── docs/                   # 文档
└── README.md
```

---

## 开发阶段

### 阶段 0：项目初始化（Week 1）

#### 0.1 环境搭建
- [ ] 安装 Rust 工具链
- [ ] 安装 Node.js (Tauri CLI 需要)
- [ ] 初始化 Tauri 项目
- [ ] 配置开发环境（VSCode 扩展、格式化工具）
- [ ] 设置 Git 工作流

#### 0.2 项目结构创建
- [ ] 创建 src-tauri/src 目录结构
- [ ] 创建 src/ 目录结构
- [ ] 复制现有的 UI 文件到 src/
- [ ] 配置 Tauri 构建选项
- [ ] 设置热重载开发模式

**交付物**：可运行的 Tauri 应用骨架

---

### 阶段 1：基础设施层（Week 2）

#### 1.1 数据库模块
- [ ] 创建数据库模块结构
- [ ] 实现 SQLite 连接池
- [ ] 创建所有表结构（参考 database-design.md）
- [ ] 实现数据库迁移机制
- [ ] 编写单元测试

#### 1.2 数据模型
- [ ] 根据 proto 文件生成 Rust 结构体
- [ ] 实现序列化/反序列化（serde）
- [ ] 实现模型验证逻辑
- [ ] 编写模型转换工具（DB ↔ Proto ↔ JSON）

#### 1.3 配置管理
- [ ] 实现应用配置加载/保存
- [ ] 实现配置文件路径管理
- [ ] 实现配置加密/解密（API Key 等）
- [ ] 编写配置迁移逻辑

**交付物**：完整的数据库和模型层，可通过代码操作数据

---

### 阶段 2：核心业务层（Week 3-4）

#### 2.1 OPC 管理
- [ ] 创建 OPC 服务（CRUD）
- [ ] 实现 OPC 统计数据计算
- [ ] 实现当前 OPC 切换逻辑
- [ ] 实现 OPC 导出/导入功能
- [ ] 实现 OPC 目录结构管理

#### 2.2 Agent 管理
- [ ] 创建 Agent 服务（CRUD）
- [ ] 实现 Agent 文档管理
- [ ] 实现 Agent 拖拽排序
- [ ] 实现 Agent 导出/导入功能
- [ ] 实现工具/技能配置管理

#### 2.3 模型管理
- [ ] 创建模型提供者服务
- [ ] 实现模型信息管理
- [ ] 实现模型可用性测试
- [ ] 实现模型配置同步

#### 2.4 渠道管理
- [ ] 创建渠道服务（CRUD）
- [ ] 实现飞书配置管理
- [ ] 实现渠道连接状态检测
- [ ] 实现渠道配置验证

**交付物**：完整的 CRUD 业务逻辑，可通过 Tauri 命令调用

---

### 阶段 3：Tauri 命令层（Week 5）

#### 3.1 OPC 命令
```rust
// OPC 相关命令
#[tauri::command]
async fn get_all_opcs() -> Result<Vec<OpcConfig>, Error>
#[tauri::command]
async fn create_opc(config: OpcConfig) -> Result<String, Error>
#[tauri::command]
async fn update_opc(id: String, config: OpcConfig) -> Result<(), Error>
#[tauri::command]
async fn delete_opc(id: String) -> Result<(), Error>
#[tauri::command]
async fn set_current_opc(id: String) -> Result<(), Error>
#[tauri::command]
async fn get_current_opc() -> Result<OpcConfig, Error>
#[tauri::command]
async fn get_opc_stats(opc_id: String) -> Result<OpcStats, Error>
```

#### 3.2 Agent 命令
```rust
// Agent 相关命令
#[tauri::command]
async fn get_agents(opc_id: String) -> Result<Vec<AgentConfig>, Error>
#[tauri::command]
async fn get_agent(id: String) -> Result<AgentConfig, Error>
#[tauri::command]
async fn create_agent(config: AgentConfig) -> Result<String, Error>
#[tauri::command]
async fn update_agent(id: String, config: AgentConfig) -> Result<(), Error>
#[tauri::command]
async fn delete_agent(id: String) -> Result<(), Error>
#[tauri::command]
async fn reorder_agents(opc_id: String, agent_ids: Vec<String>) -> Result<(), Error>
#[tauri::command]
async fn get_agent_document(agent_id: String, doc_type: String) -> Result<String, Error>
#[tauri::command]
async fn update_agent_document(agent_id: String, doc_type: String, content: String) -> Result<(), Error>
```

#### 3.3 模型命令
```rust
// 模型相关命令
#[tauri::command]
async fn get_providers() -> Result<Vec<ProviderConfig>, Error>
#[tauri::command]
async fn update_provider(provider_type: String, config: ProviderConfig) -> Result<(), Error>
#[tauri::command]
async fn get_models() -> Result<Vec<ModelInfo>, Error>
#[tauri::command]
async fn test_provider(provider_type: String) -> Result<bool, Error>
```

#### 3.4 渠道命令
```rust
// 渠道相关命令
#[tauri::command]
async fn get_channels(opc_id: String) -> Result<Vec<ChannelConfig>, Error>
#[tauri::command]
async fn update_channel(id: i32, config: ChannelConfig) -> Result<(), Error>
#[tauri::command]
async fn test_feishu_connection(app_id: String, app_secret: String) -> Result<bool, Error>
```

#### 3.5 绑定命令
```rust
// 绑定相关命令
#[tauri::command]
async fn get_bindings(opc_id: String) -> Result<Vec<BindingRule>, Error>
#[tauri::command]
async fn create_binding(binding: BindingRule) -> Result<String, Error>
#[tauri::command]
async fn update_binding(id: String, binding: BindingRule) -> Result<(), Error>
#[tauri::command]
async fn delete_binding(id: String) -> Result<(), Error>
#[tauri::command]
async fn get_feishu_channels() -> Result<Vec<FeishuChannel>, Error>
```

#### 3.6 工具/技能命令
```rust
// 工具/技能相关命令
#[tauri::command]
async fn get_tools() -> Result<Vec<ToolInfo>, Error>
#[tauri::command]
async fn get_skills() -> Result<Vec<SkillInfo>, Error>
#[tauri::command]
async fn sync_tools_from_clawhub() -> Result<Vec<ToolInfo>, Error>
#[tauri::command]
async fn sync_skills_from_clawhub() -> Result<Vec<SkillInfo>, Error>
```

#### 3.7 快照/部署命令
```rust
// 快照相关命令
#[tauri::command]
async fn create_local_snapshot(opc_name: String, label: String) -> Result<String, Error>
#[tauri::command]
async fn get_local_snapshots(opc_name: String) -> Result<Vec<LocalSnapshot>, Error>
#[tauri::command]
async fn restore_snapshot(snapshot_id: String) -> Result<(), Error>
#[tauri::command]
async fn delete_snapshot(snapshot_id: String) -> Result<(), Error>

// 部署相关命令
#[tauri::command]
async fn start_deployment(opc_name: String) -> Result<String, Error>
#[tauri::command]
async fn get_deployment_status(task_id: String) -> Result<DeploymentTask, Error>
#[tauri::command]
async fn cancel_deployment(task_id: String) -> Result<(), Error>
```

#### 3.8 日志命令
```rust
// 日志相关命令
#[tauri::command]
async fn get_logs(opc_name: String, level: Option<String>, limit: i32) -> Result<Vec<LogEntry>, Error>
#[tauri::command]
async fn stream_logs(opc_name: String) -> Result<(), Error>
```

**交付物**：所有 Tauri 命令接口，可通过前端调用

---

### 阶段 4：前端集成（Week 6-7）

#### 4.1 UI 适配
- [ ] 适配现有 HTML 文件到 Tauri 应用
- [ ] 实现页面导航逻辑
- [ ] 实现状态管理（简单方案：全局对象 + localStorage）
- [ ] 实现 API 调用封装（invoke Tauri 命令）

#### 4.2 页面功能实现
- [ ] **数据概览页**：显示 OPC 统计数据、最近活动
- [ ] **子公司管理页**：OPC CRUD、切换、导出
- [ ] **智能体管理页**：Agent CRUD、文档编辑、工具/技能配置
- [ ] **模型管理页**：Provider 配置、模型列表、可用性测试
- [ ] **飞书频道绑定页**：绑定 CRUD、飞书频道获取
- [ ] **一键部署页**：部署流程、进度显示、日志查看
- [ ] **运行日志页**：日志筛选、实时查看

#### 4.3 交互优化
- [ ] 实现拖拽排序
- [ ] 实现表单验证
- [ ] 实现确认对话框
- [ ] 实现加载状态提示
- [ ] 实现错误提示

**交付物**：完整的 UI 和交互功能

---

### 阶段 5：OpenClaw 集成（Week 8）

#### 5.1 配置文件生成
- [ ] 实现 OPCConfig 到 JSON 的转换
- [ ] 实现 AgentConfig 到 SOUL 文档的转换
- [ ] 实现 ModelsConfig 到 models.json 的转换
- [ ] 实现 ChannelsConfig 到 channels.json 的转换
- [ ] 实现 BindingsConfig 到 bindings.json 的转换

#### 5.2 目录结构管理
- [ ] 实现 OPC 目录创建
- [ ] 实现 Agent 子目录创建
- [ ] 实现 SOUL 文档生成
- [ ] 实现配置文件写入

#### 5.3 OpenClaw 通信
- [ ] 实现 OpenClaw 进程检测
- [ ] 实现 OpenClaw 进程启动/停止
- [ ] 实现配置重载通知
- [ ] 实现日志读取

#### 5.4 统计数据获取
- [ ] 实现 OpenClaw 日志解析
- [ ] 实现消息统计计算
- [ ] 实现增长趋势计算

**交付物**：可生成 OpenClaw 兼容配置，可与 OpenClaw 交互

---

### 阶段 6：测试与优化（Week 9）

#### 6.1 单元测试
- [ ] 数据库模块测试
- [ ] 业务逻辑测试
- [ ] 命令接口测试
- [ ] 模型转换测试

#### 6.2 集成测试
- [ ] 端到端流程测试
- [ ] 边界条件测试
- [ ] 错误处理测试
- [ ] 数据一致性测试

#### 6.3 性能优化
- [ ] 数据库查询优化
- [ ] 前端渲染优化
- [ ] 内存使用优化
- [ ] 启动时间优化

#### 6.4 安全加固
- [ ] API Key 加密存储
- [ ] 输入验证加强
- [ ] SQL 注入防护
- [ ] 文件路径验证

**交付物**：稳定、安全、高性能的应用

---

### 阶段 7：打包发布（Week 10）

#### 7.1 打包配置
- [ ] 配置应用图标
- [ ] 配置应用元数据
- [ ] 配置签名证书（macOS/Windows）
- [ ] 配置自动更新

#### 7.2 多平台构建
- [ ] macOS (Intel + Apple Silicon)
- [ ] Windows (x64)
- [ ] Linux (x64, AppImage)

#### 7.3 发布准备
- [ ] 编写 CHANGELOG
- [ ] 准备发布说明
- [ ] 创建 GitHub Release
- [ ] 上传安装包

#### 7.4 文档完善
- [ ] 用户手册
- [ ] 安装指南
- [ ] API 文档
- [ ] 开发文档

**交付物**：可安装的桌面应用

---

## 技术细节

### Rust 依赖
```toml
[dependencies]
tauri = { version = "2", features = ["shell-open"] }
serde = { version = "1", features = ["derive"] }
serde_json = "1"
rusqlite = { version = "0.32", features = ["bundled"] }
tokio = { version = "1", features = ["full"] }
chrono = "0.4"
uuid = { version = "1", features = ["v4", "serde"] }
anyhow = "1"
thiserror = "1"
dirs = "5"
tracing = "0.1"
tracing-subscriber = "0.3"
```

### 目录结构
```
src-tauri/src/
├── main.rs                 # Tauri 入口
├── commands/
│   ├── mod.rs
│   ├── opc.rs              # OPC 命令
│   ├── agent.rs            # Agent 命令
│   ├── model.rs            # 模型命令
│   ├── channel.rs          # 渠道命令
│   ├── binding.rs          # 绑定命令
│   ├── tool.rs             # 工具命令
│   ├── skill.rs            # 技能命令
│   ├── snapshot.rs         # 快照命令
│   ├── deployment.rs       # 部署命令
│   └── log.rs              # 日志命令
├── models/
│   ├── mod.rs
│   ├── opc.rs
│   ├── agent.rs
│   ├── model.rs
│   ├── channel.rs
│   ├── binding.rs
│   ├── tool.rs
│   └── skill.rs
├── database/
│   ├── mod.rs
│   ├── pool.rs             # 连接池
│   ├── migrations.rs       # 迁移
│   └── schema.rs           # 表定义
├── services/
│   ├── mod.rs
│   ├── opc_service.rs
│   ├── agent_service.rs
│   ├── model_service.rs
│   ├── channel_service.rs
│   ├── binding_service.rs
│   ├── tool_service.rs
│   ├── skill_service.rs
│   ├── snapshot_service.rs
│   ├── deployment_service.rs
│   └── log_service.rs
├── openclaw/
│   ├── mod.rs
│   ├── config.rs           # 配置生成
│   ├── process.rs          # 进程管理
│   └── stats.rs            # 统计计算
└── utils/
    ├── mod.rs
    ├── crypto.rs           # 加密/解密
    ├── path.rs             # 路径管理
    └── time.rs             # 时间工具
```

### 错误处理
```rust
#[derive(Debug, thiserror::Error)]
pub enum AppError {
    #[error("Database error: {0}")]
    Database(#[from] rusqlite::Error),

    #[error("IO error: {0}")]
    Io(#[from] std::io::Error),

    #[error("Serialization error: {0}")]
    Serialization(#[from] serde_json::Error),

    #[error("Not found: {0}")]
    NotFound(String),

    #[error("Validation error: {0}")]
    Validation(String),
}
```

---

## 里程碑

| 周次 | 里程碑 | 交付物 |
|------|--------|--------|
| Week 1 | 项目初始化完成 | 可运行的 Tauri 应用骨架 |
| Week 2 | 基础设施层完成 | 数据库、模型、配置管理 |
| Week 4 | 核心业务层完成 | 所有 CRUD 业务逻辑 |
| Week 5 | Tauri 命令层完成 | 所有命令接口 |
| Week 7 | 前端集成完成 | 完整的 UI 和交互 |
| Week 8 | OpenClaw 集成完成 | 可生成 OpenClaw 配置 |
| Week 9 | 测试与优化完成 | 稳定版本 |
| Week 10 | 打包发布完成 | 可安装的应用 |

---

## 风险与应对

| 风险 | 应对措施 |
|------|----------|
| OpenClaw API 变化 | 预留抽象层，配置与逻辑分离 |
| 数据库迁移复杂 | 使用版本号管理，逐步迁移 |
| 跨平台兼容性问题 | 优先测试主要平台，预留修复时间 |
| 性能问题 | 提前规划索引、缓存、分页 |
| 安全问题 | 输入验证、加密存储、权限控制 |

---

## 后续规划

### v1.0 发布后
- [ ] Pro 功能（模板市场、云同步）
- [ ] 插件系统
- [ ] 高级路由配置
- [ ] 自动化部署流水线
- [ ] 团队协作功能