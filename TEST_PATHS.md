# ClawPilot 功能路径清单

> 版本：0.1.0 | 更新：2026-03-22 | 路由模式：HashRouter (`/#/`)

---

## 目录

1. [页面导航路径总览](#1-页面导航路径总览)
2. [侧边栏 (Layout)](#2-侧边栏-layout)
3. [数据概览 /overview](#3-数据概览-overview)
4. [子公司管理 /opc](#4-子公司管理-opc)
5. [智能体管理 /agents](#5-智能体管理-agents)
6. [飞书频道绑定 /bindings](#6-飞书频道绑定-bindings)
7. [模型管理 /providers](#7-模型管理-providers)
8. [办公室管理 /office](#8-办公室管理-office)
9. [一键部署 /deploy](#9-一键部署-deploy)
10. [运行日志 /logs](#10-运行日志-logs)
11. [设置 /settings](#11-设置-settings)
12. [弹窗 / 对话框汇总](#12-弹窗--对话框汇总)
13. [完整交互流程](#13-完整交互流程)

---

## 1. 页面导航路径总览

```
启动应用
  └── /#/overview (默认重定向)
      ├── /#/opc
      │   └── → /#/agents  (点击"管理智能体"链接)
      │   └── → /#/bindings (点击"管理频道"链接)
      │   └── → /#/office  (点击"管理办公室"链接)
      ├── /#/agents
      ├── /#/bindings
      ├── /#/providers
      ├── /#/office
      ├── /#/deploy
      ├── /#/logs
      ├── /#/settings
      ├── /# (模板市场 — PRO, 未实现)
      └── /# (云同步 — PRO, 未实现)
```

---

## 2. 侧边栏 (Layout)

位置：所有页面持久显示

### 2.1 顶部工具栏

| # | 元素 | 类型 | 行为 | 显示条件 |
|---|------|------|------|----------|
| 1 | ClawPilot Logo | 静态 | — | 展开时 |
| 2 | 收起菜单 `«` | Button | 侧边栏折叠（width: 204px → 48px） | !collapsed |
| 3 | 展开菜单 `»` | Button | 侧边栏展开 | collapsed |

### 2.2 导航项

| # | 标签 | 分组 | 路由 | 类型 |
|---|------|------|------|------|
| 1 | 数据概览 | 核心功能 | `/#/overview` | NavLink |
| 2 | 子公司管理 | 核心功能 | `/#/opc` | NavLink |
| 3 | 智能体管理 | 核心功能 | `/#/agents` | NavLink |
| 4 | 飞书频道绑定 | 核心功能 | `/#/bindings` | NavLink |
| 5 | 模型管理 | 基础设施 | `/#/providers` | NavLink |
| 6 | 办公室管理 | 基础设施 | `/#/office` | NavLink |
| 7 | 一键部署 | 部署与监控 | `/#/deploy` | NavLink |
| 8 | 运行日志 | 部署与监控 | `/#/logs` | NavLink |
| 9 | 模板市场 PRO | 高级功能 | `#` | 锚点（未实现） |
| 10 | 云同步 PRO | 高级功能 | `#` | 锚点（未实现） |
| 11 | 设置 | — | `/#/settings` | NavLink |

### 2.3 状态区（底部）

| # | 元素 | 类型 | 行为 | 显示条件 |
|---|------|------|------|----------|
| 1 | OpenClaw 运行状态点 | 静态 | 绿色=运行/灰色=停止 | 始终 |
| 2 | 状态文字 + PID + 运行时长 | 静态 | — | !collapsed |
| 3 | 启动服务 | Button | 调用 `startOpenclaw()` | !is_running |
| 4 | 停止服务 | Button | 调用 `stopOpenclaw()` | is_running |
| 5 | 操作中… | Button（disabled） | — | acting |

**注**：侧边栏状态每 **10 秒**自动轮询刷新。

---

## 3. 数据概览 `/overview`

### 3.1 工具栏

| # | 元素 | 类型 | 行为 |
|---|------|------|------|
| 1 | 今天 | Button（tbtn-ghost） | ⚠️ 未实现 |
| 2 | 本周 | Button（tbtn-ghost） | ⚠️ 未实现 |
| 3 | 本月 | Button（tbtn-accent） | ⚠️ 未实现 |

**注**：进程状态每 **5 秒**自动轮询刷新。

### 3.2 OpenClaw 进程区

| # | 元素 | 类型 | 行为 | 显示条件 |
|---|------|------|------|----------|
| 1 | 启动 | Button（绿色） | `handleProcAction('start')` | !is_running |
| 2 | 重载配置 | Button（ghost） | `handleProcAction('reload')` | is_running |
| 3 | 停止 | Button（红色） | `handleProcAction('stop')` | is_running |

### 3.3 统计卡片（只读）

- 公司总数、智能体总数、飞书频道、今日消息（实时统计）

### 3.4 消息趋势区

| # | 元素 | 类型 | 行为 |
|---|------|------|------|
| 1 | 查看详情 | Button（文字链） | ⚠️ 未实现 |

---

## 4. 子公司管理 `/opc`

布局：左列（列表）+ 右列（详情）

### 4.1 列表列（COL2）

| # | 元素 | 类型 | 行为 | 显示条件 |
|---|------|------|------|----------|
| 1 | OPC 行 | ListRow | `selectOpc(opc)` → 选中并展示详情 | 始终 |
| 2 | 创建新OPC公司 | Button（tbtn-ghost） | `setShowCreate(true)` → 弹出创建弹窗 | 底部固定 |

**创建弹窗（CreateModal）**：

| # | 元素 | 类型 | 必填 |
|---|------|------|------|
| 1 | 英文名称 | text input | ✅ |
| 2 | 显示名称 | text input | ✅ |
| 3 | 描述 | text input | 可选 |
| 4 | 主题色（5 个预设） | 色块按钮 | — |
| 5 | 取消 | Button | — |
| 6 | 创建 | Button（disabled: saving） | — |

### 4.2 详情列（COL3）

| # | 元素 | 类型 | 行为 | 显示条件 |
|---|------|------|------|----------|
| 1 | 导出 JSON | Button | `handleExport(selected)` → 下载 JSON 文件 | selected 存在 |
| 2 | 删除公司 | Button（红色） | `handleDelete(selected)` → `window.confirm` | selected 存在 |
| 3 | 管理智能体 | Link | `→ /#/agents` | 始终 |
| 4 | 管理飞书频道 | Link | `→ /#/bindings` | 始终 |
| 5 | 管理办公室 | Link | `→ /#/office` | 始终 |
| 6 | 下线此公司 | Button（链接样式） | `setConfirmOffline(selected)` → 弹出确认框 | is_running && office_id 存在 |

**下线确认弹窗（ConfirmOfflineModal）**：

| # | 元素 | 类型 | 行为 |
|---|------|------|------|
| 1 | 取消 | Button | `setConfirmOffline(null)` |
| 2 | 确认下线 | Button（红色） | `handleUndeploy(confirmOffline)` |

### 4.3 快照管理（COL3 底部）

| # | 元素 | 类型 | 行为 | 备注 |
|---|------|------|------|------|
| 1 | 快照备注输入框 | text input | 输入快照名称；Enter 触发创建 | — |
| 2 | 创建快照 | Button | `handleCreateSnapshot()` | disabled: !snapshotLabel.trim() |
| 3 | 恢复快照 | Button（每行） | `window.confirm` → `handleRestoreSnapshot(snap)` | — |
| 4 | 删除快照 ×  | Button（每行） | `window.confirm` → `handleDeleteSnapshot(snap)` | — |

---

## 5. 智能体管理 `/agents`

布局：顶部智能体条 + 主编辑区（三列滚动布局）

### 5.1 智能体选择条（水平滚动）

| # | 元素 | 类型 | 行为 |
|---|------|------|------|
| 1 | 智能体头像卡片 | 卡片按钮 | `handleSelectAgent(agent)` → 选中，高亮紫色 |
| 2 | 添加 + | Button | `handleAddAgent()` → 创建新智能体草稿 |
| 3 | 拖拽重排 | Drag Handle | `handleDragStart/Over/End` → 重排后保存顺序 |

### 5.2 编辑工具栏

| # | 元素 | 类型 | 行为 | 显示条件 |
|---|------|------|------|----------|
| 1 | 测试对话 | Button | `setChatAgent(selectedAgent)` → 打开聊天抽屉 | !isNewAgent && SOUL.md 非空 |
| 2 | 设为领队 | Button（tbtn-ghost） | `handleSetDefault(selectedAgent)` | !is_default && !editing |
| 3 | 编辑 | Button | `setEditing(true)` | !editing |
| 4 | 取消 | Button | `setEditing(false)` → 丢弃修改 | editing |
| 5 | 保存智能体 | Button（紫色） | `handleSaveAgent()` | editing |
| 6 | 删除 | Button（红色） | `setConfirmDelete(selected)` → 弹出确认框 | !editing |

**删除确认弹窗（ConfirmDeleteModal）**：

| # | 元素 | 类型 | 行为 |
|---|------|------|------|
| 1 | 取消 | Button | `setConfirmDelete(null)` |
| 2 | 确认删除 | Button（红色） | `handleDeleteAgent(confirmDelete)` |

### 5.3 AI 快速生成区

| # | 元素 | 类型 | 行为 | 显示条件 |
|---|------|------|------|----------|
| 1 | AI 提示词 | text input | Enter 触发生成 | editing |
| 2 | AI 生成 | Button（紫色） | `handleAiGenerate()` | editing && !aiGenerating && prompt 非空 |

### 5.4 基本信息区（需编辑模式）

| # | 字段 | 类型 | disabled 条件 |
|---|------|------|--------------|
| 1 | 显示名称 | text input | !editing |
| 2 | 英文标识 | text input | !editing |
| 3 | 简介 | textarea（2行） | !editing |
| 4 | 职位名称 | text input | !editing |

### 5.5 模型与工具配置区（需编辑模式）

| # | 元素 | 类型 | 行为 |
|---|------|------|------|
| 1 | 模型选择 | select（按 provider 分组） | 更新 model_provider + model_name |
| 2 | 工具权限 | Toggle 按钮（每个工具） | `toggleTool(tool.id)` 启用/禁用 |
| 3 | 自定义工具输入框 | text input | Enter → 添加到工具列表 |

### 5.6 技能配置区（需编辑模式）

| # | 元素 | 类型 | 行为 |
|---|------|------|------|
| 1 | 添加技能 | Button | `setSkillModalOpen(true)` → 打开技能选择弹窗 |
| 2 | 技能卡片 × 删除 | Button（每个技能） | `handleFormChange('enabled_skills', ...)` 移除 |

**技能选择弹窗（SkillModal）**：

| # | 元素 | 类型 | 行为 |
|---|------|------|------|
| 1 | 技能列表 | 可选列表 | 选中技能 |
| 2 | 关闭 | Button / 点击遮罩 | `setSkillModalOpen(false)` |

### 5.7 护栏规则区（需编辑模式）

| # | 元素 | 类型 | 行为 |
|---|------|------|------|
| 1 | 允许规则输入框 | TagInput（绿色标签） | Enter 添加；× 删除标签 |
| 2 | 禁止规则输入框 | TagInput（红色标签） | Enter 添加；× 删除标签 |

### 5.8 人格文档区

| # | 元素 | 类型 | 行为 |
|---|------|------|------|
| 1 | SOUL Tab | Tab 按钮 | `setActiveDocTab('SOUL')` |
| 2 | IDENTITY Tab | Tab 按钮 | `setActiveDocTab('IDENTITY')` |
| 3 | AGENTS Tab | Tab 按钮 | `setActiveDocTab('AGENTS')` |
| 4 | USER Tab | Tab 按钮 | `setActiveDocTab('USER')` |
| 5 | MEMORY Tab | Tab 按钮 | `setActiveDocTab('MEMORY')` |
| 6 | HEARTBEAT Tab | Tab 按钮 | `setActiveDocTab('HEARTBEAT')` |
| 7 | 文档编辑区 | textarea（12行） | 编辑 Markdown 文档内容 |
| 8 | 保存文档 | Button | `handleSaveDoc()` 独立保存文档（无需保存智能体） |

### 5.9 聊天测试抽屉（ChatDrawer）

| # | 元素 | 类型 | 行为 |
|---|------|------|------|
| 1 | 消息输入框 | text input | Enter 发送消息 |
| 2 | 发送 | Button | 调用对话 API |
| 3 | 关闭 ✕ | Button | `setChatAgent(null)` |

---

## 6. 飞书频道绑定 `/bindings`

布局：左列（渠道配置）+ 中列（群组列表）+ 右列（群组详情）

### 6.1 渠道选择区（COL2 顶部）

| # | 元素 | 类型 | 行为 |
|---|------|------|------|
| 1 | FEISHU 按钮 | Toggle | `setChannelType('FEISHU')` |
| 2 | DINGTALK 按钮 | Toggle | `setChannelType('DINGTALK')` |
| 3 | SLACK 按钮 | Toggle | `setChannelType('SLACK')` |
| 4 | 重新配置 / 关闭配置 | Button | `setChannelEditing(!channelEditing)` |

### 6.2 渠道配置表单（channelEditing = true）

**飞书（Feishu）**：

| # | 字段 | 类型 |
|---|------|------|
| 1 | App ID | text input |
| 2 | App Secret | password input |

**钉钉（DingTalk）**：

| # | 字段 | 类型 |
|---|------|------|
| 1 | App Key | text input |
| 2 | App Secret | password input |
| 3 | Webhook URL | text input |

**Slack**：

| # | 字段 | 类型 |
|---|------|------|
| 1 | Bot Token | password input |
| 2 | Signing Secret | password input |

**操作按钮**：

| # | 元素 | 类型 | 行为 |
|---|------|------|------|
| 1 | 保存配置 | Button（紫色） | `handleSaveChannel()` |
| 2 | 测试连接 | Button（ghost） | `handleTestConnection()` |

### 6.3 群组列表（COL2/COL3 中）

| # | 元素 | 类型 | 行为 |
|---|------|------|------|
| 1 | 群组行 | ListRow | `handleSelectBinding(binding)` → 选中，右侧显示详情 |
| 2 | 添加群组绑定 ＋ | Button | `handleAddBinding()` → 新建绑定草稿并选中 |

### 6.4 群组详情（COL4 右侧，需选中群组）

**查看模式**：

| # | 元素 | 类型 | 行为 |
|---|------|------|------|
| 1 | 编辑 | Button | `setBindingEditing(true)` |
| 2 | 删除 | Button（红色） | `handleDeleteBinding(selectedBinding.id)` |

**编辑模式**：

| # | 字段/元素 | 类型 | 行为 |
|---|---------|------|------|
| 1 | 群组名称 | text input | 更新 bindingForm.name |
| 2 | 群组 ID | text input | 更新 bindingForm.chat_id |
| 3 | 群组类型 | select（GROUP/DM） | 更新 bindingForm.binding_type |
| 4 | 关联智能体 | select（agent 列表） | 更新 bindingForm.agent_id + agent_name |
| 5 | 触发模式 | select（MENTION/ALL） | 更新 bindingForm.trigger_mode |
| 6 | 启用状态 | 自定义 Toggle | `handleFormChange('is_enabled', !v)` |
| 7 | 取消 | Button | `handleCancelBinding()` |
| 8 | 保存 | Button（紫色） | `handleSaveBinding()` |

---

## 7. 模型管理 `/providers`

布局：Provider 卡片 + 模型列表

### 7.1 Bailian Provider 卡片

| # | 元素 | 类型 | 行为 | 显示条件 |
|---|------|------|------|----------|
| 1 | 编辑配置 | Button | `setEditingBailian(true)` | !editingBailian |
| 2 | 测试连接 | Button | `handleTest()` | !editingBailian && configured |

**编辑配置表单（editingBailian = true）**：

| # | 字段/元素 | 类型 | 行为 |
|---|---------|------|------|
| 1 | Base URL | text input | 更新 baseUrl（`urlOk` 实时验证） |
| 2 | API Key | password input | 更新 apiKey（`keyOk` 实时验证） |
| 3 | Coding Plan 快速填入 | Button | `setBaseUrl('https://coding.dashscope...')` |
| 4 | 按量计费 快速填入 | Button | `setBaseUrl('https://dashscope.ali...')` |
| 5 | 保存 | Button（紫色） | `handleSave(config)` （多项 disabled 条件） |
| 6 | 取消 | Button | `onCancel()` |

**实时验证提示**：
- ⚠️ 黄色警告：URL 与 API Key 格式不匹配（`mismatch = true`）
- 💡 紫色提示：当前 URL 格式说明

### 7.2 模型列表（只读）

- 展示所有可用模型：名称、上下文长度、输入价格、能力标签（无交互）

---

## 8. 办公室管理 `/office`

布局：左列（列表）+ 右列（详情）

### 8.1 办公室列表（COL2）

| # | 元素 | 类型 | 行为 |
|---|------|------|------|
| 1 | 办公室行 | ListRow | `handleSelect(office)` → 选中 |
| 2 | 添加办公室 ＋ | Button | `handleAdd()` → 新建草稿 |

### 8.2 编辑工具栏（COL3 顶部）

| # | 元素 | 类型 | 行为 | 显示条件 |
|---|------|------|------|----------|
| 1 | 编辑 | Button | `setEditing(true)` | !editing |
| 2 | 取消 | Button | `setEditing(false)` → 丢弃 | editing |
| 3 | 保存 | Button（紫色） | `handleSave()` | editing |
| 4 | 删除 | Button（红色） | `handleDelete(selected.id)` → `window.confirm` | !editing |

### 8.3 基本信息表单（需编辑模式）

| # | 字段 | 类型 | 显示条件 |
|---|------|------|----------|
| 1 | 办公室名称 | text input | — |
| 2 | 本机 | Toggle 按钮 | — |
| 3 | 远程 | Toggle 按钮 | — |
| 4 | 远程地址 | text input | addressMode = true（远程） |
| 5 | 用户名密码 认证 | Toggle 按钮 | addressMode = true |
| 6 | SSH 私钥 认证 | Toggle 按钮 | addressMode = true |
| 7 | 用户名 | text input | addressMode = true && authType = password |
| 8 | 密码 | password input | addressMode = true && authType = password |
| 9 | SSH 私钥路径 | text input | addressMode = true && authType = ssh |
| 10 | 装修档次：高 | Toggle 按钮 | — |
| 11 | 装修档次：中 | Toggle 按钮 | — |
| 12 | 装修档次：低 | Toggle 按钮 | — |
| 13 | 前台形象 | text input | — |
| 14 | 备注 | textarea（2行） | — |

### 8.4 物业信息区（只读）

| # | 元素 | 类型 | 行为 | 显示条件 |
|---|------|------|------|----------|
| 1 | 刷新健康状态 | Button（ghost） | `checkDaemon(selected)` | selected.daemon_url 存在 |
| 2 | 安装最新物业 | Button（紫色） | `handleInstallLatest()` | !installing |
| 3 | 安装中… | Button（disabled） | — | installing |
| 4 | 收起日志 | Button | 清空 installLogs | installLogs.length > 0 |

---

## 9. 一键部署 `/deploy`

### 9.1 工具栏

| # | 元素 | 类型 | 行为 | 显示条件 |
|---|------|------|------|----------|
| 1 | 立即部署 | Button（紫色） | `handleDeploy()` | !deploying && canDeploy |
| 2 | 取消部署 | Button（红色） | `handleCancel()` | deploying |

**`canDeploy` 条件**：selectedOpcId 非空 && selectedOfficeId 非空 && selectedOffice.daemon_url 存在

### 9.2 部署配置区

| # | 元素 | 类型 | 行为 | 禁用条件 |
|---|------|------|------|----------|
| 1 | 选择子公司 | select | `handleOpcChange(val)` → 更新 opcId + 重置 officeId | — |
| 2 | 选择办公室 | select | 更新 selectedOfficeId | !selectedOpcId |

**警告提示**（条件显示）：
- ⚠️ 所选办公室未安装物业（selectedOffice.daemon_url 为空）
- ⚠️ 暂无空闲办公室（freeOffices.length = 0）

### 9.3 部署进度区（deploying = true）

- **进度条**：width 动画（0 → 100%）
- **步骤卡片**（4 列网格）：
  - 状态图标（✓完成 / ✗失败 / ⏳进行中）
  - 每个步骤名 + 子状态文字

**无可点击元素（只读）**

### 9.4 运行中子公司区

| # | 元素 | 类型 | 行为 |
|---|------|------|------|
| 1 | 撤销部署 | Button（每行） | `handleUndeploy(opc)` |

### 9.5 最近部署记录区（只读）

- 每行显示：状态徽章、OPC名、办公室名、相对时间
- **无交互元素**

---

## 10. 运行日志 `/logs`

### 10.1 日志流工具栏

| # | 元素 | 类型 | 行为 | 显示条件 |
|---|------|------|------|----------|
| 1 | 实时指示器（绿点 + 直播） | 静态 | — | !cleared |
| 2 | 清空 | Button（ghost） | `handleClear()` → 暂停更新，清空显示 | !cleared |
| 3 | 恢复 | Button（ghost） | `handleResume()` → 重新拉取日志 | cleared |

**自动更新**：每 **3 秒**拉取最新 200 条日志；自动滚动到底部

### 10.2 过滤面板（右侧固定 168px）

| # | 元素 | 类型 | 行为 |
|---|------|------|------|
| 1 | INFO Checkbox | mac-check | `toggleLevel('INFO')` |
| 2 | WARN Checkbox | mac-check | `toggleLevel('WARN')` |
| 3 | ERROR Checkbox | mac-check | `toggleLevel('ERROR')` |
| 4 | DEBUG Checkbox | mac-check | `toggleLevel('DEBUG')` |
| 5 | SYSTEM Checkbox | mac-check | `toggleLevel('SYSTEM')` |
| 6 | 组件名称搜索 | text input | `setFilterComponent(val)` 实时过滤 |
| 7 | 级别选择器 | select（全部/INFO/WARN/…） | `setFilterLevel(val)` |

---

## 11. 设置 `/settings`

### 11.1 语言选择（16 个按钮网格）

| # | 语言 | 代码 | 行为 | RTL |
|---|------|------|------|-----|
| 1 | 简体中文 | zh-CN | `setLanguage('zh-CN')` | — |
| 2 | 繁體中文 | zh-TW | `setLanguage('zh-TW')` | — |
| 3 | English | en | `setLanguage('en')` | — |
| 4 | 日本語 | ja | `setLanguage('ja')` | — |
| 5 | 한국어 | ko | `setLanguage('ko')` | — |
| 6 | Français | fr | `setLanguage('fr')` | — |
| 7 | Deutsch | de | `setLanguage('de')` | — |
| 8 | Español | es | `setLanguage('es')` | — |
| 9 | Português | pt | `setLanguage('pt')` | — |
| 10 | Русский | ru | `setLanguage('ru')` | — |
| 11 | العربية | ar | `setLanguage('ar')` | ✅ RTL |
| 12 | हिन्दी | hi | `setLanguage('hi')` | — |
| 13 | Bahasa Indonesia | id | `setLanguage('id')` | — |
| 14 | ไทย | th | `setLanguage('th')` | — |
| 15 | Tiếng Việt | vi | `setLanguage('vi')` | — |
| 16 | Italiano | it | `setLanguage('it')` | — |

副作用：
- 更新 `localStorage['clawpilot_lang']`
- 更新 `document.documentElement.dir`（ar → `rtl`，其他 → `ltr`）
- 更新 `document.documentElement.lang`

### 11.2 主题设置（只读）

- 当前仅深色主题，无切换功能

### 11.3 关于（只读）

- ClawPilot Logo + 版本号（0.1.0）

---

## 12. 弹窗 / 对话框汇总

| # | 弹窗名称 | 触发页面 | 触发方式 | 确认操作 | 取消操作 |
|---|---------|---------|---------|---------|---------|
| 1 | 创建 OPC 弹窗 | OpcPage | 点击"创建新OPC公司" | 调用 `createOpc()` | `setShowCreate(false)` |
| 2 | OPC 下线确认弹窗 | OpcPage | 点击"下线此公司" | `handleUndeploy(opc)` | `setConfirmOffline(null)` |
| 3 | 删除智能体确认弹窗 | AgentsPage | 点击"删除" | `handleDeleteAgent(agent)` | `setConfirmDelete(null)` |
| 4 | 技能选择弹窗 | AgentsPage | 点击"添加技能" | 选择并关闭 | `setSkillModalOpen(false)` |
| 5 | 聊天测试抽屉 | AgentsPage | 点击"测试对话" | — | `setChatAgent(null)` |
| 6 | 浏览器 confirm | OpcPage | 删除 OPC | `handleDelete()` | 取消（浏览器原生） |
| 7 | 浏览器 confirm | OpcPage | 恢复/删除快照 | 相应操作 | 取消 |
| 8 | 浏览器 confirm | OfficePage | 删除办公室 | `handleDelete()` | 取消 |

---

## 13. 完整交互流程

### 流程 1：创建新 OPC 公司

```
侧边栏 → 点击"子公司管理"
  └── 列表列底部 → 点击"创建新OPC公司"
      └── CreateModal 打开
          ├── 输入英文名称（必填）
          ├── 输入显示名称（必填）
          ├── 输入描述（可选）
          ├── 选择主题色（5 个预设之一）
          └── 点击"创建"
              ├── success → Toast "创建成功" + 列表刷新
              └── error → Toast 错误信息
```

### 流程 2：配置智能体

```
侧边栏 → 点击"智能体管理"
  └── 智能体条 → 点击"添加 +"（或选择已有智能体）
      └── 工具栏 → 点击"编辑"
          ├── 填写基本信息（名称/标识/简介/职位）
          ├── 选择模型（provider + model）
          ├── 启用/禁用工具权限
          ├── 添加/删除技能
          ├── 配置护栏规则（允许/禁止列表）
          ├── 切换文档 Tab → 编辑 SOUL.md 等文档
          │   └── 点击"保存文档"（独立保存）
          └── 点击"保存智能体"
              ├── success → Toast "已保存"
              └── error → Toast 错误信息
```

### 流程 3：AI 快速生成智能体人格

```
AgentsPage → 编辑模式下
  └── AI 生成区 → 输入描述（如"专业客服，擅长解决技术问题"）
      └── 点击"AI 生成" 或 Enter
          ├── aiGenerating = true（按钮 disabled）
          ├── 调用 AI 接口生成 SOUL.md 内容
          └── 填充到文档编辑区
```

### 流程 4：绑定飞书群组

```
侧边栏 → 点击"飞书频道绑定"
  ├── 选择渠道类型（FEISHU/DINGTALK/SLACK）
  ├── 点击"重新配置" → 展开配置表单
  │   ├── 填写 App ID + App Secret
  │   └── 点击"保存配置" / "测试连接"
  └── 群组列表 → 点击"添加绑定 +"
      └── 右侧详情面板（编辑模式）
          ├── 输入群组名称
          ├── 输入群组 ID
          ├── 选择群组类型（GROUP/DM）
          ├── 选择关联智能体
          ├── 选择触发模式（MENTION/ALL）
          ├── 切换启用状态 Toggle
          └── 点击"保存"
```

### 流程 5：部署 OPC 公司

```
前提：OPC 已创建 + 办公室已安装物业

侧边栏 → 点击"一键部署"
  ├── 选择子公司（下拉）
  ├── 选择办公室（下拉，仅显示空闲的）
  ├── 确认无警告提示
  └── 点击"立即部署"
      ├── deploying = true
      ├── 进度条动画 + 步骤卡片实时更新（每 2 秒轮询）
      │   步骤：连接验证 → 配置生成 → 文件传输 → 服务启动 → 健康检查
      ├── status = 'SUCCESS' → 进度完成，可查看运行中列表
      └── status = 'FAILED' → 错误高亮，可重新部署
```

### 流程 6：测试智能体对话

```
AgentsPage → 选中智能体（已有 SOUL.md）
  └── 工具栏 → 点击"测试对话"
      └── ChatDrawer 打开（右侧抽屉）
          ├── 消息输入框 → 输入消息
          ├── Enter 或点击发送
          ├── 查看 AI 回复
          └── 点击 ✕ 关闭
```

### 流程 7：查看和过滤日志

```
侧边栏 → 点击"运行日志"
  ├── 日志流实时更新（每 3 秒，自动滚动到底）
  ├── 右侧过滤面板：
  │   ├── 勾选/取消 INFO/WARN/ERROR/DEBUG/SYSTEM
  │   ├── 输入组件名过滤
  │   └── 选择日志级别
  ├── 点击"清空" → 暂停更新
  └── 点击"恢复" → 重新拉取日志
```

### 流程 8：OPC 快照与恢复

```
OpcPage → 选中某个 OPC
  └── 快照管理区（详情面板底部）
      ├── 输入快照备注 → 点击"创建快照" 或 Enter
      ├── 快照列表中 → 点击某个"恢复"按钮
      │   └── window.confirm → 确认 → 恢复该快照
      └── 点击某个"×"删除按钮
          └── window.confirm → 确认 → 删除该快照
```

### 流程 9：安装物业（Daemon）

```
OfficePage → 选中某个远程办公室
  └── 物业信息区
      ├── 点击"刷新" → 检查 daemon 健康状态
      └── 点击"安装最新物业"
          ├── installStep: idle → openclaw → daemon → done
          ├── installLogs 实时追加
          └── 点击"收起" → 清空日志
```

### 流程 10：切换界面语言

```
侧边栏 → 点击"设置"
  └── 语言设置区 → 点击任意语言按钮
      ├── 界面立即切换（React re-render）
      ├── localStorage['clawpilot_lang'] 更新
      ├── document.documentElement.lang 更新
      └── 若选 ar（阿拉伯语）：
          └── document.documentElement.dir = 'rtl' → 布局翻转
```

---

## 附录：元素统计

| 页面 | 按钮 | 输入框 | Select | Checkbox | Modal/Drawer |
|------|------|--------|--------|----------|--------------|
| Layout（侧边栏） | 14 | 0 | 0 | 0 | 0 |
| Overview | 4 | 0 | 0 | 0 | 0 |
| OpcPage | 10 | 3 | 0 | 0 | 2 |
| AgentsPage | 30+ | 8 | 2 | 0 | 3 |
| BindingsPage | 15 | 7 | 4 | 0 | 0 |
| ProvidersPage | 6 | 2 | 0 | 0 | 0 |
| OfficePage | 12 | 6 | 0 | 0 | 0 |
| DeployPage | 5 | 0 | 2 | 0 | 0 |
| LogsPage | 3 | 1 | 1 | 5 | 0 |
| SettingsPage | 16 | 0 | 0 | 0 | 0 |
| **合计** | **~115** | **~27** | **9** | **5** | **5** |

---

## 附录：尚未实现的功能（⚠️）

| 功能 | 位置 | 说明 |
|------|------|------|
| 今天/本周/本月过滤 | Overview 工具栏 | 按钮无绑定逻辑 |
| 查看消息趋势详情 | Overview 消息趋势区 | 按钮无绑定逻辑 |
| 模板市场 | 侧边栏 PRO | 链接指向 # |
| 云同步 | 侧边栏 PRO | 链接指向 # |
