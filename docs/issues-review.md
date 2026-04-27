# ClawPilot — 产品问题清单（PM 审查）

> 起草：2026-04-27 · 基于浏览器实测 + 代码审计
> 严重等级：P0 阻塞 / P1 高 / P2 中 / P3 低
>
> **修复进度（2026-04-27 Wave 1+2）**：
> - ✅ A1 / A2 / A3 / A7 — Wave 1 安全收口完成（commit pending）
> - ✅ A4 — `process.env` 路径删除，仅留 `import.meta.env.DEV`
> - ✅ B1 / B2 / B3 — Wave 2 业务可信度完成
> - ❌ B5 — combat seq-2 结论错误，**已撤回**：`guardrail_rules` 是 `guardrail_allow` 的 legacy alias（types.ts:56 注释），AI 结果无 `guardrail_rules` 字段；原代码刻意 mirror，非 bug。
> - ✅ D5 — `+ 0 * ts` 死表达式删除

---

## A. 安全 & 数据正确性（最高优先级）

| ID | 等级 | 位置 | 问题 |
|----|------|------|------|
| **A1** | **P0** | `services/office/mod.rs` `offices.access_password` | Office SSH 密码 **明文落库**。Provider API Key 已经走了 `crypto::encrypt`，Office 密码必须同样加密。 |
| A2 | P0 | `services/ssh_service.rs:79` | SSH 命令通过 `format!(" -i \"{}\"")` 字符串拼接 key 路径；如果 key_path 含双引号或反引号会被 shell 注入。需要 quote 转义或改 `Command` 多参数形式。 |
| A3 | P1 | `http/mod.rs` `CorsLayer::permissive()` | 跨域全开。即使绑定 127.0.0.1，浏览器中任何站点 (恶意网页) 都能 fetch `http://127.0.0.1:16667/api/...` 拿到全部 OPC + 凭据。需要校验 Origin 或加 token 头。 |
| **A4** | P3 | LicenseGate `IS_DEV` 判断 | 用 `import.meta.env.DEV` 决定是否跳过。combat 复核后下调到 P3：Vite 构建时已替换为 `false`，运行时不可翻转；仅当 build 用 `--mode development` 才有风险。建议 build 脚本加 mode 校验。 |
| A5 | P2 | `commands/log_service.rs:176` | `pool.get().unwrap()` — 数据库连接拿失败会 panic 整个进程。 |
| A6 | P2 | Agent 文档 / Provider 配置写入 | 仅 trim 校验长度；没有 schema 验证，可写入任意 JSON 字符串到 `enabled_tools`/`reports_to`/`manages` 字段，后续 deploy 阶段才崩。 |
| **A7** | **P0** | `daemon/src/main.rs` `daemon/src/routes.rs` | Daemon 16668 完全无认证：无 CorsLayer、无 auth middleware（仅 TraceLayer）。本地任何进程可调 `/deploy` `/install_openclaw` 触发远端 SSH 命令执行，等于把 A1+A2 的攻击面外暴一遍。 |

## B. 功能 / 业务正确性

| ID | 等级 | 位置 | 问题 |
|----|------|------|------|
| **B1** | **P1** | `pages/CompanyListPage.tsx` | 列表里有 11 个公司，其中 8 个是 `测试团队-XXXXXXXX` 的 E2E 残留。**没有删除按钮、没有过滤、没有搜索**，普通用户无法清理。 |
| **B2** | **P1** | `pages/OverviewPage.tsx` | 顶部"今天 / 本周 / 本月"按钮 **完全是装饰**，点击没有任何过滤逻辑。要么实现，要么去掉。 |
| **B3** | **P1** | `pages/OpcPage.tsx` vs `pages/CompanyListPage.tsx` | 两个页面都做 OPC CRUD，导航上仅暴露 CompanyListPage（`#/companies`），但 `#/opc` 路由仍存在，是死路由 / 隐藏入口。要么合并要么明确去掉。 |
| **B4** | **P2** | `pages/SettingsPage.tsx` 主题区 | 只显示"深色模式"，不可切换。要么实现亮色主题，要么删除"主题"区块。 |
| B5 | P2 | `pages/AgentsPage.tsx:387` | `guardrail_rules` 字段错误地从 `result.guardrail_allow` 取值（应取 `result.guardrail_rules`），导致 AI 生成的 rules 被 allow 覆盖。combat 复核更正：guardrail_deny 不受影响。 |
| ~~B6~~ | — | ~~AgentsPage skill row~~ | **已撤销**。combat 复核：line 137 与 144 是兄弟节点（共同父 line 135），点击 144 不冒泡到 137；这是有意 UX（点行体或点 +Add 都能添加）。 |
| B7 | P2 | `pages/DeployPage.tsx` | 部署到一个 `daemon_url` 为空的 Office 时没有前置阻拦，提交后才报错。应在选项里直接 disable 并 tooltip。 |
| B8 | P2 | `pages/LogsPage.tsx` | 固定拉 200 条后在 **客户端** 过滤；级别/组件过滤是不完整的（早于 200 行的日志被截断）。需把过滤推到后端。 |
| B9 | P2 | `pages/OfficePage.tsx` 地址校验 | 单字符 hostname 通过；SSH 端口未做 0–65535 范围校验。 |
| B10 | P3 | `pages/ActivitiesPage.tsx` | 每个 Agent 仅展示 50 → 实际只渲染最近 10 条；事件无持久化，刷新即丢。 |

## C. UI / UX 一致性

| ID | 等级 | 位置 | 问题 |
|----|------|------|------|
| **C1** | **P1** | 全站 | **大量硬编码中文字符串**，i18n 漏覆盖：OpcPage、BindingsPage、OfficePage、SettingsPage、ChatDrawer 都有。EN/JA/KO 用户切换语言后部分按钮仍然是中文。 |
| C2 | P2 | OpcPage / OfficePage / AgentsPage | 大量 `confirm()` 原生弹窗，与设计稿里的 Modal 风格不一致；且 confirm 的提示文本是中文硬编码。 |
| C3 | P2 | ProvidersPage 模型表 | 表格直接展示 `["text","image"]` 这种 JSON 字面量给用户，应改成图标 / chip。 |
| C4 | P2 | DeployPage select option | 用 `⚠️ / ✅` emoji 区分 office 状态，无障碍读屏不友好。 |
| C5 | P2 | OfficePage 安装 Modal | 1068 行单文件，安装 Modal 内联样式 128 行；强烈建议拆分子组件。 |
| C6 | P2 | AgentsPage / OfficePage 体积 | 1093 / 1068 行，已超过项目 CR 标准的"30 行/函数 + 拆分大组件"要求。 |
| C7 | P3 | OverviewPage / DeployPage / LogsPage | polling 间隔（120s / 2s / 3s）硬编码，应抽到常量。 |
| C8 | P3 | SettingsPage | 版本号硬编码 `0.1.0`，应读 `package.json` 或 Tauri runtime。 |
| C9 | P3 | LicenseGate | 错误信息原样透传给用户（含技术堆栈），需要做友好化处理。 |

## D. 文档 / 可维护性

| ID | 等级 | 位置 | 问题 |
|----|------|------|------|
| D1 | P1 | `src-tauri/src/http/mod.rs` 2477 行 | 单文件托管 95 条 route + 大量内联请求/响应类型；按域拆分到 `http/opc.rs` `http/office.rs` 等更易维护，且能让 Code Review 工具有效。 |
| D2 | P2 | `proto/clawpilot.proto` | Office 字段已经新增 `access_password` 等敏感字段，proto 与 Rust struct 一致性未做工具校验，违背 CLAUDE.md "proto 是唯一事实标准"。 |
| D3 | P2 | `docs/prd.md` 旧版 | 称前端是"原生 HTML/CSS/JS"，与实际 React+TS+Vite 完全脱节（已在 v2 修正）。 |
| D4 | P3 | i18n key 命名 | `t('common.collapse', '收起侧栏')` 这种"key + 默认值"用法散落各处，应统一在翻译文件里维护。 |
| **D5** | P3 | `services/office/crud.rs:127` | 死表达式 `office.created_at.max(1).min(i64::MAX - 1) + 0 * ts` —— `+ 0 * ts` 是重构残留，可清理。combat 补充。 |

## E. 性能

| ID | 等级 | 位置 | 问题 |
|----|------|------|------|
| E1 | P2 | `OpcContext.reload()` | 每次切公司都 refetch 全部 OPC，无缓存；Companies 多时无谓查询。 |
| E2 | P3 | LogsPage / ActivitiesPage | 长列表无虚拟滚动，长时间运行后滚动卡顿。 |
| E3 | P3 | OfficePage daemon health | 多 Office 时并发健康检查无去抖与限流。 |

---

## 修复路线建议（PM 视角）

**Wave 1 — 安全收口（必须，发版阻塞）**（combat seq-2 重排）
- A1 加密 Office 密码 + ssh_key_path（迁移 + 读写双向）
- A2 SSH 命令重构为 argv（不靠 shell 转义；username/host/cmd 全部走 `Command::arg()`）
- A7 Daemon 16668 加 Bearer token 中间件（`~/.clawpilot/daemon.key`）
- A3 Server / daemon 都把 `CorsLayer::permissive` 改成显式 `allow_origin` 白名单

**Wave 2 — 业务可信度 + 大文件拆分**
- B1 公司列表加删除/搜索
- B2 OverviewPage 时间筛选要么实现要么删（建议删，留 TODO）
- B3 删除 `#/opc` 路由（grep 确认无引用）
- B5 AgentsPage `guardrail_rules` 取值修正
- D1 http/mod.rs 按域拆分（OPC/Agent/Office/...）
- D5 删 `office/crud.rs:127` 死表达式

**Wave 3 — UX & 一致性**
- B4 SettingsPage 删主题块（除非短期内做亮色）
- C1 i18n 全面扫描，所有硬编码中文塞进资源文件
- C2 confirm() → 自研 Modal
- C3 input_types 改 chip
- C5/C6 拆 OfficePage、AgentsPage

**Wave 4 — 性能 / 可维护性**
- E1 OpcContext 加缓存
- D2 proto 与 Rust struct 校验脚本
- D4 i18n key 默认值集中化
