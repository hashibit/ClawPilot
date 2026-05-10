---
title: "UI 全局重设计 peer review — 请验证 12 个文件的改动"
date: 2026-05-07
author: "tmux-cccontrol-8.1"
recipient: "tmux-cccontrol-8.2"
source_document: "high-uiux/ 目录（高保真原型）"
summary: "将整个应用 UI 从暗紫色主题对齐到高保真设计（深墨绿+薄荷青），涉及 12 个文件，请逐项验证。"
purpose: >
  请对方验证本次 UI 重构改动是否正确，具体包括：
  1. CSS 设计系统是否完整对齐了 high-uiux/tokens.css 和 ClawPilot.html 中的设计语言
  2. 各页面 JSX 重写是否保留了所有 API 调用和业务逻辑
  3. 是否有 CSS class 引用了未定义的样式
  4. TypeScript 编译和 Vite 构建是否通过（我这边已确认 pass）
---

## 背景

用户提供了交互设计师的高保真原型，部署在 `http://localhost:7777/ClawPilot.html`，源码在 `high-uiux/` 目录。要求将整个应用的 UI/UX 对齐到该设计。

高保真原型的核心设计语言：
- **配色**：深墨绿底（#0a1413）+ 赛博薄荷青强调色（#5eead4）
- **字体**：Inter Tight + JetBrains Mono
- **布局**：232px 侧栏 + topbar（面包屑+通知铃铛）+ 滚动内容区
- **组件**：section-card、metric-card、agent-pill strip、deploy buildings 街区隐喻、SVG binding canvas

## 改动清单（12 文件，+3402 / -1712 行）

### 1. `index.html` (+7/-1)
- 新增 Google Fonts preconnect + Inter Tight / JetBrains Mono stylesheet
- theme-color 从 #1E3A5F 改为 #0a1413

### 2. `src/styles/base.css` (完全重写)
- `:root` 设计 token 全部替换：bg-base/surface/elevated/input/hover、border-subtle/default/strong、text-primary/secondary/tertiary/muted、accent/accent-soft/accent-border/accent-glow、8 个 agent 色、font-sans/font-mono、r-sm/md/lg/xl、shadow-sm/md/lg、space-1~8
- 新增组件样式：.btn/.btn-primary/.btn-ghost/.btn-sm/.btn-icon、.tag/.dot/.toggle/.seg/.kbd、.section-card/.card、.split/.split-list/.split-detail、.field-row/.form-grid、.tbl、.modal/.modal-header/.modal-body/.modal-footer、.toast
- 保留了全部已有 class（.tbtn、.field-input、.group、.nav-item、.sidebar 等），更新了它们的样式值
- 保留了 RTL、mobile responsive、scrollbar 样式

### 3. `src/styles/pages.css` (完全重写)
- 新增：.metric-grid/.metric-card、.company-grid/.company-card、.agent-strip/.agent-pill、.dpv 部署街区全套（building/floor/window/flag/door/sign/badge/preview/action）、.bind-canvas/.bind-card/.bind-port、.log-page/.log-row、.activity-page/.activity-stream/.activity-side、.settings-section、.tabs/.tab/.editor、.rail-grid/.rail-pane、.tools-grid/.tool-chip、.skill-list/.skill-card、.timeline、.terminal、.steps/.step、.drawer/.chat-msg、.rec-dnd 接待员拖拽
- 保留了全部已有 page class（.stat-grid、.overview-content、.trend-bar 等）

### 4. `src/components/Layout.tsx` (重写)
- 新增 topbar：面包屑导航（全局 → 页面 / 全局 → 公司 → 页面）+ 通知铃铛
- 侧栏改为 CSS Grid 布局（gridTemplateColumns），宽度 232px
- 品牌区：logo-box + 应用名 + 版本号
- 公司空间：返回全局按钮 + opc-switcher 公司上下文卡
- 导航项支持 count 显示
- 保留全部逻辑：process status polling、restart、mobile menu、collapsed state

### 5. `src/pages/OverviewPage.tsx` (重写 JSX)
- metric-grid 4 卡（公司/智能体/频道/消息）+ bar-row 消息量图表 + running-list
- 保留 useOpc + getOpcStats 数据流

### 6. `src/pages/CompanyListPage.tsx` (重写 JSX)
- company-card grid + filter-tabs（全部/运行中/已停止）+ search-input
- 保留 createOpc/deleteOpc 逻辑

### 7. `src/pages/AgentsPage.tsx` (重写 JSX)
- agent-strip pill 选择器 + agent-toolbar + 5 个 section-card（基本信息、模型与工具、技能、护栏、人格配置）
- 保留全部 modal（AI generate、batch、skill）和 API 调用

### 8. `src/pages/DeployPage.tsx` (重写 JSX)
- 街区隐喻：dpv-hero（公司卡片 draggable + 状态）+ dpv-street（building 列）+ dpv-history
- 新增 drag 状态：dragging/hoverId/pickedId
- 保留全部部署 API 调用

### 9. `src/pages/BindingsPage.tsx` (重写 JSX)
- 单栏布局：channel-mini 头部 + bind-toolbar + bind-card 列表 + section-card detail
- 保留全部 channel/binding CRUD

### 10. `src/pages/LogsPage.tsx` (重写 JSX)
- 表格审计布局：log-row grid（时间/级别/组件/消息/频道）
- 保留 getLogs 轮询 + level filter

### 11. `src/pages/ActivitiesPage.tsx` (重写 JSX)
- 双栏：activity-stream + activity-side
- 保留 subscribeToActivities 实时订阅

### 12. `src/pages/SettingsPage.tsx` (重写 JSX)
- settings-section 卡片 + field-row 布局
- 保留 opc_root、license、i18n 逻辑

## 验证状态

| 检查项 | 结果 |
|--------|------|
| `npx tsc --noEmit` | 0 errors |
| `npx vite build` | built in 828ms |
| dev server (16666) | 200 OK |

## 验证方式

**请用浏览器截图逐页对比**，两个地址都已跑起来：

| 对象 | 地址 |
|------|------|
| 高保真原型 | `http://localhost:7777/ClawPilot.html` |
| 当前应用 | `http://localhost:16666/` |

用 chrome-devtools MCP 工具（`navigate_page` + `take_screenshot`），对每个页面截图对比：
1. 先导航到高保真对应页面（通过 Tweaks panel 切换 scope/page）
2. 再导航到当前应用对应路由
3. 逐页对比：侧栏、配色、卡片结构、间距、字体、组件形态

高保真原型通过 URL hash 或 Tweaks panel 切换页面（默认 scope=global, page=overview）。可以通过 JS console 切换：
```js
// 全局页面
document.querySelector('[class*="nav-item"]')  // 点击侧栏导航
// 或直接操作 tweaks
window.postMessage({type: '__activate_edit_mode'}, '*')  // 打开 tweaks panel
```

## 请验证

1. **视觉对比**：逐页截图对比高保真和当前应用，找出视觉差异（配色、间距、字体、组件结构）
2. **CSS 完整性**：对照 `high-uiux/tokens.css` 和 `ClawPilot.html` 的 `<style>` 块，确认 `base.css` 和 `pages.css` 没有遗漏关键样式
3. **逻辑保留**：抽查 2-3 个页面（建议 AgentsPage、DeployPage、BindingsPage），确认 API 调用、state、event handler 完整保留
4. **Class 引用**：确认页面 JSX 中使用的 CSS class 在 base.css/pages.css 中都有定义
5. **ProvidersPage / OfficePage**：这两个页面结构未改动（已有 split 布局），仅依赖 CSS token 级联，请截图确认视觉效果是否足够对齐
