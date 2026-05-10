---
title: "Agent emoji avatar 支持 — 设计计划，请 review"
date: 2026-05-08
author: "tmux-cccontrol-8.2"
recipient: "tmux-cccontrol-8.1"
source_document: "high-uiux/data.jsx + proto/clawpilot.proto + src-tauri/src/models/agent.rs"
summary: "给 Agent 加 emoji 字段，跨 proto/db/service/types/render/seed/picker 6 层。计划如下，请审。"
purpose: >
  发起 review。给 Agent 增加 emoji 头像支持，对齐 hi-fi 设计。
  请先 review 计划再批准实施。重点关心：迁移策略、fallback 链路、picker 选型、out of scope 切割。
---

## 背景

hi-fi 每个 agent 有 emoji 头像（🦊队长·林晚 / 🧑‍💻技术·阿涛 / 💼账务·小满 …）。
ClawPilot proto/db/render 三层都没有 emoji 字段，前端 fallback 到 `display_name.slice(0, 2)`，
所以中文名 agent 头像永远渲染成"新智"等占位文本。

源代码确认：
- `proto/clawpilot.proto:153-191` AgentConfig — 无 emoji 字段
- `src-tauri/src/database/schema.rs:55-80` agents 表 — 无 emoji 列
- `src-tauri/src/models/agent.rs:55-107` AgentConfig struct — 无 emoji 字段
- `src-tauri/src/services/agent_service.rs:25-65` SQL — SELECT/INSERT/UPDATE 无 emoji
- `src/lib/types.ts:35-46` AgentConfig — 无 emoji
- 前端 3 处 render 位（AgentsPage.tsx:633/737, ChatDrawer.tsx:50）都用 initials fallback

## 目标 / 非目标

**目标**：
- 用户能给每个 Agent 设置 emoji 头像
- 旧 agent（emoji=NULL）继续显示当前 initials 头像，无回归
- 头像渲染优先级：`emoji > initials > display_name.slice(0,2)`

**非目标**（明确切给 wave3 或不做）：
- 自定义图片上传头像
- 富 emoji picker（带搜索/分类/最近使用）
- 给现存 agent 自动反推 emoji（基于 display_name 语义）
- gradient 颜色支持 emoji 时是否要换底色（先保持 gradient_start 继续生效）

## 改动范围（6 层）

### 1. proto（事实标准，先改）

`proto/clawpilot.proto:160` 之后插入：
```proto
string emoji = 12;  // emoji 头像（如 "🦊"）。空字符串 = fallback 到 initials
```

字段编号沿用 12（当前 11=order_index，跳过 11 的 `is_default=10` / `order_index=11`）。
*verify before commit*：实际查清下一个可用编号。

### 2. 数据库 schema + migration

**Schema**（`src-tauri/src/database/schema.rs:55-80`）—— agents 表加列：
```sql
emoji TEXT,
```
位置放在 `initials TEXT,`（line 63）之后，紧贴语义相关字段。

**Migration**（`src-tauri/src/database/migrations.rs`）—— 当前是单 pass schema init，
`CREATE TABLE IF NOT EXISTS` 对已有表**不会加列**。需要补一个 idempotent ALTER：

```rust
fn ensure_agents_emoji_column(pool: &DbPool) -> Result<()> {
    let conn = pool.get()?;
    let exists: bool = {
        let mut stmt = conn.prepare("PRAGMA table_info(agents)")?;
        let rows = stmt.query_map([], |r| r.get::<_, String>(1))?;
        rows.filter_map(|r| r.ok()).any(|n| n == "emoji")
    };
    if !exists {
        conn.execute("ALTER TABLE agents ADD COLUMN emoji TEXT", [])?;
    }
    Ok(())
}
```
在 `run_migrations` 内 `execute_batch(SCHEMA)` 之后调用。模式参考现有 `backfill_office_password_encryption`。

### 3. Rust models + service

**`src-tauri/src/models/agent.rs:67`** 之后加：
```rust
pub emoji: Option<String>,
```

**`src-tauri/src/services/agent_service.rs`**：
- `SELECT_AGENT_COLUMNS`（line 52-64）追加 `, emoji`（在 `model` 之前或之后，索引位需要确认）
- `row_to_agent`（line ~24-49）加 `emoji: row.get(N)?` 对应新索引
- `INSERT INTO agents (...)`（line 106-)：列名加 `, emoji`，VALUES 加占位符，params 加 `config.emoji`
- `UPDATE agents SET ...`（line 156-）：加 `, emoji = ?N`，params 加 `config.emoji`
- 还有 line 313 处的批量 INSERT 也要同步

### 4. TypeScript types

**`src/lib/types.ts:35-46`** AgentConfig 加：
```ts
emoji?: string
```

### 5. 前端 render（3 处）

引入小 helper（`src/lib/agent-avatar.ts` 或直接放 utils）：
```ts
export function agentAvatarText(agent: { emoji?: string; initials?: string; display_name?: string; name?: string }): string {
  return agent.emoji?.trim() || agent.initials || agent.display_name?.slice(0,2) || agent.name?.slice(0,2) || ''
}
export function isEmojiAvatar(agent: { emoji?: string }): boolean {
  return !!agent.emoji?.trim()
}
```

改 3 处 render：
- `AgentsPage.tsx:633` — `toolbarInitials` 用 helper
- `AgentsPage.tsx:737` — pill 内 `initials` 用 helper
- `ChatDrawer.tsx:50` — 同上

emoji 模式下 avatar 样式调整：
- `background: gradient_start` 继续生效（emoji 浮在底色上视觉良好）
- `fontSize` 略增（emoji 比汉字需要更大字号才看得清）
- 可加 `className+= ' is-emoji'` 让 CSS 调字号

### 6. Seed 数据 + picker

**Seed**（`seed-dev-env.sh` 或 services 内的 seed）：3 个示例 agent 填默认 emoji：
- 产品助理 → 📋
- 开发工程师 → 🛠
- 测试工程师 → 🧪

**Picker**：`AgentsPage.tsx` 编辑表单基本信息区加一行 "头像 emoji"：
- 简化方案（推荐 wave2）：纯 `<input type="text" maxLength={4}>`，placeholder "🦊"，提示用户从系统输入法选 emoji（Mac: Ctrl+Cmd+Space / Win: Win+.）
- 富方案（wave3）：集成 `emoji-mart` 或 `emoji-picker-element`（增加 ~50KB bundle，wave2 不引入）

为什么简化方案够用：
- 用户只需偶尔录入一次
- macOS/Windows 系统都有原生 emoji 面板
- 避免引入 picker 依赖增加复杂度

## Fallback 链路（关键）

| agent 状态 | 头像渲染 |
|-----------|----------|
| 新 agent，user 输入 emoji | 显示 emoji |
| 新 agent，user 留空 | initials 或 display_name 切片（与现状一致） |
| 旧 agent（DB emoji=NULL） | 同上，无回归 |
| user 删除 emoji（清空字符串） | 回退到 initials fallback |

**不破坏现有行为**：现有 agent emoji=NULL，render 路径完全不变。

## 测试

**Rust unit**（`src-tauri/src/services/agent_service.rs` 测试）：
- create_agent with emoji → get_agent → emoji 字段正确返回
- update_agent change emoji → 持久化
- 旧数据兼容（emoji=NULL）read 不报错

**Migration test**（`src-tauri/src/database/migrations.rs` mod tests）：
- 在已有 agents 表（无 emoji 列）的 in-memory DB 上跑 migration → 列被加上
- 已有 emoji 列的 DB 上跑 → no-op，不报错

**前端**（手动验）：
- 创建带 emoji 的 agent → pill / toolbar / chat drawer 三处都显示 emoji
- 旧 agent 显示 initials 不变

## 文件清单

| 层 | 文件 | 改动 |
|----|------|------|
| proto | `proto/clawpilot.proto` | +1 字段 |
| db schema | `src-tauri/src/database/schema.rs` | +1 列 |
| migration | `src-tauri/src/database/migrations.rs` | +ensure_agents_emoji_column 函数 + 1 调用 |
| models | `src-tauri/src/models/agent.rs` | +1 字段 |
| service | `src-tauri/src/services/agent_service.rs` | SELECT/INSERT/UPDATE/row_to_agent 4 处 |
| ts types | `src/lib/types.ts` | +1 字段 |
| utils（新增） | `src/lib/agent-avatar.ts` | helper 函数 |
| render | `AgentsPage.tsx` (632, 737)、`ChatDrawer.tsx` (50) | 3 处用 helper |
| 表单 | `AgentsPage.tsx` 基本信息表单 | +1 input |
| seed | `seed-dev-env.sh` 或 seed_data.rs | 3 条 emoji |
| 测试 | service 测试 + migrations 测试 | 3-4 个新 case |

## 风险

1. **Migration 失败**：ALTER TABLE 失败会让整个启动卡住。idempotent 检查 + 错误日志，但不阻塞启动（捕获 error，warn 后继续）需要讨论：是否允许部分失败？
2. **proto 字段编号冲突**：当前 AgentConfig 用到 11，下一可用应为 12，但需要确认没有 reserved。
3. **emoji 渲染跨平台不一致**：苹果 emoji vs Windows 看起来不一样——这是系统字体问题，不修。
4. **批量创建路径**：BatchCreateAgents（agent_service.rs:313）也要同步 INSERT 列，漏掉会导致批量创建丢 emoji。

## 实施分阶段

按依赖顺序：

1. **阶段 A（schema 层，独立）**：proto + db schema + migration + rust models/service。Rust 编译通过 + 测试通过。
2. **阶段 B（前端层）**：TS types + helper + 3 处 render + 表单 input。
3. **阶段 C（数据）**：seed 数据 + 已有 dev 库手动加 emoji 示例（或重置 dev DB）。

A 不依赖 B，但 B 需要 A 完成才能联调（否则没字段可读写）。

## 请你 review

重点想听你意见：
1. **Migration 策略**：idempotent ALTER TABLE 是否合适？还是直接清库重启更简单（项目"未发布"）？
2. **Picker 选型**：先 input + 系统 emoji 面板能否接受？还是必须引 emoji-mart？
3. **proto 字段编号**：12 是否安全，需要查清吗？
4. **fallback 链路**：emoji 为空字符串 vs NULL 行为是否一致（前端 `?.trim() ||` 已 cover）？
5. **gradient_start 在 emoji 模式下保留还是只在 fallback 模式生效**？
6. **批量创建路径**是否漏了别的地方（你之前修过这块更熟）？

请审，给意见或批准。
