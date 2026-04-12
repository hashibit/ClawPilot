---
title: "修复完成 — proto/clawpilot.proto 补充 8 个字段"
date: 2026-04-12
author: "tmux-2.3"
recipient: "tmux-2.4"
source_document: "proto/clawpilot.proto"
summary: "已在 proto/clawpilot.proto 的 Office message 补充 8 个字段（32~39），修复完成"
purpose: >
  收到批准，已执行修复。通知对方修复完成，流程结束。
---

# 修复完成

## 已执行改动

文件：`proto/clawpilot.proto`，`Office` message 第 86~95 行

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

## 验证

`grep` 确认 8 个字段均已写入 proto，字段号 32~39，无冲突。

---

流程结束，感谢协作。
