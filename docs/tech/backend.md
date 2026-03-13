# 后端设计

## 定位

后端是**轻量的增值服务层**，核心功能全部在本地完成。后端只处理：
- 用户身份认证
- 付费订阅管理
- 自动化选择器配置下发
- 配置云同步
- 模板市场

**不处理任何 LLM 流量，不代理任何 API 请求。**

---

## 技术栈

```
语言      Python 3.12+
框架      FastAPI
数据库    PostgreSQL 16
缓存      Redis 7
部署      Docker + 阿里云 ECS
```

---

## API 模块

### 认证 `/auth`

```
POST /auth/sms/send          发送短信验证码
POST /auth/sms/verify        验证码登录 / 注册
POST /auth/wechat/qrcode     获取微信登录二维码
GET  /auth/wechat/callback   微信扫码回调
POST /auth/token/refresh     刷新 Access Token
DELETE /auth/session         退出登录
```

短信验证码存 Redis，TTL 5 分钟，同一手机号每分钟限 1 条。

---

### 选择器配置 `/selectors`

```
GET /selectors/latest        获取最新选择器配置（带版本号）
```

**响应示例：**
```json
{
  "version": "2026-03-13",
  "updated_at": "2026-03-13T10:00:00Z",
  "bailian": { ... },
  "volcengine": { ... },
  "feishu": { ... }
}
```

App 本地缓存版本号，`version` 未变化时直接用缓存。此接口不需要登录，但做 IP 频率限制防滥用。

---

### 订阅 & 支付 `/billing`

```
GET  /billing/plans          获取订阅套餐列表
POST /billing/order/wechat   创建微信支付订单
POST /billing/order/alipay   创建支付宝订单
GET  /billing/order/:id      查询订单状态
POST /billing/webhook/wechat 微信支付回调（验签）
POST /billing/webhook/alipay 支付宝回调（验签）
GET  /billing/subscription   查询当前订阅状态
```

---

### 配置云同步 `/sync`

```
GET  /sync/list              列出所有云端 OPC 快照
POST /sync/push              上传本地配置（加密）
GET  /sync/:id               下载指定快照
DELETE /sync/:id             删除快照
POST /sync/restore/:id       标记恢复（App 拉取后写入本地）
```

配置文件在客户端加密后上传，后端存储密文，无法读取内容。

---

### 模板市场 `/market`

```
GET  /market/templates       浏览模板（分页、分类、搜索）
GET  /market/templates/:id   模板详情
POST /market/templates       发布模板（需审核）
POST /market/templates/:id/download  下载模板（记录次数）
POST /market/templates/:id/rate      评分
GET  /market/categories      分类列表
```

---

## 数据模型（核心表）

```sql
-- 用户
users (
  id, phone, wechat_openid,
  created_at, last_login_at
)

-- 订阅
subscriptions (
  id, user_id, plan,
  status, started_at, expires_at
)

-- 订单
orders (
  id, user_id, amount, payment_method,
  status, paid_at, raw_callback
)

-- 云同步快照
sync_snapshots (
  id, user_id, opc_name, label,
  encrypted_content, created_at
)

-- 模板
templates (
  id, author_id, title, description,
  category, content, downloads,
  status, created_at
)

-- 选择器配置（后台管理，不暴露给用户）
selector_configs (
  id, platform, version,
  config_json, published_at
)
```

---

## 部署

```yaml
# docker-compose.yml 概览
services:
  api:
    image: clawpilot-backend
    env: [DATABASE_URL, REDIS_URL, SMS_KEY, WECHAT_KEY ...]

  postgres:
    image: postgres:16

  redis:
    image: redis:7-alpine

  nginx:
    # SSL 终止 + 反向代理
```

阿里云 ECS 单机部署即可支撑早期规模，后续按需扩容。

---

## 安全

- 所有接口 HTTPS
- JWT Access Token（15分钟）+ Refresh Token（30天，存 Redis 可主动失效）
- 短信验证码：Redis TTL + 频率限制（1次/分钟/手机号）
- 支付回调：验签后才更新订单状态
- 云同步内容：客户端 AES-256-GCM 加密，后端不持有密钥
- 选择器接口：IP 频率限制，防止竞争对手批量拉取
