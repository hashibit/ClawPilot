# ClawPilot — 任务计划

## 状态说明
`cc:TODO` 待开始 | `cc:WIP` 进行中 | `cc:DONE` 已完成 | `cc:blocked` 阻塞中

---

## 阶段 0：项目初始化

- [ ] `cc:TODO` 确认 Rust 工具链 & Node.js 已安装
- [ ] `cc:TODO` 初始化 Tauri 项目（`npm create tauri-app`）
- [ ] `cc:TODO` 创建 `src-tauri/src/` 目录结构
- [ ] `cc:TODO` 将 `ui/` HTML/CSS/JS 复制到 `src/`
- [ ] `cc:TODO` 配置 `Cargo.toml` 依赖项 & `tauri.conf.json`
- [ ] `cc:TODO` 验证热重载开发模式

**交付物**：可运行的 Tauri 应用骨架

---

## 阶段 1：基础设施层

- [ ] `cc:TODO` `database/pool.rs` — SQLite 连接池
- [ ] `cc:TODO` `database/schema.rs` — 全表结构（参考 database-design.md）
- [ ] `cc:TODO` `database/migrations.rs` — 数据库迁移机制
- [ ] `cc:TODO` `models/` — 根据 proto 定义 Rust 结构体 + serde
- [ ] `cc:TODO` `utils/crypto.rs` — API Key 加密/解密
- [ ] `cc:TODO` `utils/path.rs` — 配置文件路径管理

**交付物**：完整的数据库与模型层

---

## 阶段 2：核心业务层

- [ ] `cc:TODO` `services/opc_service.rs` — OPC CRUD + 统计 + 切换 + 导入导出
- [ ] `cc:TODO` `services/agent_service.rs` — Agent CRUD + 文档管理 + 排序
- [ ] `cc:TODO` `services/model_service.rs` — Provider CRUD + 可用性测试
- [ ] `cc:TODO` `services/channel_service.rs` — 渠道 CRUD + 飞书配置 + 连接检测
- [ ] `cc:TODO` `services/binding_service.rs` — 绑定规则 CRUD
- [ ] `cc:TODO` `services/snapshot_service.rs` — 快照创建/恢复/删除
- [ ] `cc:TODO` `services/deployment_service.rs` — 部署任务管理
- [ ] `cc:TODO` `services/log_service.rs` — 日志读取与流式输出

**交付物**：全部 CRUD 业务逻辑

---

## 阶段 3：Tauri 命令层

- [ ] `cc:TODO` `commands/opc.rs` — get_all_opcs / create / update / delete / set_current / get_stats
- [ ] `cc:TODO` `commands/agent.rs` — CRUD + reorder + get/update_document
- [ ] `cc:TODO` `commands/model.rs` — get_providers / update_provider / get_models / test_provider
- [ ] `cc:TODO` `commands/channel.rs` — CRUD + test_feishu_connection
- [ ] `cc:TODO` `commands/binding.rs` — CRUD + get_feishu_channels
- [ ] `cc:TODO` `commands/tool.rs` & `skill.rs` — get + sync_from_clawhub
- [ ] `cc:TODO` `commands/snapshot.rs` — create / get / restore / delete
- [ ] `cc:TODO` `commands/deployment.rs` — start / get_status / cancel
- [ ] `cc:TODO` `commands/log.rs` — get_logs / stream_logs

**交付物**：全部 Tauri 命令接口

---

## 阶段 4：前端集成

- [ ] `cc:TODO` Tauri invoke 封装 + 页面导航逻辑
- [ ] `cc:TODO` 数据概览页（OPC 统计、最近活动）
- [ ] `cc:TODO` OPC 管理页（CRUD + 切换 + 导出）
- [ ] `cc:TODO` Agent 管理页（CRUD + 文档编辑 + 工具/技能配置）
- [ ] `cc:TODO` 模型管理页（Provider 配置 + 可用性测试）
- [ ] `cc:TODO` 飞书频道绑定页
- [ ] `cc:TODO` 一键部署页（进度 + 日志）
- [ ] `cc:TODO` 运行日志页（筛选 + 实时查看）
- [ ] `cc:TODO` 拖拽排序 + 表单验证 + 错误提示

**交付物**：完整 UI 与交互功能

---

## 阶段 5：OpenClaw 集成

- [ ] `cc:TODO` `openclaw/config.rs` — OPC/Agent/Models/Channels/Bindings → JSON 生成
- [ ] `cc:TODO` `openclaw/process.rs` — 进程检测/启动/停止 + 配置重载通知
- [ ] `cc:TODO` `openclaw/stats.rs` — 日志解析 + 消息统计 + 增长趋势

**交付物**：可生成 OpenClaw 兼容配置并与其交互

---

## 阶段 6：测试与优化

- [ ] `cc:TODO` 单元测试（DB、业务逻辑、命令、模型转换）
- [ ] `cc:TODO` 集成测试（E2E、错误处理、数据一致性）
- [ ] `cc:TODO` 性能优化（DB 查询、渲染、启动时间）
- [ ] `cc:TODO` 安全加固（加密存储、输入验证、SQL 注入防护）

**交付物**：稳定、安全、高性能的应用

---

## 阶段 7：打包发布

- [ ] `cc:TODO` 应用图标 + 元数据 + 签名证书配置
- [ ] `cc:TODO` 多平台构建（macOS Intel/Apple Silicon、Windows x64、Linux AppImage）
- [ ] `cc:TODO` CHANGELOG + GitHub Release 发布

**交付物**：可安装的桌面应用
