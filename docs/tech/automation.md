# 自动化方案

## 核心思路

ClawPilot 使用 Tauri 内嵌的**系统原生 Webview**（macOS: WKWebView，Windows: WebView2）来实现对阿里百炼、火山方舟、飞书开放平台的引导式自动化操作。

---

## 为什么不会触发反爬

传统爬虫检测的是 headless 浏览器特征（`navigator.webdriver`、缺失插件等），而 Tauri 使用的是系统原生 Webview：

- **不是 headless Chrome**，没有任何 headless 标记
- 流量特征与普通用户开浏览器完全一致
- 本质是「帮助真实用户在自己账号下完成操作」，不是批量爬取

---

## 自动化执行架构

### 主路径：CSS 选择器

```rust
// Tauri 向 Webview 注入 JavaScript 执行操作
webview.eval(r#"
    document.querySelector('#submit-btn').click();
"#)?;
```

快速、可靠、零成本。选择器由后端维护（见下文）。

### 降级路径：LLM 视觉理解

当选择器找不到元素（三方平台改版）时，自动降级：

```
截取 Webview 当前截图
  → 发送给用户配置的 LLM（携带用户自己的 Key）
  → LLM 返回：当前页面状态描述 + 建议下一步操作
  → 转换为具体 DOM 操作执行
  → 失败则提示用户手动操作
```

LLM 作为**兜底**，不是主路径，避免不必要的 token 消耗。

---

## 选择器配置维护

### 问题
三方平台（阿里云、飞书）会不定期改版，硬编码选择器会失效。

### 解法：选择器配置从后端拉取

**后端维护一份 JSON 配置：**
```json
{
  "version": "2026-03-13",
  "bailian": {
    "login_detected": "a[href*='/overview']",
    "coding_plan_url": "https://bailian.console.aliyun.com/xxx",
    "purchase_btn": ".buy-now-button",
    "apikey_create_btn": "#create-apikey",
    "apikey_value": ".apikey-display code"
  },
  "feishu": {
    "create_app_btn": "[data-testid='create-app']",
    "app_name_input": "input[placeholder*='应用名称']",
    "permission_search": ".permission-search input",
    "publish_btn": ".publish-version-btn"
  }
}
```

**App 拉取策略：**
- 启动时检查本地缓存版本
- 每日后台静默拉取一次
- 自动化流程启动前强制拉取最新版

**好处：** 三方平台改版后，只需更新后端配置，所有用户的 App 在下次拉取后自动修复，**无需发版**。

---

## 各平台自动化流程

### 阿里百炼 Coding Plan

```
1. 打开 Webview → https://bailian.console.aliyun.com
2. 等待用户登录（监听 URL 变化至控制台主页）
3. 导航到 Coding Plan 购买页
4. 高亮显示购买按钮，等待用户点击确认
5. 监听支付完成
6. 导航到 API Key 管理页
7. 点击「创建 Key」
8. 提取生成的 Key 值
9. 写入本地 models.json5，关闭 Webview
```

### 飞书 Bot 自动配置

```
前置：用户在 ClawPilot 填写 Bot 名字和描述

1. 打开 Webview → https://open.feishu.cn/app
2. 等待用户扫码登录
3. 点击「创建企业自建应用」
4. 填入 Bot 名字 + 描述
5. 进入「权限管理」，依次开启：
   - im:message（接收 / 发送消息）
   - im:message:send_as_bot（Bot 发送消息）
   - im:chat（获取群信息）
   - contact:contact.base:readonly（识别用户）
6. 进入「事件订阅」，选择 WebSocket 长连接模式
7. 进入「发布」，点击发布应用
8. 提取 App ID + App Secret
9. 写入本地 channels.json5，关闭 Webview
```

---

## 异常处理

| 情况 | 处理方式 |
|------|---------|
| 选择器找不到元素 | 降级到 LLM 视觉识别 |
| LLM 也无法判断 | 暂停自动化，提示用户手动操作当前步骤 |
| 网络超时 | 重试 3 次，超时后提示用户 |
| 三方平台新增验证步骤 | 暂停，等待用户完成，继续后续步骤 |
| 用户中途取消 | 清理临时状态，保留已完成步骤的结果 |
