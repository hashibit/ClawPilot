# ClawPilot 国际化 (i18n) 测试报告

**测试日期**：2026-03-22
**测试框架**：Playwright (Chromium)
**测试结果**：✅ 36/36 全部通过

---

## 1. 测试概览

| 测试组 | 测试数 | 通过 | 失败 |
|--------|--------|------|------|
| Group 1 — en / zh-CN / zh-TW / ja / ko | 5 | 5 | 0 |
| Group 2 — fr / de / es / pt / ru | 6 | 6 | 0 |
| Group 3 — ar / hi / id / th / vi / it | 6 | 6 | 0 |
| RTL — Arabic layout | 5 | 5 | 0 |
| 语言偏好持久化 | 5 | 5 | 0 |
| 硬编码文本检查 (英文模式) | 4 | 4 | 0 |
| 字体渲染 — 特殊字符语言 | 5 | 5 | 0 |
| **总计** | **36** | **36** | **0** |

---

## 2. 各语言测试结果

### 语言切换功能

每种语言均验证了：
- ✅ 在设置页面选择语言 → 页面立即切换
- ✅ Settings 页面标题正确翻译
- ✅ Overview 页面工具栏标题正确翻译
- ✅ 刷新后 localStorage 中语言偏好保持

| # | 语言 | 代码 | 设置标题 | 导航概览 | 状态 |
|---|------|------|----------|----------|------|
| 1 | English | `en` | Settings | Overview | ✅ |
| 2 | 简体中文 | `zh-CN` | 设置 | 数据概览 | ✅ |
| 3 | 繁體中文 | `zh-TW` | 設定 | 數據概覽 | ✅ |
| 4 | 日本語 | `ja` | 設定 | 概要 | ✅ |
| 5 | 한국어 | `ko` | 설정 | 개요 | ✅ |
| 6 | Français | `fr` | Paramètres | Vue d'ensemble | ✅ |
| 7 | Deutsch | `de` | Einstellungen | Übersicht | ✅ |
| 8 | Español | `es` | Configuración | Resumen | ✅ |
| 9 | Português | `pt` | Configurações | Visão geral | ✅ |
| 10 | Русский | `ru` | Настройки | Обзор | ✅ |
| 11 | العربية | `ar` | الإعدادات | نظرة عامة | ✅ RTL |
| 12 | हिन्दी | `hi` | सेटिंग | अवलोकन | ✅ |
| 13 | Bahasa Indonesia | `id` | Pengaturan | Ikhtisar | ✅ |
| 14 | ไทย | `th` | การตั้งค่า | ภาพรวม | ✅ |
| 15 | Tiếng Việt | `vi` | Cài đặt | Tổng quan | ✅ |
| 16 | Italiano | `it` | Impostazioni | Panoramica | ✅ |

---

## 3. 特殊测试项

### 3.1 阿拉伯语 RTL 布局

| 测试项 | 结果 |
|--------|------|
| 切换至 ar 后 `html[dir]` 变为 `rtl` | ✅ |
| `html[lang]` 属性设置为 `ar` | ✅ |
| RTL 提示横幅显示 | ✅ |
| 切换回 en 后恢复 `ltr` | ✅ |
| 设置页面工具栏显示阿拉伯文 الإعدادات | ✅ |

**RTL 实现方式**：
- 切换语言时调用 `document.documentElement.dir = 'rtl'`
- CSS 中 `html[dir='rtl'] .sidebar` 将右边框改为左边框
- CSS 中 `html[dir='rtl'] .nav-item` 使用 `flex-direction: row-reverse`
- 设置页面中语言卡片强制 `direction: ltr`（避免卡片本身被反向）

### 3.2 长文本溢出检查 (Deutsch)

| 测试项 | 结果 |
|--------|------|
| 所有导航标签 clientWidth ≤ 164px | ✅ |

**发现并修复的问题**：
- `Cloud-Synchronisierung`（22 字符）导致 Item 9 溢出 → 缩短为 `Cloud-Sync`
- `Tochtergesellschaften`（21 字符）较长 → 缩短为 `Niederlassungen`（15 字符）
- CSS 已加 `overflow: hidden; text-overflow: ellipsis; white-space: nowrap` 作为安全兜底

### 3.3 字体渲染 — 特殊字符语言

| 语言 | 字符系统 | 工具栏渲染 |
|------|----------|-----------|
| 日本語 (ja) | 汉字 + 假名 | ✅ 非空 |
| 한국어 (ko) | 朝鲜文字 | ✅ 非空 |
| ไทย (th) | 泰文 | ✅ 非空 |
| हिन्दी (hi) | 天城文 | ✅ 非空 |
| العربية (ar) | 阿拉伯文 | ✅ 非空 |

**字体策略**：在 `body` font-family 中添加了 Noto Sans 系列字体回退栈，覆盖 CJK / 阿拉伯 / 梵文 / 泰文。

### 3.4 数字/日期格式

- `fmtUptime()` 函数根据语言代码输出不同格式：
  - `zh-CN`：`2小时30分`
  - `ja`：`2時間30分`
  - `ko`：`2시간 30분`
  - 其他：`2h 30m`
- `toLocaleString()` 数字格式使用浏览器内置区域格式，各语言自动适配

---

## 4. 持久化验证

| 语言 | localStorage 存储 | 刷新保持 | RTL 刷新保持 |
|------|------------------|----------|--------------|
| en | ✅ | ✅ | — |
| ja | ✅ | ✅ | — |
| de | ✅ | ✅ | — |
| ar | ✅ | ✅ | ✅ |
| ru | ✅ | ✅ | — |

---

## 5. 硬编码文本检查

切换到英文模式后，验证以下页面无硬编码中文：

| 页面 | 检查项 | 结果 |
|------|--------|------|
| Overview | 工具栏标题 "Overview" | ✅ |
| Logs | 工具栏含 "Logs" 文本 | ✅ |
| Settings | 工具栏标题 "Settings" | ✅ |
| 侧边栏 | 含 Overview / Logs / Deploy / Settings | ✅ |

---

## 6. 发现的问题及修复

### 问题 1：测试选择器定位错误
- **现象**：`.toolbar span` first() 取到了 Sidebar 中的 "ClawPilot"，而非内容区页面标题
- **修复**：改用 `.toolbar` last() 的 span，Logs 页面用 `filter({ hasText })` 精确定位

### 问题 2：Playwright localStorage 安全限制
- **现象**：在 `beforeEach` 中调用 `page.evaluate` 修改 localStorage 抛 SecurityError（页面尚未加载）
- **修复**：改用 `context.addInitScript()` 在页面加载前注入 localStorage 设置

### 问题 3：德语导航项溢出
- **现象**：`Cloud-Synchronisierung` 和 `Tochtergesellschaften` 超出侧边栏宽度
- **修复**：缩短翻译；CSS 已加 ellipsis 兜底

---

## 7. 待优化项

| 优化项 | 优先级 | 说明 |
|--------|--------|------|
| OPC 管理页、Agent 管理页等其余页面的 i18n | 高 | 当前仅实现了 Layout / Overview / Logs / Settings |
| 阿拉伯语侧边栏 RTL 完整适配 | 中 | 部分 inline style 未适配 RTL，如按钮图标方向 |
| 数字格式区域化 | 低 | 目前 `toLocaleString()` 无参数，建议传入 `i18n.language` |
| 语言检测 fallback | 低 | 可根据浏览器语言自动选择，当前仅读 localStorage |
| Tauri 阶段迁移 | 规划中 | 当前存 localStorage，Tauri 集成后改为 Rust store |

---

## 8. 架构说明

```
src/i18n/
├── index.ts              # i18n 初始化、LANGUAGES 列表、setLanguage()、RTL 控制
└── locales/
    ├── zh-CN.json        # 简体中文（默认）
    ├── zh-TW.json        # 繁體中文
    ├── en.json           # English
    ├── ja.json           # 日本語
    ├── ko.json           # 한국어
    ├── fr.json           # Français
    ├── de.json           # Deutsch
    ├── es.json           # Español
    ├── pt.json           # Português
    ├── ru.json           # Русский
    ├── ar.json           # العربية (RTL)
    ├── hi.json           # हिन्दी
    ├── id.json           # Bahasa Indonesia
    ├── th.json           # ไทย
    ├── vi.json           # Tiếng Việt
    └── it.json           # Italiano
```

**翻译键覆盖**：`nav` / `nav_sections` / `process` / `overview` / `logs` / `settings` / `common`
