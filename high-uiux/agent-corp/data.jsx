// data.jsx — mock data for ClawPilot
const COMPANIES = [
  { id: "customer_support", name: "客服小队", emoji: "🎧", color: "var(--agent-1)", agents: 5, channels: 4, status: "running", host: "10.20.3.41", lastDeploy: "2 小时前", messages: 1284 },
  { id: "content_studio", name: "内容生产部", emoji: "✍️", color: "var(--agent-2)", agents: 7, channels: 6, status: "running", host: "10.20.3.42", lastDeploy: "昨天 18:22", messages: 952 },
  { id: "data_insight", name: "数据洞察组", emoji: "📊", color: "var(--agent-3)", agents: 4, channels: 3, status: "running", host: "10.20.3.43", lastDeploy: "3 天前", messages: 612 },
  { id: "growth_lab", name: "增长实验室", emoji: "🚀", color: "var(--agent-4)", agents: 6, channels: 5, status: "running", host: "10.20.3.44", lastDeploy: "1 周前", messages: 488 },
  { id: "ops_center", name: "运维中枢", emoji: "🛠️", color: "var(--agent-5)", agents: 3, channels: 2, status: "stopped", host: "—", lastDeploy: "未部署", messages: 0 },
  { id: "legal_review", name: "法务审阅团", emoji: "⚖️", color: "var(--agent-6)", agents: 4, channels: 2, status: "stopped", host: "—", lastDeploy: "已停止", messages: 0 },
];

const PROVIDERS = [
  { id: "anthropic", name: "Anthropic", protocol: "Anthropic", baseUrl: "https://api.anthropic.com/v1", apiKey: "sk-ant-•••••••••••••••••••3kF2", status: "connected", lastTest: "5 分钟前", icon: "A", color: "#c08a6e", models: [
    { id: "claude-sonnet-4-5", name: "Claude Sonnet 4.5", ctx: "200K", inputs: "text, image", vision: true },
    { id: "claude-opus-4", name: "Claude Opus 4", ctx: "200K", inputs: "text, image", vision: true },
    { id: "claude-haiku-4-5", name: "Claude Haiku 4.5", ctx: "200K", inputs: "text", vision: false },
  ]},
  { id: "openai", name: "OpenAI", protocol: "OpenAI", baseUrl: "https://api.openai.com/v1", apiKey: "sk-•••••••••••••••••••••K9pQ", status: "connected", lastTest: "12 分钟前", icon: "O", color: "#7ba896", models: [
    { id: "gpt-4o", name: "GPT-4o", ctx: "128K", inputs: "text, image, audio", vision: true },
    { id: "gpt-4o-mini", name: "GPT-4o mini", ctx: "128K", inputs: "text, image", vision: true },
  ]},
  { id: "deepseek", name: "DeepSeek", protocol: "OpenAI", baseUrl: "https://api.deepseek.com/v1", apiKey: "sk-•••••••••••••••••••••8nWx", status: "connected", lastTest: "1 小时前", icon: "D", color: "#7ba8b8", models: [
    { id: "deepseek-chat", name: "DeepSeek Chat", ctx: "128K", inputs: "text", vision: false },
    { id: "deepseek-reasoner", name: "DeepSeek Reasoner", ctx: "64K", inputs: "text", vision: false },
  ]},
  { id: "qwen", name: "通义千问", protocol: "OpenAI", baseUrl: "https://dashscope.aliyuncs.com/v1", apiKey: "sk-•••••••••••••••••••••2vRm", status: "warning", lastTest: "2 天前", icon: "Q", color: "#a8b878", models: [
    { id: "qwen-max", name: "Qwen Max", ctx: "32K", inputs: "text", vision: false },
  ]},
  { id: "gemini", name: "Google Gemini", protocol: "Gemini", baseUrl: "https://generativelanguage.googleapis.com/v1", apiKey: "AIza••••••••••••••••••sJ4n", status: "disconnected", lastTest: "—", icon: "G", color: "#d49a8a", models: [] },
];

const OFFICES = [
  { id: "office-shanghai", name: "上海主办公室", receptionist: "🦊", host: "10.20.3.41", level: "HIGH", remote: true, daemon: { status: "online", version: "v0.4.2" }, openclaw: { status: "running", version: "v1.8.1" }, deployed: "customer_support" },
  { id: "office-beijing", name: "北京备份办公室", receptionist: "🦉", host: "10.20.3.42", level: "MEDIUM", remote: true, daemon: { status: "online", version: "v0.4.1" }, openclaw: { status: "running", version: "v1.8.0" }, deployed: "content_studio" },
  { id: "office-shenzhen", name: "深圳分部", receptionist: "🐢", host: "10.20.3.43", level: "MEDIUM", remote: true, daemon: { status: "online", version: "v0.4.2" }, openclaw: { status: "running", version: "v1.8.1" }, deployed: "data_insight" },
  { id: "office-local", name: "本机开发", receptionist: "🐱", host: "127.0.0.1", level: "LOW", remote: false, daemon: { status: "offline", version: "—" }, openclaw: { status: "not-installed", version: "—" }, deployed: null },
  { id: "office-test", name: "测试沙箱", receptionist: "🦝", host: "10.20.3.99", level: "LOW", remote: true, daemon: { status: "online", version: "v0.4.2" }, openclaw: { status: "running", version: "v1.8.1" }, deployed: null },
];

const AGENTS = [
  { id: "lead", name: "队长·林晚", emoji: "🦊", color: "var(--agent-1)", role: "客服领队", brief: "统筹所有客户咨询的分发与升级", model: "claude-sonnet-4-5", leader: true,
    tools: ["search", "feishu", "read", "file", "http"], skills: ["FAQ 检索", "工单升级", "情绪识别"],
    allow: ["回答产品咨询", "查询订单状态", "升级到人工"], deny: ["承诺退款金额", "透露内部价格"] },
  { id: "tech", name: "技术·阿涛", emoji: "🧑‍💻", color: "var(--agent-2)", role: "技术支持", brief: "处理 API 集成、SDK 报错等技术问题", model: "claude-sonnet-4-5", leader: false,
    tools: ["search", "read", "code", "http", "file"], skills: ["代码诊断", "日志分析", "GitHub 检索"],
    allow: ["分析 stack trace", "推荐 SDK 版本"], deny: ["执行写操作", "访问生产数据库"] },
  { id: "billing", name: "账务·小满", emoji: "💼", color: "var(--agent-3)", role: "账务专员", brief: "回答订阅、发票、退款相关问题", model: "deepseek-chat", leader: false,
    tools: ["search", "read", "feishu"], skills: ["发票模板", "退款政策"],
    allow: ["查询账单", "解释订阅条款"], deny: ["直接退款", "修改账户余额"] },
  { id: "growth", name: "增长·桃子", emoji: "🦝", color: "var(--agent-4)", role: "活动运营", brief: "为新用户推荐活动与优惠", model: "gpt-4o", leader: false,
    tools: ["search", "feishu", "image"], skills: ["活动文案", "海报生成"],
    allow: ["推荐当前活动", "生成活动文案"], deny: ["承诺独家折扣"] },
  { id: "research", name: "调研·乌鸦", emoji: "🐦", color: "var(--agent-6)", role: "用户调研员", brief: "收集用户反馈，整理产品改进建议", model: "claude-sonnet-4-5", leader: false,
    tools: ["search", "read", "file"], skills: ["NPS 分析", "访谈整理"],
    allow: ["收集反馈", "撰写调研报告"], deny: [] },
];

const TOOLS = [
  { id: "search", name: "网页搜索", icon: "🔍" },
  { id: "read", name: "阅读网页", icon: "📖" },
  { id: "feishu", name: "飞书消息", icon: "💬" },
  { id: "code", name: "代码执行", icon: "⚡" },
  { id: "file", name: "文件读写", icon: "📁" },
  { id: "image", name: "图像生成", icon: "🎨" },
  { id: "http", name: "HTTP 请求", icon: "🌐" },
  { id: "voice", name: "语音合成", icon: "🔊" },
  { id: "calendar", name: "日历", icon: "📅" },
  { id: "calculator", name: "计算器", icon: "🧮" },
];

const PERSONA_TABS = ["SOUL", "IDENTITY", "AGENTS", "USER", "MEMORY", "HEARTBEAT", "TOOLS"];

const SOUL_DOC = `# SOUL.md
## 我是谁
我是 **林晚**，客服小队的队长。一名四岁的赤狐，
善于在嘈杂中找到秩序，喜欢把复杂的问题切成清晰的步骤。

## 我的语调
- 礼貌、克制、不卖萌
- 句子简短，像深秋的清风
- 用「我们」而不是「我」体现团队感

## 与团队的关系
- @阿涛 — 我的右手，负责所有技术疑难
- @小满 — 处理一切账务相关
- @桃子 — 把用户哄开心
- @乌鸦 — 我背后的调研者

## 边界
我从不擅自承诺金额、不透露价格策略。
当我无法回答，我会优雅地把对话交给人工。
`;

const FEISHU_GROUPS = [
  { id: "oc_xa1k4l", name: "客户咨询群 #01", agent: "lead", trigger: "@", enabled: true, type: "group", count: 24 },
  { id: "oc_x82fp3", name: "VIP 客户群", agent: "lead", trigger: "all", enabled: true, type: "group", count: 8 },
  { id: "oc_pq7n2m", name: "技术支持频道", agent: "tech", trigger: "@", enabled: true, type: "group", count: 56 },
  { id: "oc_zx9k1v", name: "财务咨询", agent: "billing", trigger: "@", enabled: true, type: "group", count: 12 },
  { id: "oc_lm4p8s", name: "活动报名群", agent: "growth", trigger: "all", enabled: false, type: "group", count: 42 },
  { id: "oc_dm_user88", name: "陈一鸣（私聊）", agent: "lead", trigger: "all", enabled: true, type: "dm", count: 1 },
];

const ACTIVITIES = [
  { id: 1, agent: "lead", company: "客服小队", action: "回复了消息", target: "客户咨询群 #01", text: "您好，关于订阅取消，我帮您查询下当前周期…", time: "刚刚" },
  { id: 2, agent: "tech", company: "客服小队", action: "调用工具", target: "code_executor", text: "运行 Python 脚本验证 API 响应", time: "12 秒前" },
  { id: 3, agent: "billing", company: "客服小队", action: "回复了消息", target: "财务咨询", text: "您的发票已经发送至注册邮箱，请注意查收。", time: "1 分钟前" },
  { id: 4, agent: "lead", company: "客服小队", action: "升级到人工", target: "VIP 客户群", text: "已通知 @客服主管 接手", time: "3 分钟前" },
  { id: 5, agent: "growth", company: "增长实验室", action: "发送活动消息", target: "活动报名群", text: "🎉 春日新用户专享 7 折福利已开放…", time: "5 分钟前" },
  { id: 6, agent: "research", company: "客服小队", action: "整理调研", target: "用户反馈日报", text: "今日共收集 23 条反馈，3 条标记为重要", time: "12 分钟前" },
  { id: 7, agent: "tech", company: "客服小队", action: "更新文档", target: "FAQ.md", text: "新增「如何重置 API Key」条目", time: "23 分钟前" },
];

const LOGS = [
  { time: "14:38:21", actor: "陈一鸣", action: "deploy", target: "客服小队 → 上海主办公室", status: "success", detail: "部署成功，进程 PID 2841" },
  { time: "14:35:02", actor: "陈一鸣", action: "edit", target: "agent.lead.SOUL.md", status: "info", detail: "更新人格描述（+12 / -3 行）" },
  { time: "14:32:47", actor: "李珊", action: "create", target: "office.test", status: "success", detail: "创建办公室「测试沙箱」" },
  { time: "14:28:11", actor: "system", action: "health", target: "office.beijing", status: "warning", detail: "Daemon 心跳延迟 4.2s" },
  { time: "14:21:05", actor: "陈一鸣", action: "test", target: "provider.openai", status: "success", detail: "API Key 验证通过" },
  { time: "14:15:33", actor: "李珊", action: "delete", target: "agent.deprecated_v1", status: "danger", detail: "删除已废弃 Agent" },
  { time: "14:08:50", actor: "system", action: "auto-restart", target: "openclaw@office-shenzhen", status: "info", detail: "OOM 后自动重启" },
  { time: "13:55:12", actor: "陈一鸣", action: "binding", target: "客户咨询群 #01 → lead", status: "success", detail: "更新触发模式为 @机器人" },
  { time: "13:42:01", actor: "李珊", action: "model", target: "qwen-max", status: "info", detail: "新增模型至 通义千问 提供商" },
];

window.MOCK = { COMPANIES, PROVIDERS, OFFICES, AGENTS, TOOLS, PERSONA_TABS, SOUL_DOC, FEISHU_GROUPS, ACTIVITIES, LOGS };
