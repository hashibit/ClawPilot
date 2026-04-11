# OPC 打包部署流程审计报告

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

### 🔴 P0 严重：bindings.json5 的 `match.channel` 字段错误

**文件**：`server/routes/deployment.js:556-568`

**现象**：

```js
const bindingsSection = data.bindings
  .filter(b => b.is_enabled === 1)
  .map(b => ({
    agentId: b.agent_name,
    match: {
      channel: b.channel_type.toLowerCase(), // ← 生成 'group' 或 'dm'
      peer: {
        kind: b.channel_type === 'GROUP' ? 'group' : 'direct',
        id: b.channel_id,
      },
    },
  }))
```

**根因**：`bindings` 表的 `channel_type` 字段存的是 `'GROUP'` 或 `'DM'`（peer 类型，见 `proto/server-service.proto:497`），但 OpenClaw 的 `match.channel` 需要的是平台标识（`'feishu'`、`'dingtalk'` 等）。

实际生成的 bindings.json5：

```json
{ "agentId": "xxx", "match": { "channel": "group", "peer": { "kind": "group", "id": "oc_xxx" } } }
```

正确格式应为：

```json
{ "agentId": "xxx", "match": { "channel": "feishu", "peer": { "kind": "group", "id": "oc_xxx" } } }
```

**影响**：OpenClaw 无法匹配任何 binding，所有 agent 收不到飞书消息。

**附加问题**：`bindings` 表没有存储渠道平台字段（feishu/dingtalk），也没有外键关联 `channels` 表。目前只支持飞书，`match.channel` 应固定为 `'feishu'`；peer.kind 从 `channel_type` 转换（`GROUP→group`，`DM→direct`）。

**修复方式**：

```js
// 修复前
channel: b.channel_type.toLowerCase(),

// 修复后（当前仅支持飞书）
channel: 'feishu',
peer: {
  kind: b.channel_type === 'GROUP' ? 'group' : 'direct',
  id: b.channel_id,
},
```

长期方案：bindings 表增加 `channel_platform TEXT NOT NULL DEFAULT 'FEISHU'` 字段。

---

### 🟡 P1 中等：daemon 允许跳过 checksum 验证

**文件**：`daemon/src/deploy.rs:769-786`

```rust
if let Some(ref cs) = checksum {
    if !cs.is_empty() {  // ← 空字符串也会跳过验证
        if !verify_checksum(&package_bytes, cs) { ... }
    }
}
```

checksum 是 `Option<String>`，未传或为空字符串时均跳过验证。结合下方「包内 manifest.json checksum 为空」的问题，如果 API key 泄露，可发送任意包绕过完整性校验。

**修复方式**：checksum 改为必填，为 None 或空时直接拒绝请求（在 routes.rs 的参数解析层做）。

---

### 🟡 P2 中等：包内 manifest.json 的 checksum 永远是空字符串

**文件**：`server/routes/deployment.js:831-839`

```js
const manifest = { opc_id, version, checksum: '', opc_root: data.opc_root }
const pkgBuf = await buildPackageWithOpenclaw(data, manifest, openclawConfig)
// manifest.json 已打入包，checksum 此时为 ''
const checksum = 'sha256:' + createHash('sha256').update(pkgBuf).digest('hex')
manifest.checksum = checksum  // 太晚了，包已构建完
```

tar 包内的 `manifest.json` 的 `checksum` 字段永远是空字符串（先有鸡还是先有蛋的问题）。

**当前影响**：checksum 通过 multipart form 的 manifest 字段传递给 daemon，daemon 实际校验是正确的，**不影响当前安全性**。但包失去自描述能力，将来独立分发或离线校验时无法验证。

**修复方式**：接受此设计限制，在 manifest.json 中将该字段命名为 `package_checksum` 并注释说明（需计算包后再填写，tar 包内此字段为空）；或在打包完成后另外生成一个 `.sha256` 伴随文件。

---

### 🟡 P2 中等：skills 全量复制，忽略 enabled_skills

**文件**：`server/routes/deployment.js:696-701`

```js
// enabled_skills 已解析：enabled_skills: safeJsonArray(a.enabled_skills)
// 但打包时完全未使用：
for (const skill of data.skills) {  // ← 所有 skills，无过滤
  for (const relFile of skill.files) {
    await addFile(`${opcId}/${workspaceName}/skills/${skill.slug}/${relFile}`, content)
  }
}
```

每个 agent workspace 会收到 `bundle/skills/` 下的全部技能，不管该 agent 是否启用。

**影响**：包体积虚大；agent 可能加载其不应使用的技能。

**修复方式**：

```js
const agentSkills = data.skills.filter(s => agent.enabled_skills.includes(s.slug))
for (const skill of agentSkills) { ... }
```

---

### 🟡 P3 低：agents.json5 的 workspace 路径含 `~` 未展开

**文件**：`server/routes/deployment.js:478`

```js
workspace: `${opcRoot}/${opc.id}/workspace-${agent.display_name}`,
// 生成：~/.openclaw/OPC/my-opc/workspace-Alice
```

`opc_root` 默认值为 `~/.openclaw/OPC`，`~` 直接写入 agents.json5。daemon 的 `merge_into_openclaw_config` 只更新 openclaw.json 的 `$include` 路径，不处理 agents.json5 内部的 workspace 路径，依赖 OpenClaw 自身支持 tilde 展开。

**影响**：若 OpenClaw 不展开 tilde，agent 找不到 workspace 目录，无法读取 SOUL.md 等文档。

**修复方式**：daemon 在 `extract_package` 后，对 agents.json5 做后处理，用 `expand_tilde()` 展开 workspace 路径；或 server 端在生成时先展开（需要知道 daemon 的 home 目录）。

---

### 🟡 P3 低：SIGHUP 后只检查进程存活，不验证配置加载

**文件**：`daemon/src/deploy.rs:947-961`

```rust
match sighup_openclaw() { ... }
tokio::time::sleep(std::time::Duration::from_secs(2)).await;
let running = is_openclaw_running();  // 只检查 PID 文件对应进程是否存活
```

发送 SIGHUP 后等 2 秒，仅通过 PID kill(0) 确认进程存活，无法判断 OpenClaw 是否成功加载了新配置（进程可能用旧配置继续运行）。

**修复方式**：利用已有的 `openclaw_gateway_status()` 检查 `rpc.ok` 字段，若为 false 则记录告警；或等待更长时间后通过 RPC 探活。

---

### 🟢 P4 低：遗留 `buildPackage` 函数（死代码）

**文件**：`server/routes/deployment.js:244-290`

存在未使用的旧函数 `buildPackage`，使用 `agents/{agent_id}/*.md` 和 `skills/{slug}/` 的旧路径结构，注释标注为 "legacy"。主流程使用的是 `buildPackageWithOpenclaw`，该函数从未被调用。

**修复方式**：直接删除 244-290 行。

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
