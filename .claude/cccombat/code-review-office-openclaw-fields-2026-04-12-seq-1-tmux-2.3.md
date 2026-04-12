---
title: "Code Review — Office 表新增 OpenClaw 安装信息字段"
date: 2026-04-12
author: "tmux-2.3"
recipient: "对方 Claude"
source_document: "git diff (5 files changed)"
summary: "为 offices 表新增 6 个 OpenClaw 安装信息字段，Server/Tauri/TS 三层同步改动"
purpose: >
  请对方审阅以下 code review 结论，确认是否有遗漏或风险。
---

# Code Review: Office 新增 OpenClaw 安装信息

## 改动概述

5 个文件，+123/-10 行，涉及 3 层（Server Node.js、Tauri Rust、前端 TypeScript）：

| 文件 | 改动 |
|------|------|
| `server/db.js` | 迁移：offices 表新增 6 列 |
| `server/routes/office.js` | UPDATE + 安装后自动采集信息并写入 DB |
| `src-tauri/src/models/office.rs` | Office struct 新增 6 个字段 |
| `src-tauri/src/services/office_service.rs` | row_to_office 索引调整 + SQL 补齐字段 |
| `src/lib/types.ts` | Office interface 新增 6 个字段 |

## 新增字段清单

```
openclaw_version         TEXT    // 安装版本，如 "1.2.3"
openclaw_install_path    TEXT    // which openclaw 结果
openclaw_download_url    TEXT    // 离线包下载地址
openclaw_nodejs_path     TEXT    // Node.js binary 路径
openclaw_nodejs_version  TEXT    // Node.js 版本号（不含 v 前缀）
openclaw_installed_at    INTEGER // 安装时间戳
```

## 审查结论

### ✅ 1. 三层字段对齐

Server 迁移、Tauri struct、TS interface 三处字段名称和类型一致，符合 proto-first 约定。

### ✅ 2. row_to_office 索引修正

`office_service.rs` 中 `row_to_office` 正确调整了索引号：原 19/20/21/22 → 新 25/26/27/28，中间插入 19-24。与 SQL SELECT 列顺序一致。

### ✅ 3. safeAddColumn 迁移安全

`server/db.js` 使用 `safeAddColumn`（推测为 IF NOT EXISTS 风格的幂等迁移），对已运行过的库无副作用。

### ✅ 4. CREATE/UPDATE 补齐

`create_office` 和 `update_office` 的 SQL 和 params 列表均已补齐 6 个新字段，数量匹配。

### ✅ 5. 前端类型同步

`src/lib/types.ts` 已同步添加 6 个 optional 字段。

### ⚠️ 6. `openclaw_download_url` 来源存疑

`office.js:938` 中 `downloadUrl` 变量在写入 DB 时被使用，但我在 diff 中没看到它的定义。它应该来自安装流程的某个上游变量（可能是 `runDaemonInstall` 函数的参数或闭包作用域）。**请确认 `downloadUrl` 在此作用域内有定义。**

### ⚠️ 7. `nowUnix()` 函数未定义

`office.js:892` 使用了 `nowUnix()`，diff 中未出现定义。需确认该函数在文件顶部或 utils 中已有声明。

### ⚠️ 8. UPDATE 语句 `updated_at` 参数重复

`office.js:939` 的 UPDATE 语句：
```js
'UPDATE offices SET ..., openclaw_installed_at=?, updated_at=? WHERE id=?'
).run(version, installPath, downloadUrl, nodejsPath, nodejsVersion, installedAt, installedAt, office_id)
```
`installedAt` 传了两次 —— 一次给 `openclaw_installed_at`，一次给 `updated_at`。逻辑上没问题（安装时间 = 更新时间），但 `updated_at` 应该用 `now()` 而不是 `installedAt`，否则如果安装时间和当前时间有偏差，`updated_at` 就不准确。

### ⚠️ 9. Tauri 与 Server 的 `initial_openclaw_config` 字段

diff 显示 Tauri 的 `create_office` 和 `update_office` 把 `initial_openclaw_config` 也补进了 SQL。这在 Server 路由中已有处理，但需要确认 Server 的 CREATE 路由（`office.js` 的 POST 创建接口）也在同一 PR 中补齐了这个字段 —— diff 中只看到了 UPDATE 路由的改动。

### ⚠️ 10. 前端未发送新字段

`src/lib/types.ts` 虽然定义了 6 个新字段，但 Office 详情页/编辑页的表单是否已更新以发送这些字段？目前看这些字段主要是**后端安装流程自动填充**，前端只读展示，这是合理的设计。

## 总结

整体改动干净、三层对齐良好。主要风险点：
1. `downloadUrl` 和 `nowUnix()` 变量需要确认存在
2. `updated_at` 建议使用 `now()` 而非复用 `installedAt`
3. Server CREATE 路由的 `initial_openclaw_config` 是否也需要补齐

请审阅以上结论，确认是否有误或遗漏。
