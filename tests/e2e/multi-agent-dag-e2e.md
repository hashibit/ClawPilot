# 多智能体 DAG 端到端业务流程测试

> **类型**：手动测试
> **目的**：验证从创建 OPC → 配置多 Agent 团队 → 部署到真实 Linux 办公室 → 发送业务指令 → Plan 创建 → DAG 驱动执行的完整链路。
> **预计耗时**：30–45 分钟（含 VM 初始化和部署等待）

---

## 前置条件

- [ ] OrbStack 已安装并运行
- [ ] 开发服务器已启动：`npm run dev`（Server :16667，Daemon :16668）
- [ ] `clawpilot-daemon` 已构建：`cd daemon && cargo build --release`
- [ ] Linux 版 daemon 已交叉编译：`cd daemon && cargo build --release --target aarch64-unknown-linux-gnu`
- [ ] OpenClaw 已安装在本机：`openclaw --version`
- [ ] （可选）独立测试数据库路径，如 `/tmp/clawpilot-test.db`

---

## 环境变量（整个测试过程共用）

```bash
SERVER="http://localhost:16667/api"
VM_NAME="clawpilot-test"

# 测试日志文件（追加记录每个验证点的结果）
TEST_LOG="/tmp/e2e-dag-$(date +%Y%m%d-%H%M%S).log"
echo "=== E2E DAG 测试开始：$(date) ===" | tee $TEST_LOG

# （可选）独立测试数据库，避免污染开发数据
# 使用方式：启动 Server 时传入 --db 参数
#   node server/index.js --db /tmp/clawpilot-test.db
#   cd daemon && cargo run -- --db-path /tmp/clawpilot-scheduler.db
# 如果不指定，则使用默认的 dev.db 和 ~/.clawpilot/scheduler.db

# 通用验证函数：pass/fail 写入日志
check() {
  local label="$1"; local result="$2"
  if echo "$result" | grep -qE "✅|PASS|ssh-ok|\"ok\":true|ok.*true"; then
    echo "✅ PASS  $label" | tee -a $TEST_LOG
  else
    echo "❌ FAIL  $label" | tee -a $TEST_LOG
    echo "        输出: $result" | tee -a $TEST_LOG
  fi
}
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
```

### 阶段一验证

```bash
echo "--- 第一阶段验证 ---" | tee -a $TEST_LOG

# SSH 连通性
SSH_RESULT=$(ssh -i ~/.orbstack/ssh/id_ed25519 -o StrictHostKeyChecking=no $USER@$VM_IP "echo ssh-ok" 2>&1)
check "VM SSH 连通" "$SSH_RESULT"

# VM IP 有效
[[ -n "$VM_IP" ]] && echo "✅ PASS  VM IP: $VM_IP" | tee -a $TEST_LOG \
                  || echo "❌ FAIL  VM IP 为空" | tee -a $TEST_LOG
```

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

### 2-4. AI 一键生成 Agent 团队（使用 ai_generate_agents）

```bash
# 步骤 1: 用 AI 一次性生成 4 个智能体配置
AGENTS_GEN=$(curl -s -X POST $SERVER/ai_generate_agents \
  -H "Content-Type: application/json" \
  -d '{
    "prompts": [
      "产品经理，负责需求拆解和多 Agent 任务协调的领队，性格细致、主动、善于协调",
      "前端开发工程师，负责落地页 HTML/CSS/JS 实现，追求极致的 UI 体验",
      "后端开发工程师，负责 API 和服务端逻辑实现，性格严谨、注重性能和安全",
      "测试工程师，负责功能验收和回归测试，性格严谨、善于发现边界问题"
    ]
  }')
echo "$AGENTS_GEN" | python3 -m json.tool | head -30

# 解析生成的配置，提取 name 字段用于后续管理关系
PM_NAME=$(echo "$AGENTS_GEN" | python3 -c "import sys,json; print(json.load(sys.stdin)[0]['name'])")
FE_NAME=$(echo "$AGENTS_GEN" | python3 -c "import sys,json; print(json.load(sys.stdin)[1]['name'])")
BE_NAME=$(echo "$AGENTS_GEN" | python3 -c "import sys,json; print(json.load(sys.stdin)[2]['name'])")
QA_NAME=$(echo "$AGENTS_GEN" | python3 -c "import sys,json; print(json.load(sys.stdin)[3]['name'])")
echo "生成的 agent names: $PM_NAME, $FE_NAME, $BE_NAME, $QA_NAME"
```

**预期**：返回包含 4 个智能体配置的数组，每个配置包含 display_name、name、job_title、description、personality、soul、identity 等字段

### 2-5. 批量保存 Agent 到数据库

```bash
# 步骤 2: 将 AI 生成的配置批量保存到数据库
# 添加 manages/reports_to 关系和 order_index
AGENTS_RESULT=$(curl -s -X POST $SERVER/batch_create_agents \
  -H "Content-Type: application/json" \
  -d "{
    \"agents\": [
      {
        \"id\": \"pm-$OPC_ID\",
        \"opc_id\": \"$OPC_ID\",
        \"name\": \"pm\",
        \"display_name\": \"小龙虾\",
        \"job_title\": \"产品经理\",
        \"personality\": \"细致、主动、善于协调\",
        \"description\": \"负责需求拆解和多 Agent 任务协调的领队\",
        \"initials\": \"🦞\",
        \"manages\": [\"frontend\", \"backend\", \"qa\"],
        \"order_index\": 0
      },
      {
        \"id\": \"fe-$OPC_ID\",
        \"opc_id\": \"$OPC_ID\",
        \"name\": \"frontend\",
        \"display_name\": \"小前\",
        \"job_title\": \"前端开发工程师\",
        \"personality\": \"追求极致的 UI 体验\",
        \"description\": \"负责落地页 HTML/CSS/JS 实现\",
        \"initials\": \"🎨\",
        \"reports_to\": [\"pm\"],
        \"order_index\": 1
      },
      {
        \"id\": \"be-$OPC_ID\",
        \"opc_id\": \"$OPC_ID\",
        \"name\": \"backend\",
        \"display_name\": \"小后\",
        \"job_title\": \"后端开发工程师\",
        \"personality\": \"严谨、注重性能和安全\",
        \"description\": \"负责 API 和服务端逻辑实现\",
        \"initials\": \"⚙️\",
        \"reports_to\": [\"pm\"],
        \"order_index\": 2
      },
      {
        \"id\": \"qa-$OPC_ID\",
        \"opc_id\": \"$OPC_ID\",
        \"name\": \"qa\",
        \"display_name\": \"小测\",
        \"job_title\": \"测试工程师\",
        \"personality\": \"严谨、善于发现边界问题\",
        \"description\": \"负责功能验收和回归测试\",
        \"initials\": \"🔍\",
        \"reports_to\": [\"pm\"],
        \"order_index\": 3
      }
    ]
  }")
echo "Batch create result: $AGENTS_RESULT"

# 步骤 3: 设置领队（使用 set_leader）
curl -s -X POST $SERVER/set_leader \
  -H "Content-Type: application/json" \
  -d "{
    \"opc_id\": \"$OPC_ID\",
    \"agent_id\": \"pm-$OPC_ID\"
  }"
echo "Leader set: pm"
```

**预期**：
- `ai_generate_agents` 返回 4 个智能体配置的数组
- `batch_create_agents` 返回创建的 agent ID 数组
- `set_leader` 返回 null

### 阶段二验证

```bash
echo "--- 第二阶段验证 ---" | tee -a $TEST_LOG

# OPC 已创建
[[ -n "$OPC_ID" ]] && echo "✅ PASS  OPC 创建，ID: $OPC_ID" | tee -a $TEST_LOG \
                   || echo "❌ FAIL  OPC_ID 为空" | tee -a $TEST_LOG

# 验证团队结构（4 个 agent，manages/reports_to 正确）
AGENTS=$(curl -s -X POST $SERVER/get_agents \
  -H "Content-Type: application/json" \
  -d "{\"opc_id\": \"$OPC_ID\"}")

echo "$AGENTS" | python3 -c "
import sys, json
agents = json.load(sys.stdin)
for a in agents:
    leader = '👑 领队' if a.get('is_default') else '  成员'
    print(f'{leader} {a[\"display_name\"]}（{a[\"name\"]}）manages={a.get(\"manages\")} reports_to={a.get(\"reports_to\")}')
" | tee -a $TEST_LOG

AGENT_COUNT=$(echo "$AGENTS" | python3 -c "import sys,json; print(len(json.load(sys.stdin)))")
[[ "$AGENT_COUNT" == "4" ]] && echo "✅ PASS  Agent 数量: 4" | tee -a $TEST_LOG \
                             || echo "❌ FAIL  Agent 数量异常: $AGENT_COUNT" | tee -a $TEST_LOG

PM_MANAGES=$(echo "$AGENTS" | python3 -c "
import sys,json
agents=json.load(sys.stdin)
pm=[a for a in agents if a['name']=='pm']
print(len(pm[0].get('manages') or []) if pm else 0)
")
[[ "$PM_MANAGES" == "3" ]] && echo "✅ PASS  pm.manages 包含 3 个成员" | tee -a $TEST_LOG \
                           || echo "❌ FAIL  pm.manages 数量异常: $PM_MANAGES" | tee -a $TEST_LOG
```

---

## 第三阶段：创建办公室

### 3-1. 创建 Office 记录

```bash
OFFICE=$(curl -s -X POST $SERVER/create_office \
  -H "Content-Type: application/json" \
  -d "{
    \"office\": {
      \"id\": \"office-e2e-test\",
      \"name\": \"OrbStack 测试机\",
      \"address\": \"$VM_IP\",
      \"access_auth_type\": \"ssh_key\",
      \"access_user\": \"$USER\",
      \"ssh_key_path\": \"$HOME/.orbstack/ssh/id_ed25519\"
    }
  }")
echo $OFFICE
OFFICE_ID="office-e2e-test"
echo "OFFICE_ID: $OFFICE_ID"
```

**预期**：返回 Office ID

### 3-2. 检查 SSH 连通性

```bash
SSH_CHECK=$(curl -s -X POST $SERVER/check_ssh_connection \
  -H "Content-Type: application/json" \
  -d "{\"host\": \"$VM_IP\", \"port\": 22}")
echo $SSH_CHECK | python3 -m json.tool
```

**预期**：`{"ok": true, "latency_ms": ...}`

### 阶段三验证

```bash
echo "--- 第三阶段验证 ---" | tee -a $TEST_LOG

# Office 已创建
[[ -n "$OFFICE_ID" ]] && echo "✅ PASS  Office 创建，ID: $OFFICE_ID" | tee -a $TEST_LOG \
                      || echo "❌ FAIL  OFFICE_ID 为空" | tee -a $TEST_LOG

# SSH 连通
check "SSH 连通性检查" "$SSH_CHECK"
echo "        延迟: $(echo $SSH_CHECK | python3 -c 'import sys,json; print(json.load(sys.stdin).get("latency_ms","?"))') ms" | tee -a $TEST_LOG
```

---

## 第四阶段：安装物业（OpenClaw + Daemon）并部署 OPC

> 此阶段通过 Server API 完成，不需要手动 SSH 或 orb 命令。
> `install_openclaw` + `install_daemon` 即 UI 中的"安装物业"操作，完成后自动将 `daemon_url` 和 `daemon_api_key` 写回 office 记录。

### 4-1. 安装 OpenClaw 到 VM

```bash
OC_INSTALL=$(curl -s -X POST $SERVER/install_openclaw \
  -H "Content-Type: application/json" \
  -d "{
    \"office_id\": \"$OFFICE_ID\",
    \"mode\": \"ssh\",
    \"ssh_host\": \"$VM_IP\",
    \"ssh_port\": 22,
    \"ssh_user\": \"$USER\",
    \"ssh_key_path\": \"$HOME/.orbstack/ssh/id_ed25519\"
  }")
echo $OC_INSTALL | python3 -m json.tool
```

**预期**：`{"ok": true, "logs": ["✅ OpenClaw 已就绪: ..."]}`

### 4-2. 安装 Daemon 到 VM

> **注意**：安装 daemon 前会先通过 SSH 探测目标机的 OS 和架构（`uname -m && uname -s`），然后选择对应的 daemon 二进制：
> - Linux aarch64 (ARM64) → `aarch64-unknown-linux-gnu`
> - Linux x86_64 → `x86_64-unknown-linux-gnu`
> - macOS → 本地 macOS 二进制
>
> 安装时会通过 systemd（Linux）或 launchd（macOS）启动 daemon，不再使用 bare nohup 进程。

```bash
INSTALL=$(curl -s -X POST $SERVER/install_daemon \
  -H "Content-Type: application/json" \
  -d "{
    \"office_id\": \"$OFFICE_ID\",
    \"mode\": \"ssh\",
    \"ssh_host\": \"$VM_IP\",
    \"ssh_port\": 22,
    \"ssh_user\": \"$USER\",
    \"ssh_key_path\": \"$HOME/.orbstack/ssh/id_ed25519\"
  }")
echo $INSTALL | python3 -m json.tool
DAEMON_KEY=$(echo $INSTALL | python3 -c "import sys,json; print(json.load(sys.stdin).get('api_key',''))")
echo "DAEMON_KEY: $DAEMON_KEY"
```

**预期**：`{"ok": true, "daemon_url": "http://$VM_IP:16668", "api_key": "..."}` — 同时自动保存到 office 记录

> **注意**：Daemon 现在通过 systemd user service 安装（Linux），不再是 bare nohup 进程。
> 服务名为 `clawpilot-daemon`，可通过 `systemctl --user status clawpilot-daemon` 查看状态。

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
    | python3 -c "import sys,json; d=json.load(sys.stdin); print(d.get('state',{}).get('status', d.get('status','')), d.get('state',{}).get('current_step','')[:60])")
  echo "[$i] $STATUS"
  echo "$STATUS" | grep -qiE "success|failed" && break
  sleep 3
done
```

**预期**：最终输出 `success`

### 阶段四验证

```bash
echo "--- 第四阶段验证 ---" | tee -a $TEST_LOG

# OpenClaw 安装结果
check "OpenClaw 安装" "$OC_INSTALL"
echo "$OC_INSTALL" | python3 -c "
import sys,json
d=json.load(sys.stdin)
for l in (d.get('logs') or [])[-3:]: print('        ', l)
" | tee -a $TEST_LOG

# Daemon 安装结果
check "Daemon 安装" "$INSTALL"
[[ -n "$DAEMON_KEY" ]] && echo "✅ PASS  Daemon API Key 获取成功" | tee -a $TEST_LOG \
                       || echo "❌ FAIL  Daemon API Key 为空" | tee -a $TEST_LOG

# Daemon health check（直接从 VM 上验证）
HEALTH=$(ssh -i ~/.orbstack/ssh/id_ed25519 $USER@$VM_IP \
  "curl -s http://localhost:16668/health" 2>&1)
check "Daemon /health" "$HEALTH"
echo "        响应: $HEALTH" | tee -a $TEST_LOG

# 验证 systemd 服务状态
SYSTEMD_STATUS=$(ssh -i ~/.orbstack/ssh/id_ed25519 $USER@$VM_IP \
  "systemctl --user is-active clawpilot-daemon 2>&1" 2>&1)
echo "        systemd status: $SYSTEMD_STATUS" | tee -a $TEST_LOG
[[ "$SYSTEMD_STATUS" == "active" ]] \
  && echo "✅ PASS  Daemon systemd 服务运行中" | tee -a $TEST_LOG \
  || echo "⚠️  WARN  Daemon systemd 服务状态: $SYSTEMD_STATUS" | tee -a $TEST_LOG

# OPC 部署结果
FINAL_STATUS=$(curl -s -X POST $SERVER/get_deployment_status \
  -H "Content-Type: application/json" \
  -d "{\"task_id\": \"$TASK_ID\"}" \
  | python3 -c "import sys,json; d=json.load(sys.stdin); print(d.get('state',{}).get('status', d.get('status','')))")
[[ "$FINAL_STATUS" =~ [Ss]uccess ]] \
  && echo "✅ PASS  OPC 部署状态: $FINAL_STATUS" | tee -a $TEST_LOG \
  || echo "❌ FAIL  OPC 部署状态: $FINAL_STATUS" | tee -a $TEST_LOG

# 验证 Agent 文档已生成（领队 SOUL.md 含领队段落）
LEADER_SOUL=$(ssh -i ~/.orbstack/ssh/id_ed25519 $USER@$VM_IP \
  "grep -l 'CLAWPILOT:LEADER_START' ~/.openclaw/CPOPC/开发团队/workspace-小龙虾/SOUL.md 2>/dev/null && echo found || echo not_found")
[[ "$LEADER_SOUL" == *"found"* ]] \
  && echo "✅ PASS  领队 SOUL.md 含 CLAWPILOT:LEADER_START" | tee -a $TEST_LOG \
  || echo "❌ FAIL  领队 SOUL.md 缺少领队段落" | tee -a $TEST_LOG

# Worker agents 的 SOUL.md 不含领队段落
WORKER_CLEAN=$(ssh -i ~/.orbstack/ssh/id_ed25519 $USER@$VM_IP \
  "grep -rL 'CLAWPILOT:LEADER_START' \
    ~/.openclaw/CPOPC/开发团队/workspace-小前/SOUL.md \
    ~/.openclaw/CPOPC/开发团队/workspace-小后/SOUL.md \
    ~/.openclaw/CPOPC/开发团队/workspace-小测/SOUL.md 2>/dev/null | wc -l")
[[ "$WORKER_CLEAN" == "3" ]] \
  && echo "✅ PASS  Worker agents SOUL.md 无领队段落" | tee -a $TEST_LOG \
  || echo "❌ FAIL  有 Worker agent SOUL.md 含领队段落（干净文件数: $WORKER_CLEAN）" | tee -a $TEST_LOG

# AGENTS.md 花名册一致性
ROSTER_LINES=$(ssh -i ~/.orbstack/ssh/id_ed25519 $USER@$VM_IP \
  "grep -h '小龙虾\|小前\|小后\|小测' \
    ~/.openclaw/CPOPC/开发团队/workspace-*/AGENTS.md 2>/dev/null | sort -u | wc -l")
[[ "$ROSTER_LINES" == "4" ]] \
  && echo "✅ PASS  AGENTS.md 花名册一致（4 个唯一行）" | tee -a $TEST_LOG \
  || echo "❌ FAIL  AGENTS.md 花名册不一致（唯一行数: $ROSTER_LINES）" | tee -a $TEST_LOG

# 验证部署后 openclaw.json 已合并到 ~/.openclaw/openclaw.json
MAIN_CONFIG_COUNT=$(ssh -i ~/.orbstack/ssh/id_ed25519 $USER@$VM_IP \
  "grep -c '小龙虾\|pm' ~/.openclaw/openclaw.json 2>/dev/null" || echo 0)
[[ "$MAIN_CONFIG_COUNT" -gt 0 ]] \
  && echo "✅ PASS  openclaw.json 已合并（含 $MAIN_CONFIG_COUNT 处 agent 引用）" | tee -a $TEST_LOG \
  || echo "⚠️  WARN  openclaw.json 未合并或合并失败" | tee -a $TEST_LOG

# 验证 models.mode = "merge"
MODE=$(ssh -i ~/.orbstack/ssh/id_ed25519 $USER@$VM_IP \
  "grep '\"mode\"' ~/.openclaw/openclaw.json 2>/dev/null" || echo "")
[[ "$MODE" == *"merge"* ]] \
  && echo "✅ PASS  models.mode = merge" | tee -a $TEST_LOG \
  || echo "⚠️  WARN  models.mode 非 merge" | tee -a $TEST_LOG
```

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

**记录下 Plan ID**（从上一步终端输出中获取）：

```bash
PLAN_ID="landing-page-20260404TXXXX"   # 替换为实际值

PLAN_DETAIL=$(ssh -i ~/.orbstack/ssh/id_ed25519 $USER@$VM_IP \
  "curl -s -H 'Authorization: Bearer $DAEMON_KEY' \
    http://localhost:16668/api/plans/$PLAN_ID")
echo $PLAN_DETAIL | python3 -m json.tool
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
APPROVE=$(ssh -i ~/.orbstack/ssh/id_ed25519 $USER@$VM_IP \
  "curl -s -X PATCH \
    -H 'Authorization: Bearer $DAEMON_KEY' \
    http://localhost:16668/api/plans/$PLAN_ID/approve")
echo $APPROVE | python3 -m json.tool
```

**预期**：返回 `{"status": "executing", ...}`

### 5-4. 验证 DAG 调度：根任务先启动，下游任务阻塞

```bash
# 等待 3 秒让 DAG sweep 运行
sleep 3

TASKS_STATE=$(ssh -i ~/.orbstack/ssh/id_ed25519 $USER@$VM_IP \
  "curl -s -H 'Authorization: Bearer $DAEMON_KEY' \
    http://localhost:16668/api/plans/$PLAN_ID")
echo $TASKS_STATE | python3 -c "
import sys, json
d = json.load(sys.stdin)
for t in d['tasks']:
    print(f\"{t['id']} [{t['receiver_agent_id']}]: {t['status']}\")
"
```

**预期**：
```
t1 [frontend]: in_progress     ← 无依赖，立即启动
t2 [backend]:  pending         ← 依赖 t1，阻塞等待
t3 [qa]:       pending         ← 依赖 t1+t2，阻塞等待
```

### 5-5. 监控 DAG 执行进展（等待完成）

```bash
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

### 阶段五验证

```bash
echo "--- 第五阶段验证 ---" | tee -a $TEST_LOG

# Plan 状态
PLAN_STATUS=$(echo $PLAN_DETAIL | python3 -c \
  "import sys,json; print(json.load(sys.stdin)['plan']['status'])" 2>/dev/null)
[[ "$PLAN_STATUS" == "pending_approval" ]] \
  && echo "✅ PASS  Plan 创建，status=pending_approval" | tee -a $TEST_LOG \
  || echo "❌ FAIL  Plan status 异常: $PLAN_STATUS" | tee -a $TEST_LOG

# Approve 后状态
APPROVE_STATUS=$(echo $APPROVE | python3 -c \
  "import sys,json; print(json.load(sys.stdin).get('status',''))" 2>/dev/null)
[[ "$APPROVE_STATUS" == "executing" ]] \
  && echo "✅ PASS  Plan approve 后 status=executing" | tee -a $TEST_LOG \
  || echo "❌ FAIL  approve 后 status 异常: $APPROVE_STATUS" | tee -a $TEST_LOG

# DAG 调度：t1 in_progress，t2/t3 pending
T1_STATUS=$(echo $TASKS_STATE | python3 -c \
  "import sys,json; tasks={t['id']:t['status'] for t in json.load(sys.stdin)['tasks']}; print(tasks.get('t1',''))" 2>/dev/null)
T2_STATUS=$(echo $TASKS_STATE | python3 -c \
  "import sys,json; tasks={t['id']:t['status'] for t in json.load(sys.stdin)['tasks']}; print(tasks.get('t2',''))" 2>/dev/null)
[[ "$T1_STATUS" == "in_progress" ]] \
  && echo "✅ PASS  t1 立即进入 in_progress" | tee -a $TEST_LOG \
  || echo "❌ FAIL  t1 状态异常: $T1_STATUS" | tee -a $TEST_LOG
[[ "$T2_STATUS" == "pending" ]] \
  && echo "✅ PASS  t2 阻塞等待（pending）" | tee -a $TEST_LOG \
  || echo "❌ FAIL  t2 状态异常（应为 pending）: $T2_STATUS" | tee -a $TEST_LOG

# Plan 最终完成
FINAL_PLAN=$(ssh -i ~/.orbstack/ssh/id_ed25519 $USER@$VM_IP \
  "curl -s -H 'Authorization: Bearer $DAEMON_KEY' \
    http://localhost:16668/api/plans/$PLAN_ID \
  | python3 -c \"import sys,json; print(json.load(sys.stdin)['plan']['status'])\"")
[[ "$FINAL_PLAN" == "completed" ]] \
  && echo "✅ PASS  Plan 最终状态: completed" | tee -a $TEST_LOG \
  || echo "❌ FAIL  Plan 最终状态异常: $FINAL_PLAN" | tee -a $TEST_LOG

# Daemon 日志中包含关键事件
DAEMON_LOG=$(ssh -i ~/.orbstack/ssh/id_ed25519 $USER@$VM_IP \
  "cat ~/.clawpilot/logs/daemon.$(date +%Y-%m-%d) 2>/dev/null \
  | grep -E 'Sweeping plan|Started task|Plan.*completed|Notifying publisher' \
  | tail -20")
echo "--- Daemon 关键日志 ---" | tee -a $TEST_LOG
echo "$DAEMON_LOG" | tee -a $TEST_LOG

for keyword in "Sweeping plan" "Started task" "completed" "Notifying publisher"; do
  echo "$DAEMON_LOG" | grep -q "$keyword" \
    && echo "✅ PASS  日志含: $keyword" | tee -a $TEST_LOG \
    || echo "❌ FAIL  日志缺失: $keyword" | tee -a $TEST_LOG
done
```

---

## 第六阶段：验证产出物

### 6-1. 检查 Artifact 目录

```bash
ssh -i ~/.orbstack/ssh/id_ed25519 $USER@$VM_IP \
  "find ~/.clawpilot/artifacts/plans/$PLAN_ID -type f 2>/dev/null | head -20"
```

**预期**：各 agent 的 workspace 目录下有输出文件（HTML、JS、测试报告等）

### 6-2. 检查 Daemon 日志（完整）

```bash
ssh -i ~/.orbstack/ssh/id_ed25519 $USER@$VM_IP \
  "cat ~/.clawpilot/logs/daemon.$(date +%Y-%m-%d) \
  | grep -E 'plan|task|sweep|completed|notify' | tail -30"
```

**预期**：日志包含：
- `Sweeping plan: landing-page-...`
- `Started task t1 ... for agent frontend`
- `Plan landing-page-... completed`
- `Notifying publisher agent: pm`

### 阶段六验证

```bash
echo "--- 第六阶段验证 ---" | tee -a $TEST_LOG

ARTIFACT_COUNT=$(ssh -i ~/.orbstack/ssh/id_ed25519 $USER@$VM_IP \
  "find ~/.clawpilot/artifacts/plans/$PLAN_ID -type f 2>/dev/null | wc -l")
[[ "$ARTIFACT_COUNT" -gt 0 ]] \
  && echo "✅ PASS  产出物文件数: $ARTIFACT_COUNT" | tee -a $TEST_LOG \
  || echo "❌ FAIL  未找到产出物文件" | tee -a $TEST_LOG

# 输出测试摘要
echo "" | tee -a $TEST_LOG
echo "=== E2E DAG 测试结束：$(date) ===" | tee -a $TEST_LOG
echo "=== 测试日志已保存至：$TEST_LOG ===" | tee -a $TEST_LOG
echo "" | tee -a $TEST_LOG
echo "--- 汇总 ---" | tee -a $TEST_LOG
PASS_COUNT=$(grep -c "✅ PASS" $TEST_LOG)
FAIL_COUNT=$(grep -c "❌ FAIL" $TEST_LOG)
echo "✅ 通过: $PASS_COUNT   ❌ 失败: $FAIL_COUNT" | tee -a $TEST_LOG
```

---

## 清理

```bash
# 停止 Daemon（VM 内）- 优先用 systemctl，再用 pkill 作为 fallback
ssh -i ~/.orbstack/ssh/id_ed25519 $USER@$VM_IP \
  "systemctl --user stop clawpilot-daemon 2>/dev/null || pkill -f clawpilot-daemon || true"

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
| AI 生成智能体 | `ai_generate_agents` 返回 4 个配置 | ☐ |
| Agent 团队 | 4 个 agent 创建成功，manages/reports_to 正确 | ☐ |
| Office 创建 | office 记录创建成功 | ☐ |
| SSH 连通性 | `check_ssh_connection` 返回 ok | ☐ |
| OpenClaw 安装 | `install_openclaw` 返回 ok | ☐ |
| Daemon 安装 | `install_daemon` 返回 ok，VM 上 `/health` 返回 ok | ☐ |
| Daemon systemd | `systemctl --user is-active clawpilot-daemon` = active | ☐ |
| OPC 部署 | 部署任务状态 success | ☐ |
| openclaw.json 合并 | `~/.openclaw/openclaw.json` 含部署的 agents | ☐ |
| models.mode | `models.mode = "merge"` | ☐ |
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

### Daemon systemd 服务未启动
检查 systemd 服务状态：
```bash
ssh $USER@$VM_IP "systemctl --user status clawpilot-daemon"
# 查看日志
ssh $USER@$VM_IP "journalctl --user -u clawpilot-daemon -n 50"
# 手动启动
ssh $USER@$VM_IP "systemctl --user start clawpilot-daemon"
```

### SSH 连接超时
```bash
orbctl run -m clawpilot-test -u root systemctl start ssh
```
