# OPC 打包部署流程审计报告

> 📜 **历史档案**：审计 Node.js Server 时代代码，Server 已下线，下文 `server/routes/deployment.js` 的等价实现现在位于 `src-tauri/src/services/deployment/`。保留作为审计决策与 Bug 修复追溯。
>
> 审计日期：2026-04-11
> 审计范围：`server/routes/deployment.js`、`daemon/src/deploy.rs`、`proto/server-service.proto`、`proto/clawpilot.proto`

---

## 总体评价

架构设计合理，安全机制（checksum、路径穿越防护、API Key 认证）整体到位。但存在 **1 个会导致 agent 完全无法收到消息的严重 Bug**，以及若干协议不一致和设计问题。

---

## 完整部署流程

```
ClawPilot Server                          Daemon (本地/远程)
     │                                          │
     │  1. regenerateAgentDocuments()           │
     │     - 重建 AGENTS.md（全团队花名册）       │
     │     - 注入/移除 SOUL.md 领队段落          │
     │                                          │
     │  2. collectOpcData()                     │
     │     - 从 DB 读取 agents/channels/        │
     │       bindings/model_providers/skills    │
     │                                          │
     │  3. generateOpenclawConfig()             │
     │     - 生成 agents.json5 / models.json5   │
     │     - 生成 channels.json5 / bindings.json5│
     │                                          │
     │  4. buildPackageWithOpenclaw()           │
     │     - tar.gz 结构：                      │
     │       manifest.json                     │
     │       {opc_id}/workspace-{name}/*.md    │
     │       {opc_id}/workspace-{name}/memory/ │
     │       {opc_id}/workspace-{name}/skills/ │
     │       {opc_id}/agents.json5             │
     │       {opc_id}/models.json5             │
     │       {opc_id}/channels.json5           │
     │       {opc_id}/bindings.json5           │
     │                                          │
     │  5. sha256 checksum                      │
     │                                          │
     │─── POST /deploy (multipart) ────────────>│
     │    manifest: { opc_id, checksum, ... }   │
     │    package: <tar.gz bytes>               │
     │                                          │
     │                                          │  1. 验证 API Key
     │                                          │  2. 验证 checksum
     │                                          │  3. prepare_opc_directory()
     │                                          │     git commit 保存用户数据
     │                                          │  4. backup_opc()（保留最近 5 份）
     │                                          │  5. extract_package()
     │                                          │     safe_join_canonical 防路径穿越
     │                                          │  6. merge_into_openclaw_config()
     │                                          │     更新 ~/.openclaw/openclaw.json
     │                                          │     的 $include 引用
     │                                          │  7. reset_agents_sessions()
     │                                          │     重命名 agents/ 目录
     │                                          │  8. SIGHUP → OpenClaw 热重载
     │                                          │  9. 进程存活健康检查
     │                                          │
     │<─── { task_id } ────────────────────────│
     │                                          │
     │─── GET /deploy/{task_id} (轮询) ────────>│
     │    (每 2 秒，最长 120 秒)                 │
```

**OpenClaw 加载配置路径：**

```
~/.openclaw/openclaw.json
  ├── agents   → $include ./OPC/{opc_id}/agents.json5
  ├── models   → $include ./OPC/{opc_id}/models.json5
  ├── channels → $include ./OPC/{opc_id}/channels.json5
  └── bindings → $include ./OPC/{opc_id}/bindings.json5

~/.openclaw/OPC/{opc_id}/
  ├── workspace-{display_name}/
  │   ├── SOUL.md / IDENTITY.md / AGENTS.md / USER.md / MEMORY.md
  │   ├── memory/{YYYY-MM-DD}.md
  │   └── skills/{slug}/*
  ├── agents.json5
  ├── models.json5
  ├── channels.json5
  └── bindings.json5
```

---

## 问题清单

### ~~🔴 P0 严重：bindings.json5 的 `match.channel` 字段错误~~ ✅ 已修复

**文件**：`server/routes/deployment.js:556-568`

**修复**：`match.channel` 固定为 `'feishu'`（当前仅支持飞书），`peer.kind` 从 `channel_type` 转换（`GROUP→group`，`DM→direct`）。

---

### ~~🟡 P1 中等：daemon 允许跳过 checksum 验证~~ ✅ 已修复

**文件**：`daemon/src/routes.rs:134-139`、`daemon/src/deploy.rs:768-787`

**修复**：routes.rs 层要求 checksum 必须提供且非空，否则直接拒绝请求。deploy.rs 层简化为无条件执行验证。

---

### ~~🟡 P2 中等：包内 manifest.json 的 checksum 永远是空字符串~~ ✅ 已修复（添加注释说明）

**修复**：在 manifest 创建处添加注释，说明这是先有鸡还是先有蛋的设计限制，checksum 通过 multipart form 正确传递给 daemon。

---

### ~~🟡 P2 中等：skills 全量复制，忽略 enabled_skills~~ ✅ 已修复

**文件**：`server/routes/deployment.js:696-701`

**修复**：按 agent 的 `enabled_skills` 过滤，每个 agent workspace 只复制其启用的技能。

---

### ~~🟡 P3 低：agents.json5 的 workspace 路径含 `~` 未展开~~ ✅ 已修复

**文件**：`daemon/src/deploy.rs`（新增 `fix_workspace_tilde_in_agents_json5` 函数）

**修复**：daemon 在合并配置后，对 agents.json5 做后处理，展开 `list[].workspace` 和 `defaults.workspace` 中的 tilde。

---

### ~~🟡 P3 低：SIGHUP 后只检查进程存活，不验证配置加载~~ ✅ 已修复

**文件**：`daemon/src/deploy.rs:1017-1031`

**修复**：健康检查增加 `openclaw_gateway_status()` RPC 探活，检查 `rpc.ok` 字段确认新配置已加载。

---

### ~~🟢 P4 低：遗留 `buildPackage` 函数（死代码）~~ ✅ 已修复

**修复**：删除未使用的旧 `buildPackage` 函数（244-290 行）。

---

## 验证正常的部分

| 环节 | 结论 | 说明 |
|------|------|------|
| tar.gz 完整性校验 | ✅ 正常 | SHA256 通过 multipart manifest 字段传递并验证 |
| 路径穿越防护 | ✅ 正常 | `safe_join_canonical` 词法 + symlink 双重检查 |
| 备份与回滚 | ✅ 正常 | 解压失败自动回滚，保留最近 5 份备份 |
| openclaw.json $include 合并 | ✅ 正常 | 保留其他配置字段，仅更新 4 个 $include 引用 |
| SOUL.md 领队段落注入 | ✅ 正常 | `CLAWPILOT:LEADER_START/END` 标记保护用户内容 |
| agent sessions 重置 | ✅ 正常 | 重命名 agents/ 目录，强制 OpenClaw 重新加载 |
| 401 自动刷新 daemon key | ✅ 正常 | 本地读 `~/.clawpilot/daemon.key`，远程走 SSH |
| SIGHUP 热重载 | ✅ 正常 | 通过 PID 文件发送，OpenClaw 无需重启 |
| 包体积限制 | ✅ 正常 | daemon 限制 50MB，超出拒绝 |
| opc_id 格式校验 | ✅ 正常 | 仅允许字母数字及 `-_`，最长 64 字符 |

---

## 修复优先级汇总

| 优先级 | 问题 | 影响 |
|--------|------|------|
| P0 | bindings `match.channel` 字段用了 peer 类型而非平台名 | agent 完全收不到消息 |
| P1 | daemon 允许跳过 checksum 验证 | 安全风险 |
| P2 | skills 不按 enabled_skills 过滤 | 包体积虚大，权限泄漏 |
| P2 | 包内 manifest.json checksum 为空 | 自描述能力缺失 |
| P3 | workspace 路径含 `~` 未展开 | 依赖 OpenClaw 行为 |
| P3 | SIGHUP 后缺乏配置加载验证 | 静默失败风险 |
| P4 | 遗留 `buildPackage` 函数 | 代码混淆 |
