# 产品概述

## 一句话定位

**ClawPilot 是 OpenClaw 的可视化控制台**，让没有技术背景的人也能在 10 分钟内搭建并运行一套多 Agent 团队。

---

## 背景

OpenClaw 是一个强大的本地多 Agent 框架，但上手门槛高：

- 需要手动创建 10+ 个配置文件
- json5、SOUL.md、bindings 等概念对非开发者不友好
- 申请 API Key、配置飞书 Bot 等步骤繁琐
- 没有可视化界面，出错难以排查

ClawPilot 解决这些问题。

---

## 目标用户

**主要用户：** 想用 OpenClaw 搭建 AI 团队的个人和小团队

- 小公司老板：想用 AI Agent 提效，但没有技术团队
- 独立开发者 / 自由职业者：想快速搭建自己的 AI 助理团队
- 教育、传媒、影视等垂直行业从业者：有具体业务场景，不懂技术配置

**前提条件：** 用户需要自己有 Coding Plan API Key（阿里百炼 / 火山方舟 / MiniMax）

---

## 核心价值

| 痛点 | ClawPilot 的解法 |
|------|----------------|
| 配置文件复杂 | 可视化 Agent 设计器，描述角色自动生成 |
| 申请 Key 流程繁琐 | 内嵌引导流程，自动导航到购买页 |
| 飞书 Bot 配置麻烦 | 自动化配置，用户只需扫码 |
| 多设备配置不同步 | 云同步（付费功能） |
| 没有模板可参考 | 社区模板市场（付费功能） |

---

## 与 OpenClaw 的关系

ClawPilot 是 OpenClaw 的**配套工具**，不替代 OpenClaw：

- ClawPilot 负责：配置生成、可视化管理、部署
- OpenClaw 负责：Agent 运行时、消息处理、LLM 调用
- 两者独立运行，ClawPilot 不介入 OpenClaw 的运行时流量

用户需要本地已安装 OpenClaw，ClawPilot 通过读写本地文件和控制进程来管理它。

---

## LLM 使用方式

ClawPilot **不提供任何 LLM 服务**，也不代理 LLM 流量。

- 生成 Agent 配置时：调用用户自己配置的 provider API Key
- OpenClaw 运行时：直接连接用户的 provider，与 ClawPilot 无关

用户始终自带 Key，数据不经过任何第三方服务器。
