# 安装物业 & 部署 OPC 设计

**创建日期**: 2026-03-20
**状态**: 设计定稿
**关联文档**: [remote-deployment.md](./remote-deployment.md) · [architecture.md](./architecture.md)

---

## 概念

| 术语 | 含义 |
|------|------|
| **OpenClaw** | AI Agent 运行时，安装在目标机器上 |
| **clawpilot-daemon** | ClawPilot 管理 API，跑在目标机器上，接收 ClawPilot 的远程指令 |
| **办公室 (Office)** | 一台已安装 OpenClaw 的机器 |
| **安装物业** | 在新机器上完成 OpenClaw + daemon 的初始化 |
| **部署 OPC** | 将公司配置（openclaw.json）推送到已安装物业的办公室 |

---

## 两件事的关系

```
[安装物业]  → 机器从 0 变成可用的 Office（一次性操作）
[部署 OPC]  → 将公司的 agents/channels 写入 Office，OpenClaw 热重载（可反复执行）
```

---

## 一、安装物业流程

### 步骤

```
Step 1  安装 OpenClaw 二进制
        curl -fsSL https://openclaw.ai/install.sh | bash

Step 2  注册系统服务
        openclaw onboard \
          --non-interactive \
          --install-daemon \    ← 唯一目的：注册 launchd / systemd
          --skip-skills \
          --skip-health \
          --accept-risk
        → macOS: launchd，label = ai.openclaw.gateway
        → Linux: systemd unit

Step 3  安装 clawpilot-daemon
        - 复制二进制到目标机器
        - 启动进程
        - 读取 ~/.clawpilot/daemon.key
        - 回填 daemon_url + daemon_api_key 到 offices 表

Step 4  健康检查
        openclaw doctor   →  验证 OpenClaw 配置合法
        GET daemon/health →  验证 daemon 在线
```

### 关键决策：onboard 不传 API Key

`openclaw onboard` 的 `--install-daemon` 仅用于注册操作系统服务。
**模型 Provider / API Key 不在 onboard 阶段配置**，原因：

- ClawPilot 的 `providers` 表已存储所有 LLM 配置
- 安装完成后立即写入 `openclaw.json`，OpenClaw 读取该文件启动
- 避免用户在安装向导里重复填写已有的 Key

### 平台差异

| 平台 | 服务方式 | 重启命令 |
|------|---------|---------|
| macOS | launchd (`~/Library/LaunchAgents/ai.openclaw.gateway.plist`) | `launchctl kickstart -k gui/$UID/ai.openclaw.gateway` |
| Linux | systemd | `systemctl --user restart openclaw-gateway` |
| Windows | 不支持 | — |

### SSH 远程安装

远程机器走 SSH 执行相同步骤：

```bash
# 1. 安装 OpenClaw
ssh user@host "curl -fsSL https://openclaw.ai/install.sh | bash"

# 2. 注册服务
ssh user@host "openclaw onboard --non-interactive --install-daemon --skip-skills --skip-health --accept-risk"

# 3. 上传并启动 clawpilot-daemon
scp clawpilot-daemon user@host:/tmp/
ssh user@host "sudo mv /tmp/clawpilot-daemon /usr/local/bin/ && chmod +x /usr/local/bin/clawpilot-daemon"
ssh user@host "nohup clawpilot-daemon --listen 0.0.0.0:8443 > /tmp/daemon.log 2>&1 &"

# 4. 读取 API Key
ssh user@host "cat ~/.clawpilot/daemon.key"
```

---

## 二、部署 OPC 流程

### 流程

```
ClawPilot App
  ├─ 读取 OPC + agents + channels + models（from DB）
  ├─ 生成 openclaw.json
  └─ POST clawpilot-daemon /deploy
        ├─ 备份旧 ~/.openclaw/openclaw.json → .json.bak
        ├─ 写入新配置
        ├─ 执行 openclaw doctor（验证）
        │   └─ 失败 → 回滚备份，返回错误
        └─ OpenClaw 自动热重载（无需重启服务）
```

### openclaw.json 生成映射

从 ClawPilot 数据库生成 OpenClaw 配置：

```
DB 来源                         → openclaw.json 字段
─────────────────────────────────────────────────────
agents 表
  agent.name (slug)             → agents.list[].name
  agent.display_name            → agents.list[].identity.name
  agent.initials                → agents.list[].identity.emoji
  agent.model_provider/name     → agents.list[].model.primary
  workspace 路径（见下方规范）  → agents.list[].workspace

providers 表
  provider.provider_type        → models.providers.<key>
  provider.base_url             → models.providers.<key>.baseUrl
  provider.api_key              → models.providers.<key>.apiKey（加密引用）

channels 表
  channel.channel_type          → channels.<type>
  channel.feishu_config         → channels.feishu.*
```

### Workspace 路径规范

```
~/.openclaw/CPOPC/<opc.display_name>/workspace-<agent.display_name>
```

示例：
```
~/.openclaw/CPOPC/互联网公司/workspace-产品经理
~/.openclaw/CPOPC/互联网公司/workspace-UX设计师
~/.openclaw/CPOPC/手机助手公司/workspace-客服专员
```

`agents.defaults.workspace` 指向 OPC 根目录：
```
~/.openclaw/CPOPC/<opc.display_name>
```

### 生成示例

OPC `互联网公司`，含两个 agent：

```json
{
  "agents": {
    "defaults": {
      "workspace": "~/.openclaw/CPOPC/互联网公司",
      "model": { "primary": "bailian/qwen-max" }
    },
    "list": [
      {
        "name": "pm",
        "workspace": "~/.openclaw/CPOPC/互联网公司/workspace-产品经理",
        "model": { "primary": "bailian/qwen-max" },
        "identity": { "name": "产品经理", "emoji": "PM" }
      },
      {
        "name": "ux",
        "workspace": "~/.openclaw/CPOPC/互联网公司/workspace-UX设计师",
        "model": { "primary": "volcengine/doubao-pro" },
        "identity": { "name": "UX设计师", "emoji": "UX" }
      }
    ]
  },
  "channels": {
    "feishu": {
      "appId": "cli_xxx",
      "appSecret": { "source": "env", "id": "FEISHU_APP_SECRET" }
    }
  },
  "models": {
    "providers": {
      "bailian": {
        "baseUrl": "https://dashscope.aliyuncs.com/compatible-mode/v1",
        "apiKey": { "source": "env", "id": "BAILIAN_API_KEY" }
      }
    }
  }
}
```

### 热重载范围

OpenClaw 对以下变更**无需重启**（热重载）：

- agents、channels、models、hooks、cron、sessions、tools

以下变更**需要重启**：

- gateway server settings（port、TLS、auth）

---

## 三、办公室生命周期

```
新建
  │
  ▼
[未安装]          dame_url = null，daemon_api_key = null
  │
  │  安装物业
  ▼
[已安装·空跑]     openclaw running，默认只有 main agent（正常状态）
  │               daemon online，api_key 已写入 offices 表
  │  部署 OPC
  ▼
[运行中]          multi-agent，有公司配置，channels 接入
  │
  │  重新部署 / 更新配置
  ▼
[运行中]          覆盖 openclaw.json，热重载，服务不中断
```

**注意**：刚安装完 openclaw 只有一个 `main` agent，这是正常的。
首次部署 OPC 时才会写入完整的多 agent 配置。

---

## 四、待实现清单

| 模块 | 内容 | 优先级 | 状态 |
|------|------|--------|------|
| `server/routes/office.js` | `install_openclaw` 路由（本机 + SSH） | P0 | TODO |
| `server/routes/office.js` | `install_daemon` 路由 | P0 | 已实现 |
| `server/routes/deployment.js` | `generate_openclaw_config`（OPC → JSON） | P0 | TODO |
| `daemon/src/routes.rs` | `/deploy` 接收 openclaw.json，写文件 + 备份 + doctor 验证 + 热重载 | P0 | TODO |
| `OfficePage.tsx` | `InstallPropertyModal` 两步向导（Step1: OpenClaw，Step2: daemon） | P1 | TODO（当前只有 daemon 步骤） |
| `DeployPage.tsx` | 打通「生成配置 → 推送 → 确认热重载」 | P1 | TODO |

---

## 五、参考

- [OpenClaw 安装文档](https://docs.openclaw.ai/install)
- [openclaw onboard CLI 参考](https://docs.openclaw.ai/cli/onboard)
- [openclaw.json 配置参考](https://docs.openclaw.ai/gateway/configuration)
- [macOS launchd 管理](https://docs.openclaw.ai/platforms/mac/child-process)
- [ClawPilot 远程部署架构](./remote-deployment.md)
