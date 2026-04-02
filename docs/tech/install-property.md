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
ssh user@host "nohup clawpilot-daemon --listen 0.0.0.0:16668 > /tmp/daemon.log 2>&1 &"

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

## 四、办公室管理 UI 交互

### 4.1 页面结构

办公室管理页（`src/pages/OfficePage.tsx`）采用三栏布局：

```
┌──────────────┬─────────────────────────────────────────┐
│  左栏        │  右栏（详情/编辑）                        │
│  办公室列表  │                                           │
│  ──────────  │  工具栏: [办公室名] [取消][保存][删除]    │
│  🏢 北京办公室 │                                         │
│  🏢 上海办公室 │  § 基本信息                              │
│  🏢 远程EC2  │  § 门禁与前台                             │
│              │  § Daemon 部署配置  ← 安装物业入口         │
│  ──────────  │  § 当前部署                               │
│  + 添加办公室 │  § 部署历史                              │
└──────────────┴─────────────────────────────────────────┘
```

### 4.2 创建办公室

**触发**：点击左栏底部「+ 添加办公室」按钮

**行为**：
1. 立即在数据库创建记录（默认名称「新办公室 N」，ownership=RENTED，grade=MEDIUM）
2. 列表滚动到新条目并自动选中
3. 右栏进入编辑状态，等待用户填写信息

**Office 数据模型**：

| 字段 | 类型 | 说明 |
|------|------|------|
| `id` | uuid | 主键 |
| `name` | string | 办公室名称 |
| `address` | string | `localhost`（本机）或 IP/域名（远程） |
| `access_card` | string | SSH 密钥名 / 登录账号（门禁卡隐喻） |
| `phone` | string | 联系电话 |
| `receptionist_image` | string | 前台形象图 URL |
| `ownership` | RENTED/OWNED | 租用/自有 |
| `monthly_rent` | number | 月租金 |
| `internet_speed` | string | 网速描述（如 1000Mbps） |
| `decoration_grade` | HIGH/MEDIUM/LOW | 装修档次 |
| `description` | string | 备注 |
| `daemon_url` | string | clawpilot-daemon HTTP 端点 |
| `daemon_api_key` | string | daemon API Key（服务端加密） |
| `current_opc_id` | string | 当前部署的 OPC（JOIN 只读） |
| `current_opc_name` | string | 当前部署的 OPC 名称（JOIN 只读） |

**地址模式切换**：

- 选择「本机」→ address 写为 `localhost`，IP 输入框禁用
- 选择「远程」→ IP 输入框启用，填写云主机 IP 或域名

### 4.3 Daemon 部署配置区域

位于右栏第三个 section，包含：

```
§ Daemon 部署配置  [在线 · v0.1.2]    [安装物业]  [检测连接]
┌──────────────────────────────────────────────────────┐
│ Daemon URL  │ http://127.0.0.1:16668                  │
│ API Key     │ ••••••••••••••••••••••••••             │
│ (未配置时使用仿真模式，不会实际部署到服务器)           │
└──────────────────────────────────────────────────────┘
```

**「检测连接」按钮**：
- 调用 `check_daemon_health(daemon_url, daemon_api_key)`
- 成功 → 标题行出现绿色 badge「在线 · v0.1.2」，并在 group 底部展示 OpenClaw 运行状态（PID、任务数）
- 失败 → 红色 badge「离线: 连接失败」

**「安装物业」按钮**：
- 打开 `InstallDaemonModal`（见 4.4）
- 安装成功后 daemon_url + daemon_api_key 自动回填到表单
- 页面提示「配置已自动写入办公室，点击保存生效」

### 4.4 安装物业 Modal（当前实现）

> **注意**：当前 Modal 仅安装 clawpilot-daemon，尚未包含 OpenClaw 安装步骤。
> 完整流程见 4.5「目标交互设计」。

**当前 Modal 结构**：

```
┌─────────────────────────────────────────┐
│ 安装物业                              × │
│ 将 daemon 安装到 XXX 并获取 API Key     │
├─────────────────────────────────────────┤
│ [🖥 本机安装]  [🌐 SSH 远程]            │
│                                         │
│ 监听端口  [16668]  默认 16668             │
│                                         │
│ (SSH 模式下展示)                        │
│ ┌─────────────────────────────────────┐ │
│ │ 主机地址  [____________]            │ │
│ │ SSH端口 [22]  用户名 [root]         │ │
│ │ SSH密钥  [留空则使用~/.ssh/id_rsa]  │ │
│ │ 需要 sudo 权限以写入 /usr/local/bin │ │
│ └─────────────────────────────────────┘ │
│                                         │
│ [        开始安装        ]              │
│                                         │
│ (安装中/完成后显示日志终端)             │
│ ┌─────────────────────────────────────┐ │
│ │ 🔍 查找 daemon 二进制...            │ │
│ │ ✅ 找到: /path/to/binary            │ │
│ │ 🚀 启动 daemon...                   │ │
│ │ ✅ Daemon 已就绪                    │ │
│ │ 🔑 API Key 已读取                   │ │
│ │ 💾 配置已自动保存                   │ │
│ └─────────────────────────────────────┘ │
│                                         │
│ (成功后显示结果卡片)                     │
│ ┌─────────────────────────────────────┐ │
│ │ ✅ 安装成功                         │ │
│ │ Daemon URL  http://127.0.0.1:16668   │ │
│ │ API Key     abc123...               │ │
│ │ 配置已自动写入办公室，点击保存生效   │ │
│ └─────────────────────────────────────┘ │
├─────────────────────────────────────────┤
│                              [关闭]     │
└─────────────────────────────────────────┘
```

### 4.5 目标交互设计（InstallPropertyModal 完整版）

当前 Modal 需升级为两步向导，补充 OpenClaw 安装步骤：

```
┌─────────────────────────────────────────┐
│ 安装物业                              × │
│ 在 XXX 上安装 OpenClaw 并配置管理服务   │
├─────────────────────────────────────────┤
│                                         │
│  ① 安装 OpenClaw  ──  ② 安装 Daemon   │
│  ●─────────────────────○               │
│                                         │
│  Step 1: 安装 OpenClaw                  │
│  ┌──────────────────────────────────┐  │
│  │ 安装模式  [🖥 本机]  [🌐 SSH远程] │  │
│  │                                  │  │
│  │ (SSH模式) 主机/端口/用户/密钥     │  │
│  └──────────────────────────────────┘  │
│                                         │
│  [     开始安装 OpenClaw      ]         │
│                                         │
│  (安装日志...)                           │
│                                         │
├─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ┤
│                                         │
│  Step 2: 安装 clawpilot-daemon          │
│  ┌──────────────────────────────────┐  │
│  │ 监听端口  [16668]                  │  │
│  └──────────────────────────────────┘  │
│                                         │
│  [     开始安装 Daemon        ]         │
│                                         │
│  (安装日志 + 结果...)                    │
│                                         │
├─────────────────────────────────────────┤
│                              [关闭]     │
└─────────────────────────────────────────┘
```

**交互规则**：
- Step 1 完成后 Step 2 自动启用（按钮从 disabled 变为可点击）
- 两步可独立重试，互不影响
- SSH 配置（host/port/user/key）在两步之间共享，只填一次
- 全部完成后 daemon_url + api_key 自动回填表单，提示保存

### 4.6 当前部署 & 部署历史区域

**当前部署**：只读，显示该办公室当前运行的 OPC 名称（JOIN opc_config 表）。

**部署历史**：展示 `office_deployments` 表记录，每条包含：
- 状态 badge（运行中/已撤销）
- OPC 名称
- 部署时间 → 撤销时间

---

## 五、待实现清单

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
