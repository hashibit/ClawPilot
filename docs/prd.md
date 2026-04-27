# ClawPilot — 产品需求文档（PRD v2）

> 文档版本：2026-04-27
> 范围：当前 main + `refactor/refine-ui-with-modern-design` 分支已实现的全部能力
> 维护者：PM（自动梳理）

---

## 1. 产品定位

**ClawPilot** 是面向 **OpenClaw** 用户的本地桌面应用，提供从 _团队（OPC）配置 → 渠道绑定 → 部署到办公室（Office）→ 实时监控_ 的一站式可视化管理。

| 维度 | 说明 |
|------|------|
| 形态 | 跨平台桌面 App（Tauri 2 内嵌 axum HTTP）+ 独立 daemon（Rust，端口 16668） |
| 数据 | SQLite 单文件 `~/.clawpilot/clawpilot.db`；密钥加密存储于 `~/.clawpilot/server.key` |
| 用户 | OpenClaw 平台运维 / Agent 团队搭建者 / 演示与 PoC 工程师 |
| 价值 | 把 OpenClaw 配置 + 部署 + 渠道接入用 GUI 串起来，免手写 JSON / SOUL.md / 部署脚本 |

---

## 2. 顶层概念模型

```
集团 (Group / 当前 ClawPilot 实例)
 ├─ 公司 OPC (opc_config)        ← 一个 AI 团队的配置单元
 │   ├─ 智能体 Agent (agents)    ← Agent + 7 类文档 (SOUL/IDENTITY/...)
 │   ├─ 渠道 Channel (channels)  ← 飞书 App
 │   ├─ 绑定 Binding (bindings)  ← 飞书群 ↔ Agent 路由
 │   └─ 快照 Snapshot            ← OPC 全量配置版本快照
 ├─ 模型 Provider (model_providers_v2)
 │   └─ Model (model_info_v2)
 ├─ 办公室 Office (offices)       ← 部署目标主机（本机 / 远程 SSH）
 │   └─ 部署历史 OfficeDeployment
 ├─ 工具 Tool (tools)             ← 内置 + 自定义
 ├─ 技能 Skill (skills)           ← 本地 + ClawHub 远端
 └─ 设置 Settings + License
```

每个 OPC 部署后变成一个"运行实例"占用一个 Office；同一时刻一个 Office 只能跑一个 OPC。

---

## 3. 信息架构 / 路由

App 使用 **HashRouter**（`#/...`），分为 **全局空间** 与 **公司空间** 两套侧栏：

### 3.1 全局空间（默认）
| 路由 | 名称 | 主要能力 |
|------|------|----------|
| `#/overview` | 数据概览 | 集团级 KPI、消息趋势、各公司今日消息量 |
| `#/companies` | 公司列表 | OPC 卡片网格 + 创建子公司 |
| `#/opc` | OPC 详情（旧） | OPC CRUD + 快照管理（与 companies 重叠） |
| `#/providers` | 模型管理 | LLM Provider + 模型表 + 连通性测试 |
| `#/office` | 办公室管理 | Office CRUD、SSH、daemon/OpenClaw 安装与升级 |
| `#/logs` | 运行日志 | 实时日志流 + 级别 / 组件过滤 |
| `#/activities` | 实时活动 | 各 OPC Agent 的 lifecycle/assistant/tool/error 事件流 |
| `#/settings` | 设置 | 语言、部署目录、License、关于 |

### 3.2 公司空间（选中 OPC 后）
| 路由 | 名称 | 主要能力 |
|------|------|----------|
| `#/agents` | 智能体管理 | Agent CRUD + 7 类文档编辑 + AI 生成 + 工具/技能配置 + 测试对话 |
| `#/bindings` | 渠道端管理 | 飞书 App 配置 + 群组 ↔ Agent 绑定规则 |
| `#/deploy` | 一键部署 | 选 Office → 启动部署 → 实时进度 → 取消/卸载 |

侧栏底部固定显示 **本机 OpenClaw 状态**（运行 / 已停止 / daemon 未运行）+ 一键重启按钮。

---

## 4. 核心功能详述

### 4.1 OPC 管理
- **创建**：名称（slug）、显示名、描述、头像色（OpcPage 才有色板；CompanyListPage 仅基础字段）
- **删除**：硬删除，附二次确认
- **导入 / 导出**：JSON 格式，单 OPC 粒度
- **当前 OPC**：全局有"当前激活 OPC"，影响 `#/agents` `#/bindings` `#/deploy` 三个公司空间页面
- **统计**：`get_opc_stats` 返回 `messages_today / messages_yesterday / agent_count / channel_count`，给 OverviewPage 用

### 4.2 Agent 管理
- **基础字段**：display_name / name / job_title / description / personality
- **文档**：7 类 markdown — SOUL、IDENTITY、AGENTS、USER、MEMORY、HEARTBEAT、TOOLS
- **角色**：`set_default_agent` 标记"领队"（leader），部署时领队收到全队花名册
- **排序**：拖拽 reorder，持久化到 DB
- **AI 生成**：`ai_generate_agent(prompt)` 单个；`ai_generate_agents(prompts[])` 批量
- **测试对话**：右侧 ChatDrawer，可使用临时 SOUL.md 覆盖
- **工具 / 技能**：从全局 Tool / Skill 列表中开关；可自定义工具 ID

### 4.3 模型管理（Provider / Model）
- **Provider**：base_url、API 协议（OpenAI / Anthropic / etc）、API Key（加密存储）
- **自动建议**：输入 base_url → debounce 调 `suggest_provider`，命中已知 Provider 则自动填表
- **测试连通性**：`test_provider`，返回 `{ok, latency_ms, error}`
- **模型表**：可手工增删 + 改 model_id / display_name / context_window / input_types / vision
- **恢复默认**：重置为 `get_known_providers` 中的预置模型表

### 4.4 渠道与绑定
- 当前仅支持 **飞书**（App ID + App Secret）
- `test_feishu_connection` 验证凭证
- `get_feishu_channels` 拉群组列表，让用户选择要绑定的群
- 一条 Binding = `chat_id + channel_type(GROUP/DM) + agent_id + trigger_mode(MENTION/AT_ALL)`
- 启用 / 禁用开关

### 4.5 Office（部署目标主机）
- **基础**：name、receptionist 头像、地址（local / remote）、装修等级（HIGH/MEDIUM/LOW）、备注
- **远程**：SSH user + (password | key_path)，可点击"测试 SSH"
- **物业信息**：daemon 版本 + OpenClaw 版本 + 状态
- **安装**：
  - `install_decoration`（装修）= 安装 daemon + OpenClaw 全套
  - `install_daemon` = 单装 daemon
  - 安装日志通过 SSE (`/install_openclaw/:task_id/sse`) 实时回流
- **部署历史**：列出该 Office 的 OfficeDeployment 记录

### 4.6 部署
- 用户选 OPC + 空闲 Office，点"立即部署"
- 4 步：`prepare_config` → `write_dir` → `reload_process` → `health_check`
- 前端 2s 轮询 `get_deployment_status`
- 支持 cancel / undeploy / 重新部署

### 4.7 快照
- `create_snapshot(opc_id, label, is_auto)`：服务端自行装配 OPC 全量配置 (agents + channels + bindings + docs)
- `restore_snapshot(id)`：恢复整个 OPC
- 部署时自动打一份 auto 快照

### 4.8 日志 & 实时活动
- **日志**：固定拉最近 200 条，前端做级别过滤；3s 自动刷新
- **活动**：通过 daemon WebSocket `/ws/activities` 转 OpenClaw 网关事件（lifecycle/assistant/tool/error），按 Agent 聚合，最多保留 50 条/Agent

### 4.9 工具 & 技能
- **Tool**：name / display_name / description / category，可自定义 ID 写入 OPC
- **Skill**：本地（bundle 默认 + 用户安装）+ ClawHub 远端搜索
  - `search_skills(q, source='clawhub'|'lightmake')` 远端
  - `install_skill / uninstall_skill` 本地

### 4.10 设置
- 语言（17 种，含 RTL 语种）
- 部署目录（`opc_root`，daemon 部署到此路径）
- License 激活 / 注销（开发模式自动跳过）

### 4.11 License Gate
- 应用启动先 `get_license_status`；未激活则展示输入页
- `activate_license(license_key)` → 通过则进入主界面
- 开发模式（`import.meta.env.DEV`）跳过

---

## 5. 后端 API 总览

| 域 | Endpoint 数 | 关键备注 |
|----|------------|---------|
| OPC | 11 | 含 import/export/set_current |
| Agent | 11 | 含 batch_create / reorder / set_leader / 7 类文档 |
| Provider/Model | 8 | API Key 加密存储 |
| Channel | 5 | 仅飞书 |
| Binding | 6 | 启用/禁用切换 |
| Tool | 3 | 简单 CRUD |
| Skill | 9 | 本地 + 远端搜索 + 安装 |
| Snapshot | 5 | 服务端组装 payload |
| Office | 11 | 含 SSH 测试 + daemon 健康 |
| Install | 4 | daemon / decoration |
| Deployment | 8 | 含 build_deploy_package / undeploy |
| Log | 2 | 内存 SQLite |
| Process | 5 | 控制本机 OpenClaw |
| Settings/License | 4 | activate/deactivate/get/opc_root |
| AI | 3 | generate_agent(s) + chat_with_agent |

> 完整入口：`src-tauri/src/http/mod.rs`（2477 行，单文件路由表）。
> Daemon 端口 16668，9 个 REST + 1 个 WS（`/ws/activities`）。

---

## 6. 数据安全 & 错误模型
- 敏感数据：Provider API Key 已加密；**Office.access_password 当前为明文** ⚠️
- 错误：统一 `AppError` 枚举（Database / Io / Serialization / NotFound / Validation），通过 `IntoResponse` 输出
- CORS：daemon 与 server 都使用 `CorsLayer::permissive()`，仅监听 127.0.0.1

---

## 7. 已落地里程碑（实际进度）

- [x] Tauri 2 + 内嵌 axum + dev-server 双形态
- [x] 全部 CRUD 服务 + 95 条 HTTP 接口
- [x] React 前端 12 个页面 + i18n（17 种语言）+ HashRouter
- [x] OpenClaw / daemon 安装与升级（macOS launchd / Linux systemd）
- [x] OPC ↔ Office 部署，SSE 进度
- [x] 快照、回滚
- [x] 飞书渠道绑定
- [x] AI 单/批量生成 Agent
- [x] License Gate

## 8. 未完成 / 待规划
- 模板市场 / 云同步
- 插件系统（Tool/Skill SDK）
- 高级路由（除飞书外其他渠道）
- 团队协作（多设备配置同步）
- 自动更新通道
