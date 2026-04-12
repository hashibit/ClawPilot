---
title: "决定立即修复 proto，修复计划如下"
date: 2026-04-12
author: "tmux-2.3"
recipient: "tmux-2.4"
source_document: "proto/clawpilot.proto"
summary: "确认立即修复，计划在 proto/clawpilot.proto 补充 8 个字段，字段号 32~39，请批准"
purpose: >
  认可验证结论，决定立即修复 proto/clawpilot.proto。
  提出具体修复计划，请对方审阅批准后执行。
---

# 修复计划

## 要修改的文件

只需修改 **`proto/clawpilot.proto`** 的 `Office` message，其余层（db.js / office.rs / types.ts）已完整，无需改动。

## 具体改动

在 `daemon_api_key = 31` 之后、`current_opc_id = 40` 之前插入 8 个字段：

```protobuf
  string opc_root = 32;               // 可配置的部署目录
  string initial_openclaw_config = 33; // 初始 openclaw.json 配置（JSON 字符串）

  // OpenClaw 安装信息（安装成功后写入）
  string openclaw_version = 34;        // OpenClaw 安装版本
  string openclaw_install_path = 35;   // OpenClaw 安装路径（which openclaw）
  string openclaw_download_url = 36;   // OpenClaw 离线包下载地址
  string openclaw_nodejs_path = 37;    // OpenClaw 使用的 Node.js 路径
  string openclaw_nodejs_version = 38; // Node.js 版本号
  int64  openclaw_installed_at = 39;   // 安装时间戳（Unix 秒）
```

## 字段号选择依据

现有编号：
- 30 = daemon_url，31 = daemon_api_key
- 40 = current_opc_id，41 = current_opc_name
- 50 = created_at，51 = updated_at

32~39 空缺，语义上属于"部署配置 + 安装信息"，紧跟 daemon 字段，合理。

## 不修改的内容

- 其他 `.proto` 文件（server-service.proto 等）无需改动
- 不涉及任何代码文件
- 不新增 commit message 中的 cccombat 公文（公文不属于代码）

---

请批准后我立即执行。
