# ClawPilot - 产品需求文档（PRD）

## 概述

ClawPilot 是一款本地桌面应用，基于 Tauri 框架构建，为 OpenClaw 用户提供可视化的团队配置管理界面。用户可通过 ClawPilot 管理多个 OPC（OpenClaw 团队配置），包括智能体、模型、渠道、飞书绑定等，并支持一键部署到 OpenClaw 运行时。

**目标用户**：使用 OpenClaw 框架的团队管理员
**平台**：macOS、Windows、Linux
**技术栈**：Tauri 2 + Rust + SQLite + 原生 HTML/CSS/JS

---

## 核心功能

### OPC 管理（子公司/团队配置）
- 创建、编辑、删除 OPC 配置
- 切换当前活跃 OPC
- 查看 OPC 统计数据（智能体数、消息数、增长趋势）
- 导出 / 导入 OPC 配置（JSON 格式）
- OPC 目录结构自动生成

### 智能体管理
- 创建、编辑、删除 Agent
- 编辑 Agent 文档（SOUL / IDENTITY / AGENTS / USER / MEMORY / HEARTBEAT / TOOLS）
- 拖拽排序 Agent 列表
- 工具（Tool）与技能（Skill）配置
- 导出 / 导入 Agent 配置

### 模型管理
- 配置模型提供者（Provider）及 API Key
- 查看可用模型列表
- 测试模型连通性
- 模型配置同步

### 渠道管理
- 配置飞书（Feishu）渠道
- 飞书 App ID / App Secret 配置
- 渠道连接状态检测
- 渠道配置验证

### 飞书频道绑定
- 创建、编辑、删除频道绑定规则
- 获取飞书频道列表
- 绑定规则与 Agent 的关联管理

### 快照与部署
- 创建本地配置快照（带标签）
- 查看 / 恢复 / 删除历史快照
- 一键部署：生成 OpenClaw 兼容配置并触发部署
- 部署进度实时展示
- 取消进行中的部署任务

### 日志查看
- 查看运行日志（按 OPC、级别、数量筛选）
- 实时日志流（log streaming）

---

## 技术要求

### 前端
- 原生 HTML / CSS / JavaScript（已有高保真 UI 设计稿）
- 页面导航与状态管理（全局对象 + localStorage）
- 通过 `invoke` 调用 Tauri 命令
- 支持拖拽排序、表单验证、确认对话框、加载/错误提示

### 后端（Rust / Tauri）
- Tauri 2 框架，提供前端可调用的命令接口
- SQLite 数据库（rusqlite，bundled 模式）
- 完整的 CRUD 服务层（OPC / Agent / Model / Channel / Binding / Tool / Skill / Snapshot / Deployment / Log）
- 配置文件生成器：将数据库配置转换为 OpenClaw 兼容的 JSON / SOUL 文件
- OpenClaw 进程管理：启动、停止、重载配置、读取日志

### 数据安全
- API Key 加密存储（AES 或系统 Keychain）
- 输入验证与 SQL 注入防护
- 文件路径合法性校验

### 错误处理
- 统一 `AppError` 枚举（Database / IO / Serialization / NotFound / Validation）
- 前端友好的错误提示

### 主要 Rust 依赖
```toml
tauri = { version = "2" }
serde / serde_json = "1"
rusqlite = { version = "0.32", features = ["bundled"] }
tokio = { version = "1", features = ["full"] }
chrono = "0.4"
uuid = { version = "1", features = ["v4", "serde"] }
anyhow / thiserror = "1"
dirs = "5"
tracing / tracing-subscriber
```

---

## 成功标准
- 用户可在 UI 中完成 OPC / Agent / Model / Channel 的完整 CRUD 操作
- 一键部署能生成合法的 OpenClaw 配置并成功触发运行
- 应用冷启动时间 < 2 秒
- 支持 macOS (Intel + Apple Silicon)、Windows x64、Linux x64 三平台安装包
- API Key 等敏感信息不以明文写入磁盘
- 数据库迁移机制保证跨版本升级数据不丢失

---

## 优先级与阶段规划

### Phase 1 — 基础设施（MVP 骨架）
- Tauri 项目初始化、热重载开发环境
- SQLite 连接池与数据库迁移机制
- 数据模型定义（serde 序列化）
- 应用配置加载 / 保存

### Phase 2 — 核心业务逻辑
- OPC / Agent / Model / Channel / Binding CRUD 服务
- 所有 Tauri 命令接口（`#[tauri::command]`）
- Tool / Skill 同步命令

### Phase 3 — 前端集成
- 现有 HTML UI 适配 Tauri
- 各页面功能实现（数据概览、子公司管理、智能体管理、模型管理、飞书绑定、部署、日志）
- 交互优化（拖拽排序、确认弹窗、加载状态）

### Phase 4 — OpenClaw 集成
- 配置文件生成器（JSON / SOUL / models / channels / bindings）
- OPC 目录结构管理
- OpenClaw 进程管理与日志解析
- 统计数据计算

### Phase 5 — 测试与优化
- 单元测试（数据库、业务逻辑、命令接口、模型转换）
- 集成测试（端到端、边界条件、错误处理）
- 性能优化（查询索引、前端渲染、启动时间）
- 安全加固

### Phase 6 — 打包发布
- 多平台构建（macOS / Windows / Linux）
- 应用签名与自动更新配置
- GitHub Release + 安装包上传

---

## 时间规划

| 阶段 | 周次 | 交付物 |
|------|------|--------|
| Phase 1 | Week 1–2 | 可运行的 Tauri 骨架 + 数据库层 |
| Phase 2 | Week 3–5 | 全部 CRUD 服务 + Tauri 命令接口 |
| Phase 3 | Week 6–7 | 完整 UI 与交互功能 |
| Phase 4 | Week 8 | OpenClaw 配置生成与进程集成 |
| Phase 5 | Week 9 | 稳定、安全、高性能版本 |
| Phase 6 | Week 10 | 可安装的多平台应用 |

**目标 MVP**：10 周内完成 v1.0 发布

---

## 后续规划（v1.0 之后）
- 模板市场与云同步（Pro 功能）
- 插件系统
- 高级路由配置
- 自动化部署流水线
- 团队协作功能
