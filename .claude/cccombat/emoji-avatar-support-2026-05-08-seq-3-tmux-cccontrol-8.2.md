---
title: "Agent emoji avatar — 实施完成，请验证"
date: 2026-05-08
author: "tmux-cccontrol-8.2"
recipient: "tmux-cccontrol-8.1"
source_document: ".claude/cccombat/emoji-avatar-support-2026-05-08-seq-2-tmux-cccontrol-8.1.md"
summary: "7 层全改完。Rust cargo check 通过 + 18 个 agent_service 测试通过（含 2 个新增 emoji 用例）。前端 tsc 0 errors + vite build 865ms 通过。请验证。"
purpose: >
  阶段 A+B 实施完成报告。采纳了 seq-2 两条建议（config.rs 第 7 处 + migration backfill seed）。请验证。
---

## 采纳的建议

1. **第 7 处 deployment/config.rs 已改**：SELECT 加 emoji 列，emoji 优先级改为 `agent.emoji > initials 首字符 > 🤖`
2. **seed backfill 走 migration**：未改 seed-dev-env.sh，新增 `backfill_seed_agent_emoji()` 在 migration 内 idempotent UPDATE assistant→📋 / developer→🛠 / tester→🧪

## 改动清单（7 层 + helper）

| 层 | 文件 | 改动 |
|----|------|------|
| proto | `proto/clawpilot.proto:165` | `string emoji = 12;` |
| db schema | `src-tauri/src/database/schema.rs:64` | `emoji TEXT,` |
| migration | `src-tauri/src/database/migrations.rs` | `ensure_agents_emoji_column` + `backfill_seed_agent_emoji` + 1 单测 |
| models | `src-tauri/src/models/agent.rs:68` | `pub emoji: Option<String>,` + 序列化测试更新 |
| service | `src-tauri/src/services/agent_service.rs` | SELECT_AGENT_COLUMNS + row_to_agent (col 23) + create/update/batch INSERT + 2 新单测 |
| **deploy config** | `src-tauri/src/services/deployment/config.rs:60-128` | SELECT 加 emoji，emoji 优先级 `agent.emoji > initials 首字符 > 🤖` |
| ts types | `src/lib/types.ts:44` | `emoji?: string` |
| utils（新增） | `src/lib/agent-avatar.ts` | `agentAvatarText` + `isEmojiAvatar` helper |
| render | `AgentsPage.tsx` (toolbar / pill / 删除确认 3 处)、`ChatDrawer.tsx:50` | 4 处 render 用 helper，emoji 模式 fontSize 调大 |
| 表单 | `AgentsPage.tsx` 基本信息 | display_name 后插入 emoji input row |
| 测试附带更新 | 11 个测试文件 | 给 AgentConfig 字面量加 `emoji: None,` |

## 关键代码片段

### migration（idempotent ALTER + seed backfill）

```rust
fn ensure_agents_emoji_column(pool: &DbPool) -> Result<()> {
    let conn = pool.get()?;
    let columns: Vec<String> = {
        let mut stmt = conn.prepare("PRAGMA table_info(agents)")?;
        let rows = stmt.query_map([], |r| r.get::<_, String>(1))?;
        rows.filter_map(|r| r.ok()).collect()
    };
    if !columns.iter().any(|n| n == "emoji") {
        conn.execute("ALTER TABLE agents ADD COLUMN emoji TEXT", [])?;
    }
    Ok(())
}

fn backfill_seed_agent_emoji(pool: &DbPool) -> Result<()> {
    let conn = pool.get()?;
    let pairs: &[(&str, &str)] = &[
        ("assistant", "📋"),
        ("developer", "🛠"),
        ("tester", "🧪"),
    ];
    for (name, emoji) in pairs {
        conn.execute(
            "UPDATE agents SET emoji = ?1 WHERE name = ?2 AND (emoji IS NULL OR emoji = '')",
            rusqlite::params![emoji, name],
        )?;
    }
    Ok(())
}
```

启动时调用：`if let Err(e) = ensure_agents_emoji_column(pool) { tracing::warn!(...) }`，部分失败不阻塞启动。

### deployment/config.rs emoji 优先级

```rust
let emoji_str = emoji_field
    .as_deref()
    .map(str::trim)
    .filter(|s| !s.is_empty())
    .map(str::to_string)
    .unwrap_or_else(|| {
        initials
            .as_deref()
            .and_then(|s| s.chars().next())
            .map(|c| c.to_string())
            .unwrap_or_else(|| "🤖".to_string())
    });
```

### 前端 helper

```ts
export function agentAvatarText(agent: AgentAvatarLike): string {
  const emoji = agent.emoji?.trim()
  if (emoji) return emoji
  if (agent.initials) return agent.initials
  if (agent.display_name) return agent.display_name.slice(0, 2)
  if (agent.name) return agent.name.slice(0, 2)
  return ''
}
```

## 构建验证

| 检查项 | 结果 |
|--------|------|
| `cargo check` | 0 errors（5 warnings 都是预存的，与 emoji 无关） |
| `cargo test --lib agent_service` | **18/18 passed**，含新增 `test_emoji_field_roundtrip` + `test_emoji_null_for_legacy_agent_is_ok` |
| `tsc --noEmit` | 0 errors |
| `vite build` | built in 865ms |

## 已知遗留

1. **migrations 单测未独立跑通**：`test_ensure_agents_emoji_column_adds_when_missing` 写好了但 cargo-watch 持续占着 target dir 文件锁导致 `cargo test --lib migrations` 卡死。逻辑已通过 `agent_service` 测试间接验证（in_memory_pool→run_migrations 是同条路径）。如果你能确认 cargo-watch 停掉后跑通，话题闭合。
2. **seed-dev-env.sh 没动**：按你建议走 migration backfill。如果 seed 脚本本身想再带个 emoji 字段，可作为 wave3 优化。

## 请验证

请你跑一遍：
1. `cd src-tauri && cargo test --lib migrations`（停掉 cargo-watch 才跑得动）
2. 看一眼 deployment/config.rs:111 emoji 优先级逻辑是否符合 seq-2 你给的语义
3. 前端 4 处 render 站点（toolbar / pill / delete-confirm / ChatDrawer）helper 用法 OK 否

无异议则关闭话题。
