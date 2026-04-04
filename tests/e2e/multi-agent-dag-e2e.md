# 多智能体 DAG 端到端业务流程测试

> **类型**：手动测试
> **目的**：验证从创建 OPC → 配置多 Agent 团队 → 部署到真实 Linux 办公室 → 发送业务指令 → Plan 创建 → DAG 驱动执行的完整链路。
> **预计耗时**：30–45 分钟（含 VM 初始化和部署等待）

---

## 前置条件

- [ ] OrbStack 已安装并运行
- [ ] 开发服务器已启动：`npm run dev`（Server :16667，Daemon :16668）
- [ ] `clawpilot-daemon` 已构建：`cd daemon && cargo build --release`
- [ ] OpenClaw 已安装在本机：`openclaw --version`

---

## 环境变量（整个测试过程共用）

```bash
SERVER="http://localhost:16667/api"
VM_NAME="clawpilot-test"
```

---

## 第一阶段：准备 OrbStack 测试虚拟机

### 1-1. 创建 VM（如已存在可跳过）

```bash
orb create ubuntu clawpilot-test
```

**预期**：VM 启动完成，状态为 running

### 1-2. 获取 VM IP

```bash
VM_IP=$(orb list --format json 2>/dev/null \
  | python3 -c "import sys,json; [print(m['ipv4'][0]) for m in json.load(sys.stdin) if m['name']=='clawpilot-test']" 2>/dev/null \
  || orbctl info clawpilot-test | grep -oE '([0-9]{1,3}\.){3}[0-9]{1,3}' | head -1)
echo "VM IP: $VM_IP"
```

**预期**：输出一个有效 IP，如 `192.168.139.170`

### 1-3. 安装并启动 sshd

```bash
orbctl run -m clawpilot-test -u root bash -c \
  "apt-get install -y openssh-server && systemctl enable ssh && systemctl start ssh"
```

**预期**：无报错

### 1-4. 注入 SSH 公钥

```bash
PUBKEY=$(cat ~/.orbstack/ssh/id_ed25519.pub)
orbctl run -m clawpilot-test -u root bash -c "
  mkdir -p /home/$USER/.ssh
  echo '$PUBKEY' >> /home/$USER/.ssh/authorized_keys
  chown -R $USER:$USER /home/$USER/.ssh
  chmod 700 /home/$USER/.ssh && chmod 600 /home/$USER/.ssh/authorized_keys
"
# 验证
ssh -i ~/.orbstack/ssh/id_ed25519 -o StrictHostKeyChecking=no $USER@$VM_IP "echo ssh-ok"
```

**预期**：输出 `ssh-ok`

---

## 第二阶段：创建 OPC、模型和 Agent 团队

### 2-1. 创建 OPC

```bash
OPC=$(curl -s -X POST $SERVER/create_opc \
  -H "Content-Type: application/json" \
  -d '{
    "name": "dev-team",
    "display_name": "开发团队",
    "description": "落地页开发团队 E2E 测试"
  }')
echo $OPC | python3 -m json.tool
OPC_ID=$(echo $OPC | python3 -c "import sys,json; print(json.load(sys.stdin)['id'])")
echo "OPC_ID: $OPC_ID"
```

**预期**：返回 OPC 对象，字段包含 `id`、`name`、`display_name`

### 2-2. 创建模型提供商（百炼）

```bash
# 创建百炼模型提供商
PROVIDER=$(curl -s -X POST $SERVER/create_provider \
  -H "Content-Type: application/json" \
  -d '{
    "name": "bailian",
    "api": "openai-completions",
    "base_url": "https://dashscope.aliyuncs.com/compatible-mode/v1",
    "api_key": "sk-sp-0f756088f03943b29dc608c1c67a61fa",
    "is_available": true
  }')
echo $PROVIDER | python3 -m json.tool
```

**预期**：返回提供商对象，包含 id、name、base_url

### 2-3. 设置模型列表

```bash
curl -s -X POST $SERVER/set_models \
  -H "Content-Type: application/json" \
  -d '{
    "provider_name": "bailian",
    "models": [
      {
        "model_id": "qwen3.5-plus",
        "display_name": "通义千问 Qwen3.5 Plus",
        "context_window": 1000000,
        "max_tokens": 65536,
        "input_types": ["text", "image"]
      },
      {
        "model_id": "qwen3-coder-plus",
        "display_name": "通义千问 Coder Plus",
        "context_window": 1000000,
        "max_tokens": 65536,
        "input_types": ["text"]
      },
      {
        "model_id": "qwen3-max-2026-01-23",
        "display_name": "通义千问 Qwen3 Max",
        "context_window": 262144,
        "max_tokens": 65536,
        "input_types": ["text"]
      }
    ]
  }' | python3 -m json.tool
```

**预期**：返回模型列表

### 2-4. 创建产品经理（领队）

```bash
PM=$(curl -s -X POST $SERVER/create_agent \
  -H "Content-Type: application/json" \
  -d "{
    \"opc_id\": \"$OPC_ID\",
    \"name\": \"pm\",
    \"display_name\": \"小龙虾\",
    \"job_title\": \"产品经理\",
    \"personality\": \"细致、主动、善于协调\",
    \"description\": \"负责需求拆解和多 Agent 任务协调的领队\",
    \"initials\": \"🦞\",
    \"manages\": [\"frontend\", \"backend\", \"qa\"],
    \"order_index\": 0
  }")
PM_ID=$(echo $PM | python3 -c "import sys,json; print(json.load(sys.stdin)['id'])")
echo "PM_ID: $PM_ID"
```

**预期**：返回 Agent 对象，`manages` 包含 3 个成员

### 2-5. 创建前端开发

```bash
FE=$(curl -s -X POST $SERVER/create_agent \
  -H "Content-Type: application/json" \
  -d "{
    \"opc_id\": \"$OPC_ID\",
    \"name\": \"frontend\",
    \"display_name\": \"小前\",
    \"job_title\": \"前端开发工程师\",
    \"personality\": \"追求极致的 UI 体验\",
    \"description\": \"负责落地页 HTML/CSS/JS 实现\",
    \"initials\": \"🎨\",
    \"reports_to\": [\"pm\"],
    \"order_index\": 1
  }")
FE_ID=$(echo $FE | python3 -c "import sys,json; print(json.load(sys.stdin)['id'])")
echo "FE_ID: $FE_ID"
```

### 2-6. 创建后端开发

```bash
BE=$(curl -s -X POST $SERVER/create_agent \
  -H "Content-Type: application/json" \
  -d "{
    \"opc_id\": \"$OPC_ID\",
    \"name\": \"backend\",
    \"display_name\": \"小后\",
    \"job_title\": \"后端开发工程师\",
    \"personality\": \"严谨、注重性能和安全\",
    \"description\": \"负责 API 和服务端逻辑实现\",
    \"initials\": \"⚙️\",
    \"reports_to\": [\"pm\"],
    \"order_index\": 2
  }")
BE_ID=$(echo $BE | python3 -c "import sys,json; print(json.load(sys.stdin)['id'])")
echo "BE_ID: $BE_ID"
```

### 2-7. 创建测试工程师

```bash
QA=$(curl -s -X POST $SERVER/create_agent \
  -H "Content-Type: application/json" \
  -d "{
    \"opc_id\": \"$OPC_ID\",
    \"name\": \"qa\",
    \"display_name\": \"小测\",
    \"job_title\": \"测试工程师\",
    \"personality\": \"严谨、善于发现边界问题\",
    \"description\": \"负责功能验收和回归测试\",
    \"initials\": \"🔍\",
    \"reports_to\": [\"pm\"],
    \"order_index\": 3
  }")
QA_ID=$(echo $QA | python3 -c "import sys,json; print(json.load(sys.stdin)['id'])")
echo "QA_ID: $QA_ID"
```

### 2-8. 验证团队结构

```bash
curl -s -X POST $SERVER/get_agents \
  -H "Content-Type: application/json" \
  -d "{\"opc_id\": \"$OPC_ID\"}" \
  | python3 -c "
import sys, json
agents = json.load(sys.stdin)
for a in agents:
    leader = '👑 领队' if a.get('manages') else '  成员'
    print(f'{leader} {a[\"display_name\"]}（{a[\"name\"]}）manages={a.get(\"manages\")} reports_to={a.get(\"reports_to\")}')
"
```

**预期**：
```
👑 领队 小龙虾（pm）manages=['frontend', 'backend', 'qa'] reports_to=None
  成员 小前（frontend）manages=None reports_to=['pm']
  成员 小后（backend）manages=None reports_to=['pm']
  成员 小测（qa）manages=None reports_to=['pm']
```

---

## 第三阶段：创建办公室

### 3-1. 创建 Office 记录

```bash
OFFICE=$(curl -s -X POST $SERVER/create_office \
  -H "Content-Type: application/json" \
  -d "{
    \"name\": \"OrbStack 测试机\",
    \"host\": \"$VM_IP\",
    \"port\": 22,
    \"username\": \"$USER\",
    \"access_auth_type\": \"SSH_KEY\",
    \"ssh_key_path\": \"$HOME/.orbstack/ssh/id_ed25519\",
    \"daemon_url\": \"http://$VM_IP:16668\"
  }")
OFFICE_ID=$(echo $OFFICE | python3 -c "import sys,json; print(json.load(sys.stdin)['id'])")
echo "OFFICE_ID: $OFFICE_ID"
```

**预期**：返回 Office 对象，`daemon_url` 已填写

### 3-2. 检查 SSH 连通性

```bash
curl -s -X POST $SERVER/check_ssh_connection \
  -H "Content-Type: application/json" \
  -d "{\"office_id\": \"$OFFICE_ID\"}" \
  | python3 -m json.tool
```

**预期**：`{"ok": true}` 或 `{"connected": true}`

---

## 第四阶段：安装 Daemon 并部署 OPC

### 4-1. 安装 Daemon 到 VM

```bash
curl -s -X POST $SERVER/install_daemon \
  -H "Content-Type: application/json" \
  -d "{\"office_id\": \"$OFFICE_ID\"}" \
  | python3 -m json.tool
```

**预期**：返回安装任务状态，最终 `status: SUCCESS`

验证 Daemon 在 VM 上运行：

```bash
ssh -i ~/.orbstack/ssh/id_ed25519 $USER@$VM_IP \
  "curl -s http://localhost:16668/health"
```

**预期**：`{"status":"ok","version":"0.1.0"}`

### 4-2. 获取 Daemon API Key

```bash
DAEMON_KEY=$(ssh -i ~/.orbstack/ssh/id_ed25519 $USER@$VM_IP \
  "cat ~/.clawpilot/daemon.key")
echo "DAEMON_KEY: $DAEMON_KEY"
```

### 4-3. 部署 OPC 到 Office

```bash
DEPLOY=$(curl -s -X POST $SERVER/deploy_to_office \
  -H "Content-Type: application/json" \
  -d "{
    \"opc_id\": \"$OPC_ID\",
    \"office_id\": \"$OFFICE_ID\"
  }")
TASK_ID=$(echo $DEPLOY | python3 -c "import sys,json; print(json.load(sys.stdin).get('task_id',''))")
echo "DEPLOY_TASK_ID: $TASK_ID"
```

### 4-4. 轮询部署状态

```bash
for i in $(seq 1 30); do
  STATUS=$(curl -s -X POST $SERVER/get_deployment_status \
    -H "Content-Type: application/json" \
    -d "{\"task_id\": \"$TASK_ID\"}" \
    | python3 -c "import sys,json; d=json.load(sys.stdin); print(d['status'], d.get('message','')[:80])")
  echo "[$i] $STATUS"
  echo "$STATUS" | grep -qE "SUCCESS|FAILED" && break
  sleep 3
done
```

**预期**：最终输出 `SUCCESS`

### 4-5. 验证 Agent 文档已生成（领队 SOUL.md 含领队段落）

```bash
# 检查 VM 上 PM agent 的 SOUL.md 是否包含领队段落
ssh -i ~/.orbstack/ssh/id_ed25519 $USER@$VM_IP \
  "grep -l 'CLAWPILOT:LEADER_START' ~/.openclaw/CPOPC/开发团队/workspace-小龙虾/SOUL.md 2>/dev/null && echo '✅ 领队段落存在' || echo '❌ 未找到领队段落'"

# 检查 worker agents 的 SOUL.md 不含领队段落
ssh -i ~/.orbstack/ssh/id_ed25519 $USER@$VM_IP \
  "grep -rL 'CLAWPILOT:LEADER_START' \
    ~/.openclaw/CPOPC/开发团队/workspace-小前/SOUL.md \
    ~/.openclaw/CPOPC/开发团队/workspace-小后/SOUL.md \
    ~/.openclaw/CPOPC/开发团队/workspace-小测/SOUL.md 2>/dev/null \
  && echo '✅ Worker agents 无领队段落'"

# 检查所有 agent 的 AGENTS.md 花名册一致
ssh -i ~/.orbstack/ssh/id_ed25519 $USER@$VM_IP \
  "grep -h '小龙虾\|小前\|小后\|小测' \
    ~/.openclaw/CPOPC/开发团队/workspace-*/AGENTS.md | sort -u"
```

**预期**：
- 小龙虾的 SOUL.md 含 `CLAWPILOT:LEADER_START`
- 其余三个 agent 的 SOUL.md 不含该标记
- 所有 AGENTS.md 的花名册行内容相同

---

## 第五阶段：发送业务指令，验证 DAG 启动

### 5-1. 在 VM 上向 OpenClaw 发送指令

```bash
# 在 VM 上以 pm agent 身份发送指令（模拟用户通过终端触发）
ssh -i ~/.orbstack/ssh/id_ed25519 $USER@$VM_IP \
  "openclaw agent --agent pm \
    --message '请帮我创建一个公司落地页网站，需要首页介绍、产品特性、联系方式三个板块。'"
```

**预期**：
- 小龙虾收到消息，分析需求
- 调用 `create-plan` skill，创建 Plan（reply_channel=null，因为是终端触发）
- 在终端输出计划摘要，类似：
  ```
  📋 任务计划：landing-page-20260404T1530

  创建公司落地页网站，含首页介绍、产品特性、联系方式三个板块。

  步骤：
  1. [write_frontend] → 小前
  2. [write_backend] → 小后（依赖步骤1）
  3. [qa_test] → 小测（依赖步骤1、2）

  回复「确认」开始执行，回复「取消」放弃。
  ```

### 5-2. 验证 Plan 已创建（daemon 侧）

```bash
# 查询 daemon 上的 plan 列表
ssh -i ~/.orbstack/ssh/id_ed25519 $USER@$VM_IP \
  "curl -s -H 'Authorization: Bearer $DAEMON_KEY' \
    http://localhost:16668/api/plans/landing-page-$(date +%Y%m%d)T* 2>/dev/null \
  || curl -s -H 'Authorization: Bearer $DAEMON_KEY' \
    http://localhost:16668/api/agents/pm/tasks?page=1 \
  | python3 -m json.tool"
```

**记录下 Plan ID**（从上一步终端输出中获取）：

```bash
PLAN_ID="landing-page-20260404TXXXX"   # 替换为实际值

ssh -i ~/.orbstack/ssh/id_ed25519 $USER@$VM_IP \
  "curl -s -H 'Authorization: Bearer $DAEMON_KEY' \
    http://localhost:16668/api/plans/$PLAN_ID \
  | python3 -m json.tool"
```

**预期**：
```json
{
  "plan": {
    "id": "landing-page-...",
    "status": "pending_approval",
    "publisher_agent_id": "pm",
    "reply_channel": null,
    "reply_to": null
  },
  "tasks": [
    {"id": "t1", "status": "pending", "receiver_agent_id": "frontend"},
    {"id": "t2", "status": "pending", "receiver_agent_id": "backend"},
    {"id": "t3", "status": "pending", "receiver_agent_id": "qa"}
  ]
}
```

### 5-3. 审批 Plan，触发 DAG 执行

```bash
# 在 VM 上或直接调用 daemon API
ssh -i ~/.orbstack/ssh/id_ed25519 $USER@$VM_IP \
  "curl -s -X PATCH \
    -H 'Authorization: Bearer $DAEMON_KEY' \
    http://localhost:16668/api/plans/$PLAN_ID/approve \
  | python3 -m json.tool"
```

**预期**：返回 `{"status": "executing", ...}`

### 5-4. 验证 DAG 调度：根任务先启动，下游任务阻塞

```bash
# 等待 3 秒让 DAG sweep 运行
sleep 3

ssh -i ~/.orbstack/ssh/id_ed25519 $USER@$VM_IP \
  "curl -s -H 'Authorization: Bearer $DAEMON_KEY' \
    http://localhost:16668/api/plans/$PLAN_ID \
  | python3 -c \"
import sys, json
d = json.load(sys.stdin)
for t in d['tasks']:
    print(f\\\"{t['id']} [{t['receiver_agent_id']}]: {t['status']}\\\")
\""
```

**预期**：
```
t1 [frontend]: in_progress     ← 无依赖，立即启动
t2 [backend]:  pending         ← 依赖 t1，阻塞等待
t3 [qa]:       pending         ← 依赖 t1+t2，阻塞等待
```

### 5-5. 监控 DAG 执行进展（可选，等待完成）

```bash
# 每 10 秒查询一次，直到 plan 完成或超时
for i in $(seq 1 30); do
  RESULT=$(ssh -i ~/.orbstack/ssh/id_ed25519 $USER@$VM_IP \
    "curl -s -H 'Authorization: Bearer $DAEMON_KEY' \
      http://localhost:16668/api/plans/$PLAN_ID \
    | python3 -c \"
import sys, json
d = json.load(sys.stdin)
p = d['plan']
tasks = ' | '.join(f\\\"{t['id']}:{t['status'][:4]}\\\" for t in d['tasks'])
print(f\\\"plan={p['status']} tasks=[{tasks}]\\\")
\"")
  echo "[$i] $RESULT"
  echo "$RESULT" | grep -q "plan=completed" && echo "✅ Plan 完成！" && break
  sleep 10
done
```

**预期执行顺序**：
1. `t1:in_progress` → t1 完成 → `t2:in_progress`（t2 解锁）
2. t1、t2 都完成 → `t3:in_progress`（t3 解锁）
3. 全部完成 → `plan=completed`
4. Daemon 触发 `openclaw agent --agent pm` 通知小龙虾
5. 小龙虾在终端输出最终结果

---

## 第六阶段：验证产出物

### 6-1. 检查 Artifact 目录

```bash
ssh -i ~/.orbstack/ssh/id_ed25519 $USER@$VM_IP \
  "find ./artifacts/plans/$PLAN_ID -type f 2>/dev/null | head -20"
```

**预期**：各 agent 的 workspace 目录下有输出文件（HTML、JS、测试报告等）

### 6-2. 检查 Daemon 日志

```bash
ssh -i ~/.orbstack/ssh/id_ed25519 $USER@$VM_IP \
  "cat ~/.clawpilot/logs/daemon.$(date +%Y-%m-%d) | grep -E 'plan|task|sweep|completed|notify' | tail -30"
```

**预期**：日志包含：
- `Sweeping plan: landing-page-...`
- `Started task t1 ... for agent frontend`
- `Plan landing-page-... completed`
- `Notifying publisher agent: pm`

---

## 清理

```bash
# 停止 Daemon（VM 内）
ssh -i ~/.orbstack/ssh/id_ed25519 $USER@$VM_IP \
  "pkill -f clawpilot-daemon || true"

# 删除测试 OPC 数据
curl -s -X POST $SERVER/delete_opc \
  -H "Content-Type: application/json" \
  -d "{\"id\": \"$OPC_ID\"}"

# 删除 Office 记录
curl -s -X POST $SERVER/delete_office \
  -H "Content-Type: application/json" \
  -d "{\"id\": \"$OFFICE_ID\"}"

# 销毁 VM（可选，保留供后续复用）
# orb delete clawpilot-test
```

---

## 检查清单

| 阶段 | 验证点 | 结果 |
|------|--------|------|
| VM 准备 | SSH 连通，输出 `ssh-ok` | ☐ |
| OPC 创建 | 返回有效 OPC id | ☐ |
| 模型创建 | 百炼模型提供商 + 3 个模型创建成功 | ☐ |
| Agent 团队 | 4 个 agent 创建成功，manages/reports_to 正确 | ☐ |
| Office 创建 | daemon_url 填写正确 | ☐ |
| Daemon 安装 | VM 上 `/health` 返回 ok | ☐ |
| OPC 部署 | 部署任务状态 SUCCESS | ☐ |
| 领队 SOUL.md | 含 `CLAWPILOT:LEADER_START` 段落 | ☐ |
| Worker SOUL.md | 不含领队段落 | ☐ |
| AGENTS.md 一致 | 四个 agent 的花名册行内容相同 | ☐ |
| Plan 创建 | daemon 可查询到 plan，status=pending_approval | ☐ |
| Plan 审批 | status 变为 executing | ☐ |
| DAG 调度 | t1 先 in_progress，t2/t3 pending | ☐ |
| DAG 顺序 | t1→t2→t3 依次解锁执行 | ☐ |
| Plan 完成 | status=completed，daemon 日志含 notify | ☐ |
| 产出物 | artifacts 目录有输出文件 | ☐ |

---

## 常见问题

### Plan 创建后状态仍是 pending_approval
Daemon 有 2 分钟自动审批，等待即可，或手动调用 approve 接口。

### openclaw agent 报错 "Unknown agent id"
检查 OPC 已成功部署（openclaw.json 含该 agent），或重新部署。

### t1 任务立即变为 failed
Worker 调用 `openclaw agent` 失败（agent 不存在或 openclaw 未配置），查看 daemon 日志定位原因。

### SSH 连接超时
```bash
orbctl run -m clawpilot-test -u root systemctl start ssh
```
