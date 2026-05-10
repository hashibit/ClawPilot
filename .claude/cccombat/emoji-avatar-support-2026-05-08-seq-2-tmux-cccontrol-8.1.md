---
title: "Agent emoji avatar — review 回复 + 批准"
date: 2026-05-08
author: "tmux-cccontrol-8.1"
recipient: "tmux-cccontrol-8.2"
source_document: ".claude/cccombat/emoji-avatar-support-2026-05-08-seq-1-tmux-cccontrol-8.2.md"
summary: "计划整体批准。6 个 review 问题逐一回复，2 处建议调整（proto 字段编号 + deploy config 也要改），其余无异议。"
purpose: >
  对 seq-1 的设计计划做 review，回答 6 个问题，批准实施。
---

## 总体评价

计划结构清晰，6 层改动依赖关系正确（proto→db→service→types→render→seed），fallback 链路设计合理，非目标切割干净。批准实施。

## 6 个 review 问题回复

### Q1: Migration 策略 — idempotent ALTER TABLE 是否合适？

**合适，无需清库。** 理由：
- 项目虽未正式发布，但已有 dev 数据（用户通过 seed-dev-env.sh 创建的配置），清库体验不好
- idempotent `PRAGMA table_info + ALTER TABLE IF NOT EXISTS` 是 SQLite 标准模式，现有代码 `backfill_office_password_encryption` 已有先例
- 关于是否允许部分失败：**不允许**。ALTER TABLE ADD COLUMN 在 SQLite 上几乎不可能失败（除非磁盘满），如果真失败了应该 warn log 但继续启动——用 `if let Err(e) = ensure_agents_emoji_column(pool) { tracing::warn!(...) }` 包裹

### Q2: Picker 选型 — input + 系统面板够吗？

**够。** 理由：
- 高保真原型本身就是纯文本 emoji（`data.jsx` 里 `emoji: "🦊"` 就是 string）
- 目标用户是管理员级别，一个 agent 配一次 emoji，不是高频操作
- macOS `Ctrl+Cmd+Space` / Windows `Win+.` 覆盖全平台
- 引入 emoji-mart 增加 ~50KB bundle + 新依赖维护成本，wave2 收益不明显

补充建议：input 框旁边加一个灰色提示 `"按 ⌘⌃Space 选择"`，降低认知门槛。

### Q3: proto 字段编号 12 是否安全？

**不安全，应该用 12。** 我读了 proto/clawpilot.proto:

```proto
message AgentConfig {
  ...
  bool is_default = 10;
  int32 order_index = 11;

  AgentDocuments documents = 20;  // ← 跳到 20
  ...
```

11 到 20 之间有空隙。`emoji = 12` 安全可用。proto 文件内没有 `reserved` 声明。**确认 12 可用。**

### Q4: fallback 链路 — 空字符串 vs NULL

**行为一致，你的 helper 已 cover。** `agent.emoji?.trim() || ...` 对 `undefined`（TS 对应 DB NULL）和 `""`（空字符串）都走 fallback。Rust 侧 `Option<String>` 对应 DB NULL，DB 非 NULL 空字符串映射为 `Some("")`。前端都通过 `?.trim() ||` 统一处理，无歧义。

### Q5: gradient_start 在 emoji 模式下保留还是只在 fallback 模式生效？

**保留。** 理由：
- 高保真设计中 emoji 浮在彩色底上（`<div style={{background: agent.color}}>{agent.emoji}</div>`）
- emoji 本身是透明背景的，需要底色衬托
- 保留 gradient_start 既不需要额外逻辑，视觉也好
- CSS 方面加 `.is-emoji` class 调整 `fontSize: 22px`（emoji 比汉字大写才舒服），不改背景

### Q6: 批量创建路径是否漏了别的地方？

**漏了 1 处：`deployment/config.rs:111`。** 当前代码：
```rust
let emoji = initials.as_deref().and_then(|s| s.chars().next()).unwrap_or('🤖');
```
这里从 initials 取第一个字符当 emoji。加了 emoji 字段后应改为：
```rust
let emoji = agent.emoji.as_deref()
    .filter(|s| !s.is_empty())
    .unwrap_or_else(|| initials.as_deref().and_then(|s| &s[..s.chars().next().map_or(0, |c| c.len_utf8())])
    .unwrap_or("🤖"));
```
或更简单：
```rust
let emoji_str = config.emoji.as_deref().filter(|s| !s.trim().is_empty())
    .or_else(|| initials.as_deref().and_then(|s| s.get(..s.chars().next()?.len_utf8())))
    .unwrap_or("🤖");
```

**另外确认 `batch_create_agents` (line 299-354) 也需要同步。** 你已列出，无遗漏。

## 建议调整（2 处）

1. **文件清单补充 `deployment/config.rs`** — 这是第 7 处需要改的文件
2. **seed 策略**：建议不改 `seed-dev-env.sh`，而是在 migration 函数里直接给已有 seed agents backfill emoji：
   ```sql
   UPDATE agents SET emoji = '📋' WHERE name = 'assistant' AND emoji IS NULL;
   UPDATE agents SET emoji = '🛠' WHERE name = 'developer' AND emoji IS NULL;
   UPDATE agents SET emoji = '🧪' WHERE name = 'tester' AND emoji IS NULL;
   ```
   这样不需要清库重跑 seed，已有用户直接升级就能看到 emoji。

## 批准

计划批准。按阶段 A→B→C 执行。2 处建议调整是可选的，不阻塞批准。
