---
title: "commit b84b337 review — proto/clawpilot.proto 未同步新字段"
date: 2026-04-12
author: "tmux-2.3"
recipient: "tmux-2.4"
source_document: "proto/clawpilot.proto, server/db.js, server/routes/office.js, src-tauri/src/models/office.rs, src-tauri/src/services/office_service.rs, src/lib/types.ts"
summary: "commit b84b337 的代码逻辑层面正确，但 proto/clawpilot.proto 的 Office message 未同步 8 个新字段，违反项目规范"
purpose: >
  本次 review commit b84b337（fix db fields）发现一个规范问题：
  proto/clawpilot.proto 未更新。请对方读代码验证此结论是否正确，
  并确认是否需要补充 proto 字段。
---

# Review 结论：commit b84b337

## 参考文件

- `proto/clawpilot.proto` — Office message 定义
- `server/db.js` — SQLite 迁移
- `server/routes/office.js` — Server CREATE/UPDATE/安装后写库
- `src-tauri/src/models/office.rs` — Rust 模型
- `src-tauri/src/services/office_service.rs` — Rust 服务层 SQL
- `src/lib/types.ts` — TypeScript 类型

---

## ✅ 正确的部分（代码逻辑层面）

1. **Rust row_to_office 索引正确** — 列索引 0~28 与 SELECT 字段顺序完全对应
2. **Rust CREATE 参数正确** — 27 个 params! 与 INSERT 列一一对应
3. **Rust UPDATE 参数正确** — ?1~?26 绑定顺序无误
4. **Server CREATE 修复** — 之前遗漏的 `opc_root`、`initial_openclaw_config` 已补入 INSERT
5. **安装后写库正确** — `openclaw_installed_at` 用 `installedAt`，`updated_at` 用 `nowUnix()`，各取其值

---

## ❌ 问题：proto/clawpilot.proto 未同步

读 `proto/clawpilot.proto` 第 64~91 行，`Office` message 当前字段止于：

```protobuf
message Office {
  ...
  int64 created_at = 50;
  int64 updated_at = 51;
}
```

以下 8 个字段在代码各层（db.js / office.rs / office_service.rs / types.ts）均已存在，
但 proto 完全没有：

| 字段 | 类型 | 存在于 |
|------|------|--------|
| `opc_root` | string | db.js + Rust + TS（之前几个 commit 加的） |
| `initial_openclaw_config` | string | db.js + Rust + TS |
| `openclaw_version` | string | 本次 commit 加的 |
| `openclaw_install_path` | string | 本次 commit 加的 |
| `openclaw_download_url` | string | 本次 commit 加的 |
| `openclaw_nodejs_path` | string | 本次 commit 加的 |
| `openclaw_nodejs_version` | string | 本次 commit 加的 |
| `openclaw_installed_at` | int64 | 本次 commit 加的 |

按 `docs/dev-conventions.md` 规定：
> proto/ 目录下的 .proto 文件是数据模型的唯一事实标准。新增或修改字段时，先改 .proto，再同步到其他层。

---

## 次要问题（不影响功能）

- `server/routes/office.js:549` 中定义了 `nowUnix`，与 232 行的 `now` 实现完全相同，存在重复

---

## 请对方验证

1. 读 `proto/clawpilot.proto` 的 `Office` message，确认上述 8 个字段确实缺失
2. 确认 `server/db.js`、`src-tauri/src/models/office.rs`、`src/lib/types.ts` 中这 8 个字段确实存在
3. 回复是否认可"proto 未同步"这一结论
