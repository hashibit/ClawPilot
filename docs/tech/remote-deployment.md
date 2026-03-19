# 部署架构设计

**创建日期**: 2026-03-19  
**更新日期**: 2026-03-19  
**状态**: 设计中  
**作者**: 技术总监

---

## 概述

本文档描述 ClawPilot 的统一部署架构，支持**本地部署**和**远程部署**两种场景，采用统一的 Daemon 代理模式。

---

## 架构设计

### 统一 Daemon 架构

```
┌────────────────────────────────────────────────────────────────┐
│                     ClawPilot Tauri App                        │
│                        (Controller)                            │
│                    配置管理 / 部署包生成                        │
└────────────────────────────────────────────────────────────────┘
                              │
                              │ HTTP/HTTPS
                              ▼
┌────────────────────────────────────────────────────────────────┐
│                      Deploy Daemon                             │
│                   (本地 localhost / 远程服务器)                  │
│                                                                │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐        │
│  │  接收部署包   │  │  备份配置    │  │  重载进程    │        │
│  └──────────────┘  └──────────────┘  └──────────────┘        │
└────────────────────────────────────────────────────────────────┘
                              │
                              │ 文件系统 + 进程信号
                              ▼
┌────────────────────────────────────────────────────────────────┐
│                        OpenClaw                                │
│                     (OPC 运行时)                                 │
└────────────────────────────────────────────────────────────────┘
```

### 核心组件

| 组件 | 位置 | 职责 |
|------|------|------|
| **ClawPilot Tauri App** | 用户本地 (Mac/PC) | 配置管理、部署包生成、UI 交互 |
| **Deploy Daemon** | 本地或远程服务器 | 接收部署包、备份配置、重载 OpenClaw |
| **OpenClaw** | 与 Daemon 同机 | 实际运行的 OPC 运行时 |

### 两种部署场景

#### 场景 A: 本地部署 (同机)

```
ClawPilot App (Tauri, macOS)
       │
       │ HTTP → http://localhost:8443/deploy
       ▼
Local Daemon (launchd 服务)
       │
       │ 文件系统 + 进程信号
       ▼
OpenClaw (同机)
```

**特点**:
- Daemon 监听 `127.0.0.1:8443` (仅本地访问)
- Tauri App 启动时自动注册并启动 Daemon
- API Key 自动生成并存储在 `~/.clawpilot/daemon.key`
- 适用于个人开发者、小团队测试

---

#### 场景 B: 远程部署 (EC2/云服务器)

```
ClawPilot App (Tauri, 本地 Mac)
       │
       │ 1. SSH 登录远程服务器
       │ 2. scp 上传部署包到 /tmp/
       │ 3. SSH 执行：curl localhost:8443/deploy ...
       ▼
Remote Daemon (systemd 服务，监听 127.0.0.1:8443)
       │
       │ 文件系统 + 进程信号
       ▼
OpenClaw (EC2)
```

**特点**:
- Daemon 监听 `127.0.0.1:8443` (**永不暴露到公网**)
- 通过 **SSH 隧道** 间接调用 Daemon API
- 用户通过安装脚本手动部署 Daemon
- API Key 安装时生成，用户一次性复制
- 适用于企业客户、生产环境、多办公室

**安全优势**:
- ✅ 无需开放防火墙端口
- ✅ SSH 密钥 + API Key 双重认证
- ✅ SSH 隧道天然加密传输
- ✅ 攻击面最小化

---

## 技术选型

### 通信协议

**HTTP/HTTPS + multipart/form-data**

- 简单，无需额外依赖
- 防火墙友好 (标准 80/443 端口)
- 易于调试和测试
- 支持大文件上传
- **本地/远程统一**: 同样的协议，不同的监听地址

### Daemon 技术栈

- **语言**: Rust (与 OpenClaw 一致)
- **HTTP 框架**: axum (tokio 生态)
- **进程管理**: `nix` crate (发送信号)
- **压缩**: `flate2` (gzip/tar)
- **跨平台**: macOS (launchd) + Linux (systemd)

### 统一架构优势

| 优势 | 说明 |
|------|------|
| **代码统一** | 本地/远程共用同一套 Daemon 代码 |
| **测试简单** | 只需测试 Daemon，无需测试两套部署逻辑 |
| **安全一致** | 本地也用 API Key，避免权限漏洞 |
| **易于扩展** | 从本地迁移到远程只需改 URL |
| **进程隔离** | Tauri App 崩溃不影响 Daemon (部署中的任务) |
| **升级维护** | 升级 Daemon 即可，无需升级 Tauri App |

### 部署包格式

**完整的离线部署包** — 包含 OPC 运行所需的所有数据和配置

```
deployment-package.tar.gz
├── manifest.json              # 元数据 (opc_id, version, checksum)
├── config/
│   ├── opc.json              # OPC 基础配置
│   ├── agents.json           # Agent 列表
│   ├── models.json           # 模型 Provider 配置
│   ├── channels.json         # 渠道配置
│   ├── bindings.json         # 绑定规则
│   └── tools.json            # 工具元数据（引用 skills/ 目录）
├── agents/                   # Agent 文档
│   └── {agent_id}/
│       ├── SOUL.md
│       ├── IDENTITY.md
│       ├── AGENTS.md
│       ├── USER.md
│       ├── MEMORY.md
│       ├── HEARTBEAT.md
│       └── TOOLS.md
└── skills/                   # 技能目录（完整离线包）
    └── {skill_slug}/
        ├── SKILL.md          # 技能定义（必需）
        ├── index.js          # 技能入口
        ├── package.json      # 依赖配置
        └── ...               # 其他文件
```

**设计原则**:
- ✅ **完整离线**: 部署包包含所有必要数据，无需联网
- ✅ **自包含**: 不依赖外部服务（ClawHub 等）
- ✅ **技能目录**: 技能以目录形式存储，包含完整实现
- ✅ **可审计**: 所有配置和数据都可追溯
- ✅ **可回滚**: 保留历史版本，随时恢复

---

## API 设计

### Daemon API

#### POST /deploy

接收部署包并启动部署流程。

**Request**:
```http
POST /deploy HTTP/1.1
Content-Type: multipart/form-data; boundary=xxx
Authorization: Bearer <api_key>

--xxx
Content-Disposition: form-data; name="manifest"
Content-Type: application/json

{
  "opc_id": "media-company",
  "version": "2026-03-19T11:50:00Z",
  "checksum": "sha256:abc123..."
}
--xxx
Content-Disposition: form-data; name="package"
Content-Type: application/gzip

<binary tar.gz data>
--xxx--
```

**Response**:
```json
{
  "task_id": "deploy-xxx-yyy-zzz",
  "status": "accepted",
  "message": "部署任务已接受"
}
```

#### GET /deploy/:task_id

查询部署任务状态。

**Response**:
```json
{
  "task_id": "deploy-xxx-yyy-zzz",
  "status": "running",
  "progress": 60,
  "current_step": "备份配置",
  "logs": [
    "[11:50:01] 开始部署",
    "[11:50:02] 验证签名通过",
    "[11:50:03] 备份当前配置到 ~/.openclaw/backup/2026-03-19T11:50:03Z",
    "[11:50:04] 解压配置文件..."
  ],
  "error": null,
  "started_at": "2026-03-19T11:50:01Z",
  "completed_at": null
}
```

#### POST /rollback

回滚到上一个部署版本。

**Request**:
```json
{
  "opc_id": "media-company"
}
```

**Response**:
```json
{
  "task_id": "rollback-xxx-yyy-zzz",
  "status": "accepted",
  "message": "回滚任务已接受"
}
```

#### GET /health

健康检查端点。

**Response**:
```json
{
  "status": "ok",
  "uptime_seconds": 86400,
  "version": "0.1.0",
  "openclaw_status": "running",
  "openclaw_pid": 12345
}
```

---

## 部署流程

### 完整流程

```
┌──────────┐    ┌───────────┐    ┌──────────┐    ┌───────────┐
│ClawPilot │    │  Daemon   │    │OpenClaw  │    │  文件系统  │
└────┬─────┘    └─────┬─────┘    └────┬─────┘    └─────┬─────┘
     │                │                │                 │
     │ POST /deploy   │                │                 │
     │───────────────>│                │                 │
     │                │                │                 │
     │                │ 验证 API Key   │                 │
     │                │                │                 │
     │                │ 解析部署包     │                 │
     │                │                │                 │
     │                │ 备份当前配置 ──>│                 │
     │                │                │                 │
     │                │ 写入新配置  ───────────────────>│
     │                │                │                 │
     │                │ 发送 SIGHUP ──>│                 │
     │                │                │                 │
     │                │                │ 重载配置        │
     │                │                │                 │
     │                │ 健康检查    ──>│                 │
     │                │                │                 │
     │ {task_id}      │                │                 │
     │<───────────────│                │                 │
     │                │                │                 │
     │ GET /status    │                │                 │
     │───────────────>│                │                 │
     │                │                │                 │
     │ {status:ok}    │                │                 │
     │<───────────────│                │                 │
     │                │                │                 │
```

### 步骤详解

1. **生成部署包** (ClawPilot)
   - 从数据库读取 OPC 完整配置
   - 生成 manifest.json (包含 opc_id, version, checksum)
   - 打包为 tar.gz 格式
   - 可选：使用私钥签名

2. **上传部署包** (ClawPilot → Daemon)
   - HTTP POST multipart/form-data
   - 携带 API Key 认证
   - 接收 task_id

3. **验证与备份** (Daemon)
   - 验证 API Key
   - 验证部署包完整性 (checksum)
   - 可选：验证签名
   - 备份当前配置到 `~/.openclaw/backup/{timestamp}/`

4. **更新配置** (Daemon)
   - 解压部署包
   - 覆盖 `~/.openclaw/OPC/{opc_id}/` 目录
   - 更新文件权限

5. **重载服务** (Daemon → OpenClaw)
   - 读取 PID 文件 (`~/.openclaw/openclaw.pid`)
   - 发送 `SIGHUP` 信号 (优雅重载)
   - 或发送 `SIGTERM` + 重启 (完全重启)

6. **健康检查** (Daemon)
   - 等待 2-3 秒
   - 检查 OpenClaw 进程是否存活
   - 可选：调用 OpenClaw 健康检查端点

7. **清理** (Daemon)
   - 保留最近 N 个备份 (默认 5 个)
   - 删除临时文件
   - 更新任务状态

8. **结果返回** (Daemon → ClawPilot)
   - 部署成功/失败
   - 完整日志
   - 错误信息 (如有)

---

## 数据库扩展

### offices 表

```sql
-- 新增字段
ALTER TABLE offices ADD COLUMN daemon_url TEXT;
ALTER TABLE offices ADD COLUMN daemon_api_key TEXT;  -- 加密存储
ALTER TABLE offices ADD COLUMN daemon_version TEXT;
```

| 字段 | 说明 | 示例 |
|------|------|------|
| daemon_url | Daemon HTTP 端点 | `https://deploy.bj.example.com:8443` |
| daemon_api_key | 认证密钥 (加密) | `enc:aes256:xxx...` |
| daemon_version | Daemon 版本号 | `0.1.0` |

### deployment_tasks 表

```sql
-- 新增字段
ALTER TABLE deployment_tasks ADD COLUMN daemon_task_id TEXT;
ALTER TABLE deployment_tasks ADD COLUMN remote_logs TEXT;  -- JSON 数组
ALTER TABLE deployment_tasks ADD COLUMN backup_path TEXT;
```

---

## 安全设计

### 认证与授权

1. **API Key 认证**
   - 每个办公室配置独立的 API Key
   - Key 通过加密存储在数据库
   - 请求时通过 `Authorization: Bearer <key>` 传递

2. **IP 白名单** (可选)
   - Daemon 配置只接受特定 IP 的请求
   - 通过防火墙或应用层实现

3. **签名验证** (可选)
   - ClawPilot 使用私钥签名部署包
   - Daemon 使用公钥验证完整性

### 传输安全

- **强制 HTTPS**: 部署包包含敏感配置，必须加密传输
- **证书验证**: ClawPilot 验证 Daemon 的 TLS 证书
- **双向 TLS** (可选): Daemon 也验证客户端证书

### 审计日志

Daemon 记录所有部署操作:
```json
{
  "timestamp": "2026-03-19T11:50:00Z",
  "action": "deploy",
  "opc_id": "media-company",
  "client_ip": "203.0.113.1",
  "task_id": "deploy-xxx",
  "result": "success",
  "duration_ms": 3500
}
```

---

## 容错与回滚

### 失败场景处理

| 场景 | 处理方式 |
|------|---------|
| 网络中断 | 支持断点续传，超时重试 (最多 3 次) |
| 部署包损坏 | 验证 checksum 失败，拒绝部署 |
| 配置验证失败 | 部署前验证 schema，失败拒绝 |
| OpenClaw 启动失败 | 自动回滚到上一个备份版本 |
| Daemon 崩溃 | systemd 自动重启，任务状态标记为 failed |

### 回滚机制

```bash
# 备份目录结构
~/.openclaw/backup/
├── 2026-03-19T10:00:00Z/
├── 2026-03-19T11:00:00Z/
└── 2026-03-19T12:00:00Z/  ← 当前

# 回滚命令
POST /rollback
{
  "opc_id": "media-company",
  "target_version": "2026-03-19T11:00:00Z"  // 可选，默认上一个
}
```

---

## 实现计划

### Phase 1: Daemon 基础框架 (3 小时)

| Task | 内容 | 优先级 |
|------|------|--------|
| 1.1 | 创建 Rust 项目 `daemon/` | P0 |
| 1.2 | 实现 HTTP server (axum) | P0 |
| 1.3 | 实现 `/deploy` 端点 (接收文件) | P0 |
| 1.4 | 实现 `/health` 端点 | P0 |
| 1.5 | 实现配置备份逻辑 | P0 |
| 1.6 | 实现 OpenClaw 进程重载 | P0 |
| 1.7 | 实现 API Key 认证中间件 | P0 |
| 1.8 | 跨平台启动脚本 (launchd + systemd) | P0 |

### Phase 2: Tauri App 集成 (2.5 小时)

| Task | 内容 | 优先级 |
|------|------|--------|
| 2.1 | 实现部署包生成逻辑 (tar.gz + manifest) | P0 |
| 2.2 | 实现 HTTP 上传 (multipart/form-data) | P0 |
| 2.3 | 实现部署状态轮询 | P0 |
| 2.4 | 前端 UI 显示部署进度 | P0 |
| 2.5 | Daemon 自动安装/启动 (macOS) | P0 |
| 2.6 | API Key 自动管理 (本地读取/远程输入) | P0 |

### Phase 3: 远程部署支持 (1.5 小时)

| Task | 内容 | 优先级 |
|------|------|--------|
| 3.1 | 办公室 Daemon 配置 (URL + API Key) | P0 |
| 3.2 | HTTPS 支持 (自签名证书 + 正式证书) | P0 |
| 3.3 | 远程部署状态轮询 | P0 |
| 3.4 | 日志流式返回 | P1 |
| 3.5 | 断点续传/重试机制 | P2 |

### Phase 4: 安全与优化 (2 小时)

| Task | 内容 | 优先级 |
|------|------|--------|
| 4.1 | 部署包签名验证 | P1 |
| 4.2 | IP 白名单配置 | P1 |
| 4.3 | 审计日志 | P1 |
| 4.4 | 回滚功能 | P1 |
| 4.5 | 多办公室批量部署 | P2 |

**总计**: 约 **9 小时** 完成完整功能

---

## 远程部署流程

### 完整交互过程

```
┌─────────────────┐                              ┌─────────────────┐
│  ClawPilot App  │                              │   远程服务器    │
│    (本地 Mac)   │                              │   (EC2/机房)    │
└────────┬────────┘                              └────────┬────────┘
         │                                               │
         │  1. 生成部署包 (tar.gz)                       │
         │     /tmp/deploy-xxx.tar.gz                    │
         │                                               │
         │  2. scp 上传                                  │
         │     deploy-xxx.tar.gz ──────────────────────> │ /tmp/
         │                                               │
         │  3. SSH 执行部署命令                          │
         │     curl -X POST localhost:8443/deploy \      │
         │       -H "Authorization: Bearer xxx" \        │
         │       -F "manifest=@..." \                    │
         │       -F "package=@/tmp/deploy-xxx.tar.gz"    │
         │ ───────────────────────────────────────────>  │
         │                                               │
         │                                               │ Daemon 处理
         │                                               │ - 验证 API Key
         │                                               │ - 备份配置
         │                                               │ - 解压部署包
         │                                               │ - SIGHUP OpenClaw
         │                                               │
         │  4. 返回 task_id                              │
         │     { "task_id": "xxx" } <──────────────────  │
         │                                               │
         │  5. 轮询状态 (SSH)                            │
         │     curl localhost:8443/deploy/xxx            │
         │ ───────────────────────────────────────────>  │
         │                                               │
         │  6. 返回最终状态                              │
         │     { "status": "success" } <──────────────── │
         │                                               │
```

**关键设计**:
- Daemon **永远监听** `127.0.0.1:8443`，不暴露到公网
- 所有远程调用通过 **SSH 隧道** 间接执行
- 无需配置防火墙规则

---

## 安装与配置

### macOS (本地开发)

```bash
# 安装 ClawPilot App (包含 Daemon 二进制)
brew install clawpilot

# Tauri App 首次启动时自动:
# 1. 复制 Daemon 二进制到 ~/.clawpilot/daemon
# 2. 注册 launchd 服务
# 3. 生成 API Key 并保存到 ~/.clawpilot/daemon.key
# 4. 启动 Daemon (监听 localhost:8443)

# 手动管理 Daemon
clawpilot daemon start    # 启动
clawpilot daemon stop     # 停止
clawpilot daemon status   # 查看状态
clawpilot daemon restart  # 重启
clawpilot daemon logs     # 查看日志
```

**launchd 配置**: `~/Library/LaunchAgents/com.clawpilot.daemon.plist`

```xml
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
    <key>Label</key>
    <string>com.clawpilot.daemon</string>
    <key>ProgramArguments</key>
    <array>
        <string>/Users/username/.clawpilot/daemon</string>
        <string>--listen</string>
        <string>127.0.0.1:8443</string>
    </array>
    <key>RunAtLoad</key>
    <true/>
    <key>KeepAlive</key>
    <true/>
</dict>
</plist>
```

---

### Linux (远程服务器)

**方式一：手动安装 (推荐 MVP)**

```bash
# 1. SSH 登录远程服务器
ssh user@ec2-xxx.com

# 2. 下载 Daemon 二进制
curl -fsSL https://clawpilot.ai/releases/daemon/latest \
  -o /tmp/clawpilot-daemon
chmod +x /tmp/clawpilot-daemon
sudo mv /tmp/clawpilot-daemon /usr/local/bin/

# 3. 注册 systemd 服务
sudo curl -fsSL https://clawpilot.ai/releases/daemon/clawpilot-daemon.service \
  -o /etc/systemd/system/clawpilot-daemon.service

# 4. 启动服务 (自动生成 API Key)
sudo systemctl enable clawpilot-daemon
sudo systemctl start clawpilot-daemon

# 5. 查看 API Key (一次性复制)
sudo journalctl -u clawpilot-daemon -n 50 | grep "API Key"
# 输出：Generated new API Key → abc123...

# 6. 验证 Daemon 运行
sudo systemctl status clawpilot-daemon
curl -H "Authorization: Bearer abc123..." http://localhost:8443/health
```

**方式二：一键安装脚本**

```bash
# SSH 登录后执行
curl -fsSL https://clawpilot.ai/install-daemon.sh | sudo bash

# 脚本自动完成上述所有步骤，并输出 API Key
```

**手动管理 Daemon**:
```bash
sudo systemctl start clawpilot-daemon
sudo systemctl stop clawpilot-daemon
sudo systemctl status clawpilot-daemon
sudo journalctl -u clawpilot-daemon -f  # 查看日志
```

**systemd 配置**: `/etc/systemd/system/clawpilot-daemon.service`

```ini
[Unit]
Description=ClawPilot Deploy Daemon
After=network.target

[Service]
Type=simple
User=root
ExecStart=/usr/local/bin/clawpilot-daemon --listen 0.0.0.0:8443
Restart=always
RestartSec=5

[Install]
WantedBy=multi-user.target
```

---

### 防火墙配置

**远程服务器需要开放端口**:

```bash
# AWS EC2 (安全组)
# 添加入站规则：TCP 8443，来源限制为 ClawPilot App 所在 IP

# Ubuntu (ufw)
sudo ufw allow 8443/tcp
sudo ufw enable

# CentOS (firewalld)
sudo firewall-cmd --add-port=8443/tcp --permanent
sudo firewall-cmd --reload
```

---

## 监控与告警

### 监控指标

| 指标 | 说明 | 告警阈值 |
|------|------|---------|
| 部署成功率 | 成功部署次数 / 总部署次数 | < 95% |
| 部署平均耗时 | 从开始到完成的平均时间 | > 30s |
| Daemon 在线率 | Daemon 正常运行时间占比 | < 99% |
| OpenClaw 重启次数 | 异常重启次数 | > 3 次/小时 |

### 告警通知

部署完成后通过飞书/钉钉通知:

```
【部署通知】
OPC: 自媒体公司
办公室: 北京办公室 (本地) / 上海 EC2 (远程)
状态: ✅ 成功 / ❌ 失败
耗时: 3.5s
版本: 2026-03-19T11:50:00Z
Daemon: v0.1.0
```

---

## 部署配置示例

### 本地部署 (Tauri App 自动配置)

```json
// ~/.clawpilot/config.json
{
  "daemon": {
    "url": "http://127.0.0.1:8443",
    "api_key_file": "~/.clawpilot/daemon.key",
    "mode": "local"
  }
}
```

### 远程部署 (用户手动配置)

```json
// ~/.clawpilot/config.json
{
  "offices": [
    {
      "id": "office-bj-ec2",
      "name": "北京 EC2 办公室",
      "daemon": {
        "url": "https://ec2-52-xxx-xxx-xxx.compute.amazonaws.com:8443",
        "api_key": "enc:aes256:xxx...",  // 加密存储
        "mode": "remote",
        "skip_tls_verify": false  // 开发环境可设为 true
      }
    },
    {
      "id": "office-sh-ec2",
      "name": "上海 EC2 办公室",
      "daemon": {
        "url": "https://ec2-xxx.compute.cn-shanghai.aliyuncs.com:8443",
        "api_key": "enc:aes256:yyy...",
        "mode": "remote"
      }
    }
  ]
}
```

---

## Tauri App 集成

### App 启动流程

```rust
// Tauri 主进程
#[tauri::command]
async fn initialize_app() -> Result<(), String> {
    // 1. 检查 Daemon 是否已安装
    if !daemon_exists() {
        install_daemon()?;  // 复制二进制到 ~/.clawpilot/
    }
    
    // 2. 检查 Daemon 是否运行
    if !is_daemon_running() {
        start_daemon()?;  // launchctl load
    }
    
    // 3. 等待 Daemon 就绪
    wait_for_daemon_health("http://127.0.0.1:8443")?;
    
    // 4. 获取 API Key
    let api_key = read_or_generate_api_key()?;
    
    // 5. 设置全局配置
    set_daemon_config("http://127.0.0.1:8443", &api_key)?;
    
    Ok(())
}
```

### 部署调用 (统一接口)

```rust
// 本地和远程使用同样的部署函数
async fn deploy_to_daemon(
    opc_id: &str,
    daemon_url: &str,
    api_key: &str
) -> Result<DeployResult> {
    // 1. 生成部署包
    let package = generate_deployment_package(opc_id)?;
    
    // 2. 构建 multipart 请求
    let form = reqwest::multipart::Form::new()
        .text("manifest", serde_json::to_string(&package.manifest)?)
        .part("package", reqwest::multipart::Part::bytes(package.buffer));
    
    // 3. 发送 HTTP 请求
    let response = reqwest::Client::new()
        .post(format!("{}/deploy", daemon_url))
        .bearer_auth(api_key)
        .multipart(form)
        .send()
        .await?;
    
    // 4. 解析响应
    let result: DeployResponse = response.json().await?;
    Ok(result)
}
```

---

## 未来扩展

1. **灰度发布**: 先部署到测试办公室，验证后再推生产
2. **批量部署**: 同时部署到多个办公室 (并行/串行可配置)
3. **定时部署**: 支持计划任务 (如凌晨 2 点自动部署)
4. **Daemon 自更新**: Daemon 也支持通过部署包更新自己
5. **多 OPC 支持**: 一个 Daemon 管理多个 OPC 实例 (不同目录)
6. **部署审批流**: 生产环境部署需要 Boss 审批
7. **蓝绿部署**: 双 OpenClaw 实例，无缝切换

---

## 参考文档

- [数据库设计](./database-design.md)
- [开发计划](./development-plan.md)
- [架构设计](./architecture.md)
