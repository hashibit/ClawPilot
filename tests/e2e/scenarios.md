# ClawPilot UI 测试场景（agent-browser）

> 本文档是 **agent-browser 测试脚本**，以自然语言描述操作步骤与预期行为，
> 由 Claude Code 调用 `agent-browser` skill 驾驶浏览器执行，或由人工逐项验证。
> pass/fail 由 AI 根据截图和页面状态判断，无代码断言。

---

## 一、基础页面加载

- 启动开发服务器后访问首页，确认侧边栏和内容区正常渲染，无报错
- 依次点击侧边栏所有导航项（Overview / OPC / Agents / Bindings / Providers / Office / Deploy / Logs / Settings），确认每个页面正常加载、URL hash 对应正确

---

## 二、OPC 管理

> 详细场景见 [`opc.md`](./opc.md)，涵盖 CRUD、快照管理、导出、**导入（完整性验证）**、**快照与部署联动**、下线操作，共 30 个测试点。

---

## 三、Agent 管理

> 详细场景见 [`agents.md`](./agents.md)，涵盖 CRUD、模型与工具配置、人格文档编辑、技能管理、护栏规则、AI 生成、测试对话，共 30 个测试点。

---

## 三-A、技能市场

> 详细场景见 [`skill.md`](./skill.md)，涵盖技能列表展示、本地 CRUD、从 ClawHub/Lightmake 同步、搜索、一键安装（zip 解压）、卸载、在 Agent 中勾选使用，共 25 个测试点。

---

## 三-B、工具管理

> 详细场景见 [`tool.md`](./tool.md)，涵盖工具列表展示、自定义工具 CRUD、在 Agent 中勾选/添加标签，共 12 个测试点。

---

## 四、渠道与绑定

> 详细场景见 [`bindings.md`](./bindings.md)，涵盖飞书/钉钉/Slack 渠道配置、群组绑定 CRUD、状态切换、关联 Agent 同步，共 20 个测试点。

---

## 五、模型提供商

> 详细场景见 [`providers.md`](./providers.md)，涵盖提供商配置、格式验证、测试连接、模型列表展示、**多协议类型创建（OpenAI 兼容 / Anthropic / Gemini）**、删除提供商、**模型批量同步（set_models）**，共 30 个测试点。

---

## 六、Office 管理

> 详细场景见 [`office.md`](./office.md)，涵盖 CRUD、地址模式切换、门禁认证、物业安装、Daemon 健康检查、部署信息展示，共 25 个测试点。

---

## 七、部署流程

> 详细场景见 [`deploy.md`](./deploy.md)，涵盖配置选择、完整部署、进度轮询、取消部署、下线操作、历史记录，共 18 个测试点。

---

## 八、日志

> 详细场景见 [`logs.md`](./logs.md)，涵盖实时流展示、清空恢复、多维度过滤（级别/组件），共 12 个测试点。

---

## 九、概览

> 详细场景见 [`overview.md`](./overview.md)，涵盖进程控制、统计数据、消息趋势、OPC 消息对比、自动轮询，共 15 个测试点。

---

## 十、设置

> 详细场景见 [`settings.md`](./settings.md)，涵盖语言切换（含 RTL）、主题展示、关于信息，共 8 个测试点。

---

## 十一、网络异常处理

1. 在 Server 未启动的情况下访问任意数据页面，页面应显示错误提示或空状态，不崩溃
2. 发起需要网络的操作（如创建 OPC）时网络中断，应有友好的错误提示，不丢失已填写数据

---

## 十二、表单验证

**OPC 创建验证**
1. 打开创建 Modal，不填写任何字段直接提交
2. 内部名称和显示名称字段应出现必填错误提示，Modal 不关闭

**Agent 创建验证**
1. 同上，必填字段为空时提交应被拦截

**绑定创建验证**
1. 新建绑定时群组 ID 为空直接提交
2. 必填错误提示出现，保存被阻止

---

## 执行方式

```bash
# 启动开发服务器
lsof -ti:1420,3001 | xargs kill -9 2>/dev/null || true
npm run dev
# 然后告诉 Claude Code 执行 agent-browser 测试，或人工逐项验证
```

## 远程主机测试（OrbStack）

部分场景（Office 远程模式、SSH 连通检测、安装物业到远程主机）需要真实的远程主机。
可用 **OrbStack** 在本机快速创建 Linux VM：

```bash
orb list                          # 查看现有 VM，如 clawpilot-test (192.168.139.170)
orb create ubuntu clawpilot-test  # 如需新建
```

详细配置步骤见 [`office.md`](./office.md) 的「测试环境准备」章节。

**已验证的 VM 规格**：OrbStack Ubuntu 25.04 arm64，`clawpilot-test`，IP `192.168.139.170`
