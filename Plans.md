# ClawPilot Plans.md

创建日：2026-03-16

---

## 阶段 0：项目初始化

| Task | 内容 | DoD | Depends | Status |
|------|------|-----|---------|--------|
| 0.1 | 确认 Rust 工具链 & Node.js 已安装 | `rustc --version` 与 `node --version` 均输出版本号 | - | cc:DONE |
| 0.2 | 初始化 Tauri 项目（`npm create tauri-app`） | `npm run tauri dev` 可启动空白窗口 | 0.1 | cc:DONE [80b5abf] |
| 0.3 | 创建 `src-tauri/src/` 目录结构（commands/models/database/services/openclaw/utils） | 目录树与 CLAUDE.md 定义一致，各 mod.rs 存在 | 0.2 | cc:DONE [80b5abf] |
| 0.4 | 将 `ui/` HTML/CSS/JS 复制到 `src/` | `src/` 下存在完整的 HTML/CSS/JS 文件 | 0.2 | cc:DONE [80b5abf] |
| 0.5 | 配置 `Cargo.toml` 依赖项 & `tauri.conf.json` | `cargo build` 无报错，所有依赖可解析 | 0.3 | cc:DONE [80b5abf] |
| 0.6 | 验证热重载开发模式 | 修改 `src/index.html` 后浏览器自动刷新 | 0.4, 0.5 | cc:DONE |

**交付物**：可运行的 Tauri 应用骨架

---

## 阶段 1：基础设施层

| Task | 内容 | DoD | Depends | Status |
|------|------|-----|---------|--------|
| 1.1 | `database/pool.rs` — SQLite 连接池 | 单元测试通过，可获取有效连接 | Phase 0 | cc:DONE |
| 1.2 | `database/schema.rs` — 全表结构（参考 database-design.md） | 所有建表 SQL 可执行，无错误 | 1.1 | cc:DONE [83fbc92] |
| 1.3 | `database/migrations.rs` — 数据库迁移机制 | 版本号递增迁移可执行，重复执行幂等 | 1.2 | cc:DONE [83fbc92] |
| 1.4 | `models/` — 根据 proto 定义 Rust 结构体 + serde | 序列化/反序列化单元测试全部通过 | 1.2 | cc:DONE [83fbc92] |
| 1.5 | `utils/crypto.rs` — API Key 加密/解密 | 加密后可解密还原原文，单元测试通过 | Phase 0 | cc:DONE |
| 1.6 | `utils/path.rs` — 配置文件路径管理 | 各平台返回正确的应用数据目录 | Phase 0 | cc:DONE |

**交付物**：完整的数据库与模型层

---

## 阶段 2：核心业务层

| Task | 内容 | DoD | Depends | Status |
|------|------|-----|---------|--------|
| 2.1 | `services/opc_service.rs` — OPC CRUD + 统计 + 切换 + 导入导出 | CRUD 及导入导出单元测试全部通过 | 1.3, 1.4 | cc:DONE [b4fa944] |
| 2.2 | `services/agent_service.rs` — Agent CRUD + 文档管理 + 排序 | CRUD + 文档读写 + 排序单元测试通过 | 1.3, 1.4 | cc:DONE [b4fa944] |
| 2.3 | `services/model_service.rs` — Provider CRUD + 可用性测试 | Provider CRUD 单元测试通过 | 1.3, 1.4 | cc:DONE [b4fa944] |
| 2.4 | `services/channel_service.rs` — 渠道 CRUD + 飞书配置 + 连接检测 | 渠道 CRUD 单元测试通过 | 1.3, 1.4 | cc:DONE [b4fa944] |
| 2.5 | `services/binding_service.rs` — 绑定规则 CRUD | 绑定 CRUD 单元测试通过 | 1.3, 1.4 | cc:DONE [b4fa944] |
| 2.6 | `services/snapshot_service.rs` — 快照创建/恢复/删除 | 快照三项操作单元测试通过 | 2.1 | cc:DONE [b4fa944] |
| 2.7 | `services/deployment_service.rs` — 部署任务管理 | 任务状态流转单元测试通过 | 2.1 | cc:DONE [b4fa944] |
| 2.8 | `services/log_service.rs` — 日志读取与流式输出 | 日志读取测试通过，流式接口可正常调用 | Phase 0 | cc:DONE [b4fa944] |

**交付物**：全部 CRUD 业务逻辑

---

## 阶段 3：Tauri 命令层

| Task | 内容 | DoD | Depends | Status |
|------|------|-----|---------|--------|
| 3.1 | `commands/opc.rs` — OPC 命令（get_all / create / update / delete / set_current / get_stats） | invoke 返回正确数据，错误序列化为 AppError | 2.1 | cc:DONE [71d7f61] |
| 3.2 | `commands/agent.rs` — Agent 命令（CRUD + reorder + get/update_document） | 所有命令 invoke 测试通过 | 2.2 | cc:DONE [71d7f61] |
| 3.3 | `commands/model.rs` — 模型命令（get_providers / update_provider / get_models / test_provider） | 命令 invoke 测试通过 | 2.3 | cc:DONE [71d7f61] |
| 3.4 | `commands/channel.rs` — 渠道命令（CRUD + test_feishu_connection） | 命令 invoke 测试通过 | 2.4 | cc:DONE [71d7f61] |
| 3.5 | `commands/binding.rs` — 绑定命令（CRUD + get_feishu_channels） | 命令 invoke 测试通过 | 2.5 | cc:DONE [71d7f61] |
| 3.6 | `commands/tool.rs` & `skill.rs` — 工具/技能命令（get + sync_from_clawhub） | 命令 invoke 测试通过 | Phase 2 | cc:DONE [71d7f61] |
| 3.7 | `commands/snapshot.rs` — 快照命令（create / get / restore / delete） | 命令 invoke 测试通过 | 2.6 | cc:DONE [71d7f61] |
| 3.8 | `commands/deployment.rs` — 部署命令（start / get_status / cancel） | 命令 invoke 测试通过 | 2.7 | cc:DONE [71d7f61] |
| 3.9 | `commands/log.rs` — 日志命令（get_logs / stream_logs） | 命令 invoke 测试通过 | 2.8 | cc:DONE [71d7f61] |

**交付物**：全部 Tauri 命令接口

---

## 阶段 4：前端集成

| Task | 内容 | DoD | Depends | Status |
|------|------|-----|---------|--------|
| 4.1 | Tauri invoke 封装 + 页面导航逻辑 | 所有页面可切换，invoke 封装调用无控制台报错 | Phase 3 | cc:DONE |
| 4.2 | 数据概览页（OPC 统计、最近活动） | 页面正确展示 OPC 统计数据和最近活动 | 4.1, 3.1 | cc:DONE |
| 4.3 | OPC 管理页（CRUD + 切换 + 导出） | OPC 创建/编辑/删除/切换/导出功能均可用 | 4.1, 3.1 | cc:DONE |
| 4.4 | Agent 管理页（CRUD + 文档编辑 + 工具/技能配置） | Agent 全功能均可用 | 4.1, 3.2 | cc:DONE |
| 4.5 | 模型管理页（Provider 配置 + 可用性测试） | Provider 配置保存并可测试连通性 | 4.1, 3.3 | cc:DONE |
| 4.6 | 飞书频道绑定页（绑定 CRUD + 频道获取） | 绑定功能可用，飞书频道列表可获取 | 4.1, 3.4, 3.5 | cc:DONE |
| 4.7 | 一键部署页（进度显示 + 日志查看） | 部署可启动，进度与日志实时更新 | 4.1, 3.8, 3.9 | cc:DONE |
| 4.8 | 运行日志页（筛选 + 实时查看） | 日志筛选生效，实时日志可更新 | 4.1, 3.9 | cc:DONE |
| 4.9 | 交互优化（拖拽排序 + 表单验证 + 错误提示） | 拖拽/验证/确认框/加载状态/错误提示均正常显示 | 4.2, 4.3, 4.4 | cc:DONE |

**交付物**：完整 UI 与交互功能

---

## 阶段 5：OpenClaw 集成

| Task | 内容 | DoD | Depends | Status |
|------|------|-----|---------|--------|
| 5.1 | `openclaw/config.rs` — OPC/Agent/Models/Channels/Bindings → JSON 生成 | 生成的 JSON 文件结构与 OpenClaw 规范一致 | Phase 4 | cc:DONE [11b427a] |
| 5.2 | `openclaw/process.rs` — 进程检测/启动/停止 + 配置重载通知 | 可正确检测并控制 OpenClaw 进程生命周期 | 5.1 | cc:DONE [11b427a] |
| 5.3 | `openclaw/stats.rs` — 日志解析 + 消息统计 + 增长趋势 | 统计数值与实际日志内容一致 | 5.2 | cc:DONE [11b427a] |

**交付物**：可生成 OpenClaw 兼容配置并与其交互

---

## 阶段 6：测试与优化

| Task | 内容 | DoD | Depends | Status |
|------|------|-----|---------|--------|
| 6.1 | 单元测试完善（DB、业务逻辑、命令、模型转换） | `cargo test` 全通过，覆盖率 ≥ 70% | Phase 5 | cc:DONE [0dec786] |
| 6.2 | 集成测试（E2E、错误处理、数据一致性） | E2E 测试全通过，边界条件无异常 | 6.1 | cc:DONE [0dec786] |
| 6.3 | 性能优化（DB 查询、渲染、启动时间） | 启动时间 < 2s，DB 查询 < 100ms | 6.1 | cc:DONE [0dec786] |
| 6.4 | 安全加固（加密存储、输入验证、SQL 注入防护） | 无 SQL 注入漏洞，API Key 加密存储可验证 | 6.1 | cc:DONE [0dec786] |

**交付物**：稳定、安全、高性能的应用

---

## 阶段 7：打包发布

| Task | 内容 | DoD | Depends | Status |
|------|------|-----|---------|--------|
| 7.1 | 应用图标 + 元数据 + 签名证书配置 | `tauri build` 生成带图标的安装包 | Phase 6 | cc:DONE [fddfb1c] |
| 7.2 | 多平台构建（macOS Intel/Apple Silicon、Windows x64、Linux AppImage） | 三平台安装包均可正常安装运行 | 7.1 | cc:DONE [fddfb1c] |
| 7.3 | CHANGELOG + GitHub Release 发布 | Release 页面存在安装包下载链接 | 7.2 | cc:DONE [fddfb1c] |

**交付物**：可安装的桌面应用
