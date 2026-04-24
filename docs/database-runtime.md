# 数据目录 `~/.clawpilot/`

所有运行时数据统一存放在用户主目录下的 `.clawpilot/` 文件夹：

```
~/.clawpilot/
├── clawpilot.db        # 主 SQLite 数据库（dev-server 和 Tauri App 共用同一个文件）
├── clawpilot.db-shm    # SQLite WAL 共享内存文件
├── clawpilot.db-wal    # SQLite WAL 日志文件
├── scheduler.db        # Daemon 调度器数据库
├── server.key          # 主后端加密密钥（API Server / Tauri）
├── daemon.key          # Daemon 加密密钥
├── artifacts/          # 部署产物（OPC 配置包等）
├── bin/                # 内置二进制（clawpilot-daemon 等）
└── logs/               # 运行时日志
```

## 数据库路径规则

- **API Server（Rust dev-server）**：通过 `utils/path.rs` 的 `app_data_dir()` 解析 `~/.clawpilot/`，数据库为 `~/.clawpilot/clawpilot.db`
- **Tauri App（Rust，内嵌 axum）**：同上，与 dev-server 走同一份 `utils/path.rs`，指向同一路径
- dev-server 与 Tauri App **共用同一个 SQLite 文件**，开发时不要同时启动两者写入相同库

## 主数据库表（clawpilot.db）

| 表名 | 说明 |
|------|------|
| `opc_config` | OPC 团队配置 |
| `agents` | Agent 配置 |
| `agent_documents` | Agent 文档（SOUL.md/AGENTS.md 等） |
| `channels` | 渠道配置（飞书等） |
| `bindings` | 渠道与 Agent 绑定规则 |
| `tools` | 工具定义 |
| `skills` | 技能定义 |
| `model_providers_v2` | 模型提供商 |
| `model_info_v2` | 模型列表 |
| `offices` | 办公室（部署目标主机） |
| `office_deployments` | 部署记录 |
| `local_snapshots` | OPC 本地快照 |
| `deployment_tasks` | 部署任务状态 |
| `log_entries` | 日志条目 |
| `settings` | 全局设置（opc_root 等） |
| `openclaw_config` | OpenClaw 当前激活配置 |
