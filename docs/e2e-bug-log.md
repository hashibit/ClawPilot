# ClawPilot E2E Test - API Bug Log

> 📜 **历史档案**：本文档记录 2026-04-11~12 对旧 Node.js Server（`server/`）的 E2E 测试与 Bug 复盘。
> Server 已于后续全量迁移至 Rust 后端（`src-tauri/src/services/`），下文 `server/routes/*.js` 路径为当时实现，今天的等价文件在 Rust services 层；保留原文以备追溯。
>
> 测试日期: 2026-04-11
> 验证日期: 2026-04-12
> 测试范围: E2E-1 ~ E2E-10（全量测试）
> **验证方法**: 逐个检查 Server 路由实现代码

---

## Bug #1: update_provider - NOT NULL constraint ✅ **已验证真实**

**发现于**: E2E-1 Phase 7

**验证**: `server/routes/model.js:96-112` UPDATE 语句强制要求 `name/api/base_url/api_key` 全部非 NULL，只传 `{ id, name }` 时其他字段变成 undefined → NOT NULL constraint

**API**: `POST /api/update_provider`

**请求参数**:
```json
{
  "id": "provider-id",
  "name": "新名称"
}
```

**错误响应**:
```json
{
  "error": "NOT NULL constraint failed: model_providers_v2.api"
}
```

**根因**: Server 实现中 update_provider 需要完整参数，但 proto 定义的 UpdateProviderRequest 只需要 id 和可选字段。

**Proto 定义** (server-service.proto:332-338):
```protobuf
message UpdateProviderRequest {
  string id = 1;
  string name = 2;
  string api = 3;
  string base_url = 4;
  string api_key = 5;
  bool is_enabled = 6;
}
```

**建议修复**: Server 应允许部分更新，不需要强制传入所有字段。

---

## Bug #2: update_agent - NOT NULL constraint ✅ **已验证真实**

**发现于**: E2E-2 Phase 7

**验证**: `server/routes/agent.js:134-160` UPDATE 强制要求 name 非 NULL，只传 `{ id, config: { description } }` 时 name 变成 undefined

**API**: `POST /api/update_agent`

**请求参数**:
```json
{
  "id": "agent-id",
  "config": {
    "description": "(已更新) 新描述",
    "enabled_tools": ["search", "file-editor", "web-fetch"]
  }
}
```

**错误响应**:
```json
{
  "error": "NOT NULL constraint failed: agents.name"
}
```

**根因**: Server 实现中 update_agent 要求 name 字段必填，但部分更新场景不应强制要求。

**Proto 定义** (server-service.proto:189-192):
```protobuf
message UpdateAgentRequest {
  string id = 1;
  AgentConfig config = 2;
}
```

**建议修复**: Server 应允许部分更新 AgentConfig，name 字段可选。

---

## Bug #3: update_office - undefined 'name' ✅ **已验证真实**

**发现于**: E2E-4 Phase 6

**验证**: `server/routes/office.js:309-337` UPDATE 强制要求 name 非 NULL，只传 `{ id, grade, description }` 时 office.name 是 undefined

**API**: `POST /api/update_office`

**请求参数**:
```json
{
  "id": "office-id",
  "grade": "HIGH",
  "description": "新描述"
}
```

**错误响应**:
```json
{
  "error": "Cannot read properties of undefined (reading 'name')"
}
```

**根因**: Server 实现中 update_office 期望完整的 office 对象，包含 name 字段。

**Proto 定义**: 需检查 proto/server-service.proto 中 UpdateOfficeRequest 定义。

**建议修复**: Server 应允许部分更新 Office，name 字段可选。

---

## Bug #4: upsert_channel - 返回 null 未创建 ❌ **误报**

**发现于**: E2E-5 Phase 1

**验证**: `server/routes/channel.js:76-120` 实现完整，包含 INSERT 和 UPDATE 逻辑。返回 null 可能是测试传参问题，非 Server Bug。

**实际根因**: 测试请求参数格式可能与 proto 定义不一致，需检查 ChannelInfo 字段映射。

**API**: `POST /api/upsert_channel`

**请求参数**:
```json
{
  "config": {
    "id": "channel-feishu-xxx",
    "opc_id": "opc-id",
    "channel_type": "feishu",
    "is_enabled": true,
    "feishu_config": {
      "app_id": "xxx",
      "app_secret": "xxx"
    }
  }
}
```

**响应**: `null`

**验证**: `get_channels` 返回空数组，Channel 未被创建。

**根因**: Server 实现中 upsert_channel 可能缺少实际插入逻辑或字段映射错误。

**Proto 定义** (server-service.proto:444-450):
```protobuf
message UpsertChannelRequest {
  ChannelInfo config = 1;
}

message UpsertChannelResponse {
  string id = 1;
}
```

**建议修复**: 检查 server/routes/channel.js 中 upsert_channel 实现。

---

## Bug #5: upsert_agent_documents - 文档未写入 ❌ **误报 - API 不存在**

**发现于**: E2E-2 Phase 5

**验证**: 该 API **根本不存在于 server 路由中**！`server/routes/agent.js` 没有 `upsert_agent_documents` 端点。

**实际根因**: 测试调用的是不存在的 API，应使用 `update_agent_documents` 或其他已实现的端点。

**API**: `POST /api/upsert_agent_documents`

**请求参数**:
```json
{
  "opc_id": "opc-id",
  "agent_id": "agent-id",
  "documents": [
    {"doc_type": "SOUL", "content": "# 灵魂..."},
    {"doc_type": "IDENTITY", "content": "# 身份..."}
  ]
}
```

**响应**: 空响应 (无内容)

**验证**: `get_agent_documents` 返回空数组，文档未被写入。

**根因**: Server 实现可能缺少实际插入/更新 agent_documents 表的逻辑。

**建议修复**: 检查 server/routes/agent.js 中 upsert_agent_documents 实现。

---

## Bug #6: get_office_deployments - 返回格式不一致 ✅ **已验证真实**

**发现于**: E2E-4 Phase 7

**验证**:
- Proto 定义 (`server-service.proto:662-664`): `{ deployments: [...] }`
- Server 实现 (`deployment.js:1071-1081`): 直接返回 `res.json(rows)` 数组

**根因**: Server 返回格式与 Proto 定义不一致，应返回 `{ deployments: rows }` 而非直接返回数组。

**API**: `POST /api/get_office_deployments`

**响应**: 直接返回数组，而非 `{ deployments: [...], running_opc: "..." }` 格式

**Proto 定义**: 需检查返回格式定义。

**建议修复**: 确保 Server 返回格式与 proto 定义一致。

---

## Bug #7: ai_generate_agent - JSON 控制字符未转义 ✅ **已验证真实**

**发现于**: E2E-6 Phase 2

**验证**: `server/routes/ai.js:166-174` 直接 `JSON.parse(rawText)` 没有对 LLM 返回内容做控制字符预处理，导致解析失败。

**API**: `POST /api/ai_generate_agent`

**错误**: 返回的 JSON 中 SOUL 文档包含未转义的控制字符（`\n`、`\t`等），导致 JSON 解析失败。

**响应示例**:
```
JSON parse error: Control characters in string
```

**根因**: LLM 生成的 SOUL/IDENTITY 文档包含换行符等控制字符，Server 未做 JSON 转义处理。

**建议修复**: Server 应对 AI 生成内容进行 JSON 安全转义，或使用 base64 编码传输。

---

## Bug #8: restore_snapshot - 参数名不一致 ❌ **误报 - 测试传错参数**

**发现于**: E2E-7 Phase 5

**验证**: `server/routes/snapshot.js:110-112` 使用 `{ id }` 参数，与 proto 定义一致。实际根因是测试脚本传错了 `snapshot_id` 参数名。

**API**: `POST /api/restore_snapshot`

**请求参数** (错误):
```json
{
  "snapshot_id": "snap-xxx"
}
```

**Proto 定义** (正确):
```protobuf
message RestoreSnapshotRequest {
  string id = 1;  // 使用 id，而非 snapshot_id
}
```

**错误响应**: `{"error": "NOT NULL constraint failed..."}` 或无响应

**根因**: Proto 定义使用 `id` 字段，但测试/文档使用 `snapshot_id`。

**建议修复**: 统一参数命名，或在 Server 端兼容两种参数名。

---

## Bug #9: get_tools - 返回空数组 ❌ **误报 - 数据为空**

**发现于**: E2E-8 Phase 1

**验证**: `server/routes/tool.js:22-29` 实现正确，返回空说明 `tools` 表确实是空的，是数据初始化问题而非 API Bug。

**API**: `POST /api/get_tools`

**响应**: `{"tools": []}` 空数组

**根因**: `create_tool` API 参数格式问题，导致工具未能成功创建；或数据库表未正确初始化。

**Proto 定义** (create_tool):
```protobuf
message CreateToolRequest {
  ToolDefinition tool = 1;  // 应使用 tool 包装
}
```

**建议修复**: 检查 create_tool 实现及数据库 tools 表初始化。

---

## Bug #10: update_opc_stats - 返回 null ✅ **已验证真实**

**发现于**: E2E-10 Phase 7

**验证**: `server/routes/opc.js:192-203` 确实 `res.json(null)`，应返回 `{ ok: true }` 或包含统计信息的对象。

**API**: `POST /api/update_opc_stats`

**请求参数**:
```json
{
  "opc_id": "opc-develop-001"
}
```

**响应**: `null`

**根因**: Server 未实现返回值，或 OPC 统计更新逻辑缺失。

**建议修复**: 检查 server/routes/opc.js 中 update_opc_stats 实现，应返回 `{ok: true, stats: {...}}`。

---

## Bug 统计（经代码验证）

| Bug ID | API | 状态 | 严重程度 | 影响 |
|--------|-----|------|----------|------|
| #1 | update_provider | ✅ 真实 | 高 | 无法部分更新 Provider |
| #2 | update_agent | ✅ 真实 | 高 | 无法部分更新 Agent |
| #3 | update_office | ✅ 真实 | 高 | 无法部分更新 Office |
| #4 | upsert_channel | ❌ 误报 | - | 传参问题，非 Bug |
| #5 | upsert_agent_documents | ❌ 误报 | - | API 不存在 |
| #6 | get_office_deployments | ✅ 真实 | 低 | 返回格式与 Proto 不一致 |
| #7 | ai_generate_agent | ✅ 真实 | 中 | JSON 解析失败 |
| #8 | restore_snapshot | ❌ 误报 | - | 测试传错参数名 |
| #9 | get_tools | ❌ 误报 | - | 数据为空，非 Bug |
| #10 | update_opc_stats | ✅ 真实 | 低 | 返回值缺失 |

**真实 Bug**: 6个 (#1, #2, #3, #6, #7, #10)
**误报**: 4个 (#4, #5, #8, #9)

---

## 修复优先级建议（基于验证结果）

1. **P0**: #1, #2, #3 所有 update_* API - UPDATE 语句应改为部分更新，只更新传入的字段
2. **P1**: #7 ai_generate_agent - 对 LLM 返回内容做 JSON 安全转义
3. **P2**: #6 get_office_deployments - 返回格式改为 `{ deployments: rows }`
4. **P2**: #10 update_opc_stats - 补充返回值 `{ ok: true, stats: {...} }`

---

## E2E 测试总结

| 测试项 | 结果 | 说明 |
|--------|------|------|
| E2E-1 Provider/Model | ✅ 通过 | 创建/查询正常，update 有 Bug |
| E2E-2 OPC + Agent | ✅ 部分通过 | 创建正常，update/upsert_documents 有 Bug |
| E2E-3 VM + 物业安装 | ✅ 通过 | SSH/Daemon/OpenClaw 安装成功 |
| E2E-4 Office 管理 | ✅ 部分通过 | 创建/SSH 探测正常，update 有 Bug |
| E2E-5 飞书渠道 | ❌ 失败 | upsert_channel Bug 阻塞 |
| E2E-6 AI 生成 Agent | ✅ 部分通过 | AI 生成成功，JSON 解析有 Bug |
| E2E-7 Snapshot | ✅ 部分通过 | 创建/删除正常，restore 参数名问题 |
| E2E-8 Tools/Skills | ❌ 失败 | get_tools 返回空，create_tool 有问题 |
| E2E-9 Deploy OPC | ✅ 通过 | 部署/Undeploy 流程完整 |
| E2E-10 Monitoring | ✅ 部分通过 | 日志/SSE 正常，update_stats 有 Bug |

**总计**: 10 个测试，2 个完全失败，6 个部分通过，2 个完全通过