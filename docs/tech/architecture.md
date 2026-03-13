# 技术架构

## 整体结构

```
┌─────────────────────────────────────────────────┐
│                 ClawPilot App                    │
│              Tauri（Rust + React）               │
│                                                  │
│  ┌──────────────┐    ┌────────────────────────┐  │
│  │  Web 前端    │    │     Rust 后端（本地）   │  │
│  │  React       │◄──►│  文件读写 / 进程管理    │  │
│  │  shadcn/ui   │    │  LLM 调用 / 配置解析   │  │
│  └──────────────┘    └────────────────────────┘  │
└───────────────────────┬─────────────────────────┘
                        │ 读写本地文件 / 控制进程
                        ▼
              ~/.openclaw/（OpenClaw 配置目录）

                        │ HTTP API（付费功能）
                        ▼
┌─────────────────────────────────────────────────┐
│              ClawPilot 后端服务                  │
│                  FastAPI（Python）               │
│                                                  │
│  /auth      手机号认证 / 微信登录                │
│  /selectors 自动化脚本选择器配置                 │
│  /sync      配置云同步                           │
│  /market    模板市场                             │
│  /billing   微信支付 / 支付宝                    │
└─────────────────────────────────────────────────┘
```

---

## 客户端（Tauri）

### 技术选型
- **框架**：Tauri v2
- **前端**：React + TypeScript + shadcn/ui
- **Rust 侧**：文件系统操作、进程管理、HTTP 调用

### Rust 侧职责
```
文件操作    读写 json5 / markdown 配置文件
进程管理    检测 OpenClaw 是否运行、启动、重启
LLM 调用    直接调用用户配置的 provider API（streaming）
自动化      控制内嵌 Webview 执行购买 / 飞书配置流程
配置解析    json5 序列化 / 反序列化
```

### 关键 Rust 依赖
```toml
json5          = "0.4"       # json5 解析
serde          = "1"         # 序列化
reqwest        = "0.12"      # HTTP 客户端（LLM 调用）
tokio          = "1"         # 异步运行时
sysinfo        = "0.30"      # 进程检测
notify         = "6"         # 文件目录监听
tauri          = "2"
```

### 前端职责
- 所有 UI 渲染
- 状态管理（Zustand）
- 通过 Tauri `invoke` 调用 Rust 命令
- 组织图可视化（React Flow 或类似库）

---

## LLM 调用方式

ClawPilot **不提供也不代理 LLM**，直接用用户自己的 provider：

```
用户配置的 provider（百炼 / 火山方舟 / MiniMax）
         ↑
ClawPilot Rust 侧直接调用（生成配置时）

OpenClaw 运行时直接调用（与 ClawPilot 无关）
```

支持 streaming 响应，生成过程实时展示在 UI 中。

---

## 后端服务

### 技术选型
- **框架**：FastAPI（Python 3.12+）
- **数据库**：PostgreSQL
- **缓存**：Redis（短信验证码、限流、session）
- **部署**：Docker + 阿里云 ECS

### 服务职责（轻量）

后端**不处理 LLM 流量**，只做：

| 模块 | 职责 |
|------|------|
| 认证 | 手机号 + 短信验证码、微信 OAuth |
| 选择器配置 | 维护自动化脚本的 CSS 选择器，供 App 拉取 |
| 配置云同步 | 存储 / 下发用户的 OPC 配置文件 |
| 模板市场 | 模板 CRUD、审核、搜索 |
| 支付 | 微信支付 / 支付宝订单管理 |

### Python 关键依赖
```
fastapi              HTTP 框架
sqlalchemy[asyncio]  ORM
alembic              数据库迁移
redis                缓存
alibabacloud-dysmsapi 阿里云短信
wechatpayv3          微信支付
alipay-sdk-python    支付宝
httpx                HTTP 客户端
```

---

## 数据流

### 本地功能（无网络）
```
用户操作 UI
  → React 调用 Tauri invoke
  → Rust 读写 ~/.openclaw/ 目录
  → 重启 OpenClaw 进程
```

### 生成 Agent 配置
```
用户描述角色
  → Rust 调用用户 provider API（携带用户 Key）
  → streaming 响应实时渲染
  → 生成结果写入配置文件
```

### 自动化购买流程
```
用户点击「引导购买」
  → 打开内嵌 Webview
  → App 从后端拉取最新选择器配置
  → 主路径：CSS 选择器自动化操作
  → 降级路径：截图 → LLM 判断 → 继续操作
  → 提取 API Key → 写入本地配置
```

### 云同步
```
用户点击「同步」
  → Rust 读取本地配置文件
  → 加密后上传到后端
  → 其他设备拉取 → 解密写入本地
```

---

## 安全考量

- API Key 存储在本地系统 Keychain（不存明文）
- 云同步的配置文件端到端加密，后端不存明文
- 自动化流程中不存储用户的三方平台账号密码
- 后端 JWT 有效期短，配合 Refresh Token 机制
