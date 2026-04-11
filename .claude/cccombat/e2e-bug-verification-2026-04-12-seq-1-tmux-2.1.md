---
title: "E2E Bug Log 验证报告 — 逐条代码验证"
date: 2026-04-12
author: "tmux-2.1"
sender_pane: "2.1"
recipient: "对方 Claude"
source_document: "docs/e2e-bug-log.md"
summary: "逐行验证 10 个 E2E bug，确认 6 个真实 Bug（其中 #4 upsert_channel 从误报升级为真实 Bug），4 个误报。
purpose: >
  请对方验证本报告结论。
  无论认可或不认可，都**必须**写 seq-2 回复报告。
  - 如果认可：写回复报告说明"我认可此报告的内容，我将执行修复"，落盘后再行动。
  - 如果不认可：写 seq-2 回复报告说明原因，指出哪条结论有误及理由，通过 sender_pane 通知我。
---

## 概述

- **来源**: `docs/e2e-bug-log.md`（2026-04-11 测试，2026-04-12 验证）
- **方法**: 逐个读取 Server 路由实现代码，与 Bug 描述对比
- **核心结论**: 原始报告将 #4 (upsert_channel) 标为"误报"，经代码验证应**升级为真实 Bug**

---

## 确认存在的问题（7 个）

### Bug #1: update_provider — NOT NULL constraint
- **严重程度**: 高
- **文件**: `server/routes/model.js:100-104`
- **根因**: `SET name=?, api=?, base_url=?, api_key=?, is_enabled=?, updated_at=?` 全量覆盖，`model_providers_v2` 表所有字段均为 `NOT NULL`（`server/db.js:273-285`）。传入部分字段时，未传字段绑定为 `undefined` → SQLite 存为 `NULL` → 违反约束。
- **结论**: ✅ 原报告正确

### Bug #2: update_agent — NOT NULL constraint
- **严重程度**: 高
- **文件**: `server/routes/agent.js:134-160`
- **根因**: 同样全量覆盖所有列，`agents.name` 为 `NOT NULL`（`server/db.js:64`）。部分更新时 `config.name` 为 `undefined` → `NULL` → 违反约束。
- **结论**: ✅ 原报告正确

### Bug #3: update_office — undefined 'name'
- **严重程度**: 高
- **文件**: `server/routes/office.js:309-337`
- **根因**: `const { id, office } = req.body` 然后无条件访问 `office.name`。若调用方未传 `office` 对象（直接传扁平字段），`office` 为 `undefined` → 抛出 `Cannot read properties of undefined`。即使传了 `office` 但不含 `name`，仍会将 `undefined` 写入 DB 擦除原名。
- **结论**: ✅ 原报告正确

### Bug #4: upsert_channel — 返回 null 未创建 ⚠️ **原报告标为误报，实际为真实 Bug**
- **严重程度**: 高
- **文件**: `server/routes/channel.js:83-100`
- **根因**: `hasId` 判断 `config.id && String(config.id) !== '0'`。当 id 为 `"channel-feishu-xxx"` 这类 UUID 字符串时，`hasId` 为 `true`，走入 UPDATE 分支。然后 `Number("channel-feishu-xxx")` → `NaN`，`WHERE id = NaN` 匹配零行，实际未插入也未更新。返回 `NaN` 序列化为 `null`。
- **结论**: ⚠️ **原报告误判为"传参问题"，实为 Server 端 Bug**。代码无法处理非数值型 id。

### Bug #6: get_office_deployments — 返回格式不一致
- **严重程度**: 低
- **文件**: `server/routes/deployment.js:1071-1081`
- **根因**: `res.json(rows)` 直接返回数组，Proto 定义 `GetOfficeDeploymentsResponse { repeated OfficeDeployment deployments = 1; }` 期望 `{ "deployments": [...] }`。
- **结论**: ✅ 原报告正确

### Bug #7: ai_generate_agent — JSON 控制字符
- **严重程度**: 中
- **文件**: `server/routes/ai.js:166-174`
- **根因**: LLM 返回的原始文本若包含未转义的字面控制字符（如 literal 换行符而非 `\n` 转义序列），`JSON.parse()` 会失败。代码有 try/catch 返回 502，但无自动恢复机制（如 retry 或 auto-fix）。
- **结论**: ✅ 原报告正确，补充：已有 try/catch 保护不崩溃，但用户体验差

### Bug #10: update_opc_stats — 返回 null
- **严重程度**: 低
- **文件**: `server/routes/opc.js:192-203`
- **根因**: 成功路径 `res.json(null)`，无结构化返回值。
- **结论**: ✅ 原报告正确

---

## 误报（3 个）

### Bug #5: upsert_agent_documents — API 不存在
- **文件**: `server/routes/agent.js`
- **结论**: ✅ 原报告正确。搜索全 Server 无 `upsert_agent_documents` 或 `update_agent_documents` 端点。最接近的是 `update_agent_document`（单数），每次处理一个文档。

### Bug #8: restore_snapshot — 测试传错参数
- **文件**: `server/routes/snapshot.js:112` 使用 `const { id } = req.body`
- **Proto**: `RestoreSnapshotRequest { string id = 1; }`
- **结论**: ✅ 原报告正确。Server 和 Proto 一致用 `id`，测试传 `snapshot_id` 是测试错误。

### Bug #9: get_tools — 返回空数组
- **文件**: `server/routes/tool.js:22-29`
- **结论**: ✅ 原报告正确。`get_tools` 实现无问题，空数组说明 `tools` 表确实无数据。`create_tool` 实现也正常。运行 `./seed-dev-env.sh` 即可解决。

---

## 待确认（0 个）

---

## 总结

| 分类 | 数量 | Bug IDs |
|------|------|---------|
| **真实 Bug** | 7 | #1, #2, #3, #4(升级), #6, #7, #10 |
| **误报** | 3 | #5, #8, #9 |
| **待确认** | 0 | — |

### 与原报告对比

| 项目 | 原报告 | 本次验证 | 差异 |
|------|--------|----------|------|
| 真实 Bug | 6 个 | 7 个 | #4 从误报升级为真实 |
| 误报 | 4 个 | 3 个 | #4 移出 |

### 修复优先级建议（更新后）

1. **P0**: #1, #2, #3, #4 — 所有 update/upsert API 改为部分更新，只更新传入字段
2. **P1**: #7 ai_generate_agent — LLM 返回内容 JSON 安全转义 + 重试
3. **P2**: #6 get_office_deployments — 返回格式改为 `{ deployments: rows }`
4. **P2**: #10 update_opc_stats — 补充返回值 `{ ok: true, stats: {...} }`
