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
# 使用方式：启动各后端时指定独立路径
#   CLAWPILOT_DB_PATH=/tmp/clawpilot-test.db \
#     cd src-tauri && cargo run --bin dev-server
#   cd daemon && cargo run -- --db-path /tmp/clawpilot-scheduler.db
# 如果不指定，则使用默认的 ~/.clawpilot/clawpilot.db 和 ~/.clawpilot/scheduler.db

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
# 注意：API 需要 {"config": {...}} 格式，返回字符串 ID
OPC=$(curl -s -X POST $SERVER/create_opc \
  -H "Content-Type: application/json" \
  -d '{
    "config": {
      "name": "dev-team",
      "display_name": "开发团队",
      "description": "落地页开发团队 E2E 测试"
    }
  }')
echo "OPC 返回：$OPC"
# 去除引号获取纯 ID（API 返回的是字符串，不是对象）
OPC_ID=$(echo $OPC | tr -d '"')
echo "OPC_ID: $OPC_ID"
```

**预期**：返回字符串 ID，如 `"opc-1775324112202"`

### 2-2. 创建模型提供商（百炼）

```bash
PROVIDER=$(curl -s -X POST $SERVER/create_provider \
  -H "Content-Type: application/json" \
  -d '{
    "name": "bailian",
    "api": "openai-completions",
    "base_url": "https://coding.dashscope.aliyuncs.com/v1",
    "api_key": "读取环境变量ANTHROPIC_AUTH_TOKEN",
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
echo "$AGENTS_GEN" | python3 -m json.tool

# 保存 AI 生成的配置到临时文件，供下一步使用
echo "$AGENTS_GEN" > /tmp/ai_agents.json
echo "AI 生成的配置已保存到 /tmp/ai_agents.json"

# 解析生成的配置，提取 name 字段用于后续管理关系
PM_NAME=$(echo "$AGENTS_GEN" | python3 -c "import sys,json; print(json.load(sys.stdin)[0]['name'])")
FE_NAME=$(echo "$AGENTS_GEN" | python3 -c "import sys,json; print(json.load(sys.stdin)[1]['name'])")
BE_NAME=$(echo "$AGENTS_GEN" | python3 -c "import sys,json; print(json.load(sys.stdin)[2]['name'])")
QA_NAME=$(echo "$AGENTS_GEN" | python3 -c "import sys,json; print(json.load(sys.stdin)[3]['name'])")
echo "生成的 agent names: $PM_NAME, $FE_NAME, $BE_NAME, $QA_NAME"
```

**预期**：返回包含 4 个智能体配置的数组，每个配置包含 display_name、name、job_title、description、personality、soul、identity 等字段

```bash
# 导出环境变量供 2-5 节使用
export SERVER="$SERVER"
export OPC_ID="$OPC_ID"
```

### 2-5. 批量保存 Agent 到数据库

```bash
# 步骤 2: 将 AI 生成的配置批量保存到数据库
# 使用 Python 脚本从 AI 生成结果中提取配置，添加 manages/reports_to 关系和 order_index
python3 << 'PYTHON_SCRIPT'
import json
import subprocess
import os

OPC_ID = os.environ.get('OPC_ID')
if not OPC_ID:
    print("错误：OPC_ID 环境变量未设置")
    exit(1)

# 读取 AI 生成的配置
with open('/tmp/ai_agents.json', 'r') as f:
    agents_gen = json.load(f)

# 定义团队结构：领队 manages 其他人，其他人 reports_to 领队
team_structure = [
    {"name": "pm", "display_name": "小龙虾", "initials": "🦞", "manages": ["frontend", "backend", "qa"], "reports_to": []},
    {"name": "frontend", "display_name": "小前", "initials": "🎨", "manages": [], "reports_to": ["pm"]},
    {"name": "backend", "display_name": "小后", "initials": "⚙️", "manages": [], "reports_to": ["pm"]},
    {"name": "qa", "display_name": "小测", "initials": "🔍", "manages": [], "reports_to": ["pm"]},
]

# 合并 AI 配置和团队结构
agents_to_save = []
for i, (ai_config, struct) in enumerate(zip(agents_gen, team_structure)):
    agent = {
        "id": f"{struct['name']}-{OPC_ID}",
        "opc_id": OPC_ID,
        "name": struct["name"],
        "display_name": struct["display_name"],
        "initials": struct["initials"],
        "job_title": ai_config.get("job_title", struct["name"]),
        "description": ai_config.get("description", ""),
        "personality": ai_config.get("personality", ""),
        # AI 生成的文档字段（soul, identity 等）会被 batch_create_agents 自动保存到 agent_documents 表
        "soul": ai_config.get("soul", ""),
        "identity": ai_config.get("identity", ""),
        "agents": ai_config.get("agents", ""),
        "user": ai_config.get("user", ""),
        "memory": ai_config.get("memory", ""),
        "heartbeat": ai_config.get("heartbeat", ""),
        "tools": ai_config.get("tools", ""),
        # 团队关系
        "manages": struct["manages"],
        "reports_to": struct["reports_to"],
        # 工具和技能（从 AI 生成结果中提取）
        "enabled_tools": ai_config.get("enabled_tools", []),
        "enabled_skills": ai_config.get("enabled_skills", []),
        "guardrail_allow": ai_config.get("guardrail_allow", []),
        "guardrail_deny": ai_config.get("guardrail_deny", []),
        "order_index": i,
    }
    agents_to_save.append(agent)

# 调用 API 保存
payload = json.dumps({"agents": agents_to_save})
result = subprocess.run(
    ["curl", "-s", "-X", "POST", f"{os.environ.get('SERVER')}/batch_create_agents",
     "-H", "Content-Type: application/json", "-d", payload],
    capture_output=True, text=True
)
print(result.stdout)

# 输出结果
import sys
try:
    data = json.loads(result.stdout)
    if isinstance(data, list) and len(data) == 4:
        print(f"成功创建 {len(data)} 个 agents")
    else:
        print(f"返回：{data}")
except:
    print(f"返回：{result.stdout}")
PYTHON_SCRIPT
```

**预期**：
- `batch_create_agents` 返回创建的 agent ID 数组，如 `["pm-opc-xxx", "frontend-opc-xxx", ...]`

```bash
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

> **注意**：安装 OpenClaw 时会同时安装 git，用于部署时自动保存用户数据。

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

**预期**：`{"ok": true, "logs": ["✅ git 已安装", "✅ OpenClaw 已就绪: ..."]}`

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

### 4-5. 审批 Gateway 设备配对（首次部署后必须执行）

> **背景**：Daemon 首次调用 `openclaw agent` 时会向本机 gateway 发起 pairing 请求，gateway 需要人工审批后 daemon 才能正常执行任务。跳过此步骤会导致所有任务以 `pairing required` 错误失败。

```bash
# 查看 pending 设备列表
orb run -s -m $VM_NAME \
  "export PATH=\$PATH:/home/$USER/.npm-global/bin && openclaw devices list"
```

**预期**：Pending 列表中有 1 个设备（daemon 的 device id），Role 为 `operator`

```bash
# 审批 pairing 请求（approve --latest 审批最新一条）
orb run -s -m $VM_NAME \
  "export PATH=\$PATH:/home/$USER/.npm-global/bin && openclaw devices approve --latest"
```

**预期**：输出 `Approved <device-id> (<request-id>)`

```bash
# 确认已配对
orb run -s -m $VM_NAME \
  "export PATH=\$PATH:/home/$USER/.npm-global/bin && openclaw devices list"
```

**预期**：Pending 列表为空，Paired 列表有 1 个设备，Scopes 包含 `operator.admin, operator.write` 等全量权限

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

# 验证 git 已安装
GIT_CHECK=$(orb run -s -m $VM_NAME "which git && git --version")
echo "        git: $GIT_CHECK" | tee -a $TEST_LOG
[[ "$GIT_CHECK" == *"git version"* ]] \
  && echo "✅ PASS  git 已安装" | tee -a $TEST_LOG \
  || echo "❌ FAIL  git 未安装（部署时无法保存用户数据）" | tee -a $TEST_LOG

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
# 注意：workspace 路径使用 OPC_ID，不是 OPC name
LEADER_SOUL=$(orb run -s -m $VM_NAME \
  "grep -l 'CLAWPILOT:LEADER_START' ~/.openclaw/OPC/$OPC_ID/workspace-小龙虾/SOUL.md 2>/dev/null && echo found || echo not_found")
[[ "$LEADER_SOUL" == *"found"* ]] \
  && echo "✅ PASS  领队 SOUL.md 含 CLAWPILOT:LEADER_START" | tee -a $TEST_LOG \
  || echo "❌ FAIL  领队 SOUL.md 缺少领队段落" | tee -a $TEST_LOG

# Worker agents 的 SOUL.md 不含领队段落
WORKER_CLEAN=$(orb run -s -m $VM_NAME \
  "grep -rL 'CLAWPILOT:LEADER_START' \
    ~/.openclaw/OPC/$OPC_ID/workspace-小前/SOUL.md \
    ~/.openclaw/OPC/$OPC_ID/workspace-小后/SOUL.md \
    ~/.openclaw/OPC/$OPC_ID/workspace-小测/SOUL.md 2>/dev/null | wc -l")
[[ "$WORKER_CLEAN" == "3" ]] \
  && echo "✅ PASS  Worker agents SOUL.md 无领队段落" | tee -a $TEST_LOG \
  || echo "❌ FAIL  有 Worker agent SOUL.md 含领队段落（干净文件数: $WORKER_CLEAN）" | tee -a $TEST_LOG

# AGENTS.md 花名册一致性
ROSTER_LINES=$(orb run -s -m $VM_NAME \
  "grep -h '小龙虾\|小前\|小后\|小测' \
    ~/.openclaw/OPC/$OPC_ID/workspace-*/AGENTS.md 2>/dev/null | sort -u | wc -l")
[[ "$ROSTER_LINES" == "4" ]] \
  && echo "✅ PASS  AGENTS.md 花名册一致（4 个唯一行）" | tee -a $TEST_LOG \
  || echo "❌ FAIL  AGENTS.md 花名册不一致（唯一行数: $ROSTER_LINES）" | tee -a $TEST_LOG

# 验证 OPC 目录 git 提交
GIT_REPO=$(orb run -s -m $VM_NAME \
  "test -d ~/.openclaw/OPC/$OPC_ID/.git && echo 'git-initialized' || echo 'not-git-repo'")
[[ "$GIT_REPO" == "git-initialized" ]] \
  && echo "✅ PASS  OPC 目录已用 git 管理" | tee -a $TEST_LOG \
  || echo "⚠️  WARN  OPC 目录未初始化 git（首次部署时初始化）" | tee -a $TEST_LOG

# 验证 memory 目录已创建
MEMORY_DIR=$(orb run -s -m $VM_NAME \
  "ls -d ~/.openclaw/OPC/$OPC_ID/workspace-*/memory 2>/dev/null | wc -l")
[[ "$MEMORY_DIR" == "4" ]] \
  && echo "✅ PASS  所有 agent 的 memory 目录已创建（4 个）" | tee -a $TEST_LOG \
  || echo "❌ FAIL  memory 目录数量异常: $MEMORY_DIR" | tee -a $TEST_LOG

# 验证 memory 目录含当日日志文件
TODAY=$(date +%Y-%m-%d)
MEMORY_LOGS=$(orb run -s -m $VM_NAME \
  "ls ~/.openclaw/OPC/$OPC_ID/workspace-小龙虾/memory/$TODAY.md 2>/dev/null && echo found || echo not_found")
[[ "$MEMORY_LOGS" == *"found"* ]] \
  && echo "✅ PASS  memory/$TODAY.md 已创建" | tee -a $TEST_LOG \
  || echo "❌ FAIL  memory/$TODAY.md 未找到" | tee -a $TEST_LOG

# 验证部署后 openclaw.json 已合并到 ~/.openclaw/openclaw.json
MAIN_CONFIG_COUNT=$(orb run -s -m $VM_NAME \
  "grep -c '小龙虾\|pm' ~/.openclaw/openclaw.json 2>/dev/null" || echo 0)
[[ "$MAIN_CONFIG_COUNT" -gt 0 ]] \
  && echo "✅ PASS  openclaw.json 已合并（含 $MAIN_CONFIG_COUNT 处 agent 引用）" | tee -a $TEST_LOG \
  || echo "⚠️  WARN  openclaw.json 未合并或合并失败" | tee -a $TEST_LOG

# 验证 Gateway 已配对
PAIRED_COUNT=$(orb run -s -m $VM_NAME \
  "export PATH=\$PATH:/home/$USER/.npm-global/bin && openclaw devices list 2>/dev/null | grep -c 'operator'" || echo 0)
[[ "$PAIRED_COUNT" -gt 0 ]] \
  && echo "✅ PASS  Gateway 设备已配对" | tee -a $TEST_LOG \
  || echo "❌ FAIL  Gateway 设备未配对（任务执行将失败）" | tee -a $TEST_LOG

# 验证 Model Provider 已写入（deploy 时自动注入）
MODEL_CONF=$(orb run -s -m $VM_NAME \
  "grep -c '\"providers\"' ~/.openclaw/openclaw.json 2>/dev/null" || echo 0)
[[ "$MODEL_CONF" -gt 0 ]] \
  && echo "✅ PASS  openclaw.json 已包含 models.providers" | tee -a $TEST_LOG \
  || echo "❌ FAIL  openclaw.json 缺少 models.providers（任务执行将报 model_not_found）" | tee -a $TEST_LOG

# 验证 Plugins 联动（如有 channels）
PLUGINS_CHECK=$(orb run -s -m $VM_NAME \
  "python3 -c \"
import json
with open('/home/$USER/.openclaw/openclaw.json') as f:
    d = json.load(f)
plugins = d.get('plugins', {})
allow = plugins.get('allow', [])
entries = plugins.get('entries', {})
# 检查飞书是否在 allow 和 entries 中都存在
feishu_ok = 'feishu' in allow and 'feishu' in entries
print('feishu_ok' if feishu_ok else 'feishu_missing')
\" 2>/dev/null" || echo "parse_error")
[[ "$PLUGINS_CHECK" == "feishu_ok" ]] \
  && echo "✅ PASS  plugins.allow 和 plugins.entries 已同步飞书配置" | tee -a $TEST_LOG \
  || echo "⚠️  WARN  plugins 联动异常或未配置 channels（$PLUGINS_CHECK）" | tee -a $TEST_LOG
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
| git 安装 | `which git` 返回路径（部署时保存用户数据用） | ☐ |
| Daemon 安装 | `install_daemon` 返回 ok，VM 上 `/health` 返回 ok | ☐ |
| Daemon systemd | `systemctl --user is-active clawpilot-daemon` = active | ☐ |
| OPC 部署 | 部署任务状态 success | ☐ |
| openclaw.json 合并 | `~/.openclaw/openclaw.json` 含部署的 agents | ☐ |
| Gateway 设备配对 | `openclaw devices list` Paired 列表有 daemon 设备 | ☐ |
| Model provider 配置 | `openclaw.json` 含 `models.providers`（deploy 自动注入） | ☐ |
| Plugins 联动 | 有 feishu channel 时 `plugins.allow` 含 `"feishu"` | ☐ |
| 领队 SOUL.md | 含 `CLAWPILOT:LEADER_START` 段落 | ☐ |
| Worker SOUL.md | 不含领队段落 | ☐ |
| AGENTS.md 一致 | 四个 agent 的花名册行内容相同 | ☐ |
| OPC git 管理 | 重新部署时 git 提交保存用户数据 | ☐ |
| Memory 目录 | 每个 workspace 下有 memory/ 目录和当日日志 | ☐ |
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
orb run -s -m $VM_NAME "systemctl --user status clawpilot-daemon"
# 查看日志
orb run -s -m $VM_NAME "journalctl --user -u clawpilot-daemon -n 50"
# 手动启动
orb run -s -m $VM_NAME "systemctl --user start clawpilot-daemon"
```

### SSH 连接超时
```bash
orbctl run -m clawpilot-test -u root systemctl start ssh
```

---

## 踩坑记录（2026-04-05 首次全链路测试）

### 1. 任务全部失败：`gateway connect failed: pairing required`

**现象**：Plan 审批后，t1 立即 failed，错误 `GatewayClientRequestError: pairing required`，retry 后仍失败。

**原因**：Daemon 的 `openclaw agent` 进程连接 gateway 时，该设备尚未完成 pairing。Gateway 会记录一条 pending 配对请求，但不会自动批准，导致所有 WebSocket 连接以 1008 关闭。

**解决**：执行 4-5 节的 `openclaw devices approve --latest`，批准后 daemon 下次 retry 即可成功连接。

---

### 2. 任务失败：`Unknown model: bailian/qwen3-max-2026-01-23 (model_not_found)`

**现象**：pairing 解决后，任务仍报 `All models failed: bailian/qwen3-max-2026-01-23: model_not_found`。

**根因**：`generateOpenclawConfig` 生成的 models 结构是 `{ "bailian": {...} }`，但 OpenClaw schema 要求多一层 `providers` 包装：`{ "providers": { "bailian": {...} } }`。同时 provider 级别多了一个 `api` 字段，也不在 schema 里。另外 deploy.rs 的 merge 逻辑之前显式删除了 models key。

**已修复**：`deployment.js` 改为生成 `models: { providers: {...} }` 结构；`deploy.rs` 改为和 agents 一样直接替换 models，不再删除。

---

### 5. Plugins 未同步 channels

**现象**：部署含飞书 channel 的 OPC 后，`openclaw.json` 的 `plugins.allow` 和 `plugins.entries` 中没有飞书配置，导致飞书消息无法接收。

**根因**：Deploy 只替换了 `channels` key，但 OpenClaw 要求 channel 必须同时在 `plugins.allow` 列表中声明，并在 `plugins.entries` 中有详细配置才能启用。

**已修复**：`deploy.rs` 的 merge 逻辑在替换 `channels` 后，自动同步到 `plugins.allow` 和 `plugins.entries`（仅处理已知 channel 类型：feishu/telegram/discord/slack），用户的其他 plugins 配置不会被覆盖。

---

### 3. Daemon 部署后立即崩溃：`posix_spawn: no such file or directory`

**现象**：`install_daemon` 成功，但 systemd 服务反复重启，日志只有 `posix_spawn: no such file or directory`。

**原因**：`install_daemon` 把本机（macOS）构建的二进制上传到了 Linux VM，Mach-O 格式无法在 Linux 上运行。

**解决**：在上传前交叉编译 Linux arm64 二进制：
```bash
cd daemon && cargo build --release --target aarch64-unknown-linux-gnu
```
`install_daemon` 代码已处理架构探测，但需确保 `target/aarch64-unknown-linux-gnu/release/clawpilot-daemon` 存在。

---

### 4. 路径错误：workspace 目录用了 OPC name 而非 OPC ID

**现象**：部署成功，但 SOUL.md / AGENTS.md 等文件找不到。

**原因**：OpenClaw 的 workspace 路径格式为 `~/.openclaw/OPC/<opc_id>/workspace-<display_name>`，用的是 OPC 的 ID（如 `opc-1775340170838`），不是 OPC 的 name（如 `dev-team`）。

**解决**：验证命令中一律使用 `$OPC_ID` 变量，不硬编码 OPC name。

---

## 日志查看指南

### Daemon 与 OpenClaw 的交互方式

Daemon 执行任务时**启动独立的 `openclaw agent` 进程**，而不是通过 HTTP API 发消息给 gateway：

```
daemon → spawn: openclaw agent --agent <agent_id> --message "..." --json
           ↓
      独立进程运行，stdout/stderr 被 daemon 捕获
           ↓
      session 内容写入 ~/.openclaw/agents/<id>/sessions/*.jsonl
```

因此 **OpenClaw gateway 日志中看不到 daemon 发给 agent 的指令**，这是正常现象。

---

### 日志位置速查表

| 日志位置 | 内容 | 包含 daemon 消息？ |
|---------|------|------------------|
| `~/.clawpilot/logs/daemon.YYYY-MM-DD` | Daemon 主日志，含 DAG 调度、任务分发详情 | ✅ **最详细** |
| `~/.openclaw/logs/gateway.log` | Gateway 服务启动、工具注册、WebSocket | ❌ 不包含 |
| `/tmp/openclaw/openclaw-YYYY-MM-DD.log` | 全局 JSONL，各子系统日志 | ❌ 独立进程不写这里 |
| `~/.openclaw/agents/<id>/sessions/*.jsonl` | 每个 agent 的对话历史 | ✅ 包含用户消息和响应 |

---

### 查看 Daemon 详细日志

Daemon 日志包含完整的任务分发信息：

```bash
# 在 VM 上查看 daemon 日志
orb run -s -m $VM_NAME "cat ~/.clawpilot/logs/daemon.\$(date +%Y-%m-%d)"

# 查看最近 100 行，关注 DAG 调度
orb run -s -m $VM_NAME "tail -100 ~/.clawpilot/logs/daemon.\$(date +%Y-%m-%d) \
  | grep -E 'DAG SWEEP|TASK DISPATCH|TASK COMPLETED|NOTIFYING PUBLISHER'"
```

**Daemon 日志关键事件：**

```
=== DAG SWEEP === Plan: landing-page-20260404T1530
Found 1 ready tasks for plan landing-page-20260404T1530: ["t1→frontend"]
Started task t1 (type: write_frontend) for agent frontend

=== TASK DISPATCH ===
Task: t1 (type: write_frontend)
Agent: frontend
Plan: landing-page-20260404T1530
Timeout: 3600s
Context preview: 你正在执行一个任务...

=== TASK PROCESS EXIT ===
Task: t1
Exit status: ExitCode(0)
Stdout length: 1234 bytes

=== TASK COMPLETED ===
Task: t1
Agent: frontend
Result length: 567 bytes
Artifacts: ["art-t1-xxx"]

=== NOTIFYING PUBLISHER ===
Plan: landing-page-20260404T1530
Publisher agent: pm
Message: 任务计划 landing-page-20260404T1530 已成功完成...
```

---

### 查看 Agent Session 日志

每个 agent 的对话历史存储在独立的 JSONL 文件中：

```bash
# 列出 agent 的 session 文件
orb run -s -m $VM_NAME "ls -la ~/.openclaw/agents/*/sessions/"

# 查看 frontend agent 的最近对话
orb run -s -m $VM_NAME "cat ~/.openclaw/agents/frontend/sessions/*.jsonl \
  | grep '\"type\":\"message\"' | tail -5 | jq '.message.content'"
```

**Session JSONL 结构：**

```jsonl
{"type":"session","id":"xxx","timestamp":"..."}
{"type":"message","id":"xxx","message":{"role":"user","content":[{"type":"text","text":"你正在执行一个任务..."}]}}
{"type":"message","id":"xxx","message":{"role":"assistant","content":[...]}}
```

---

### Agent Workspace 文件结构

部署后每个 agent 的 workspace 目录结构如下：

```
~/.openclaw/OPC/{opc_id}/workspace-{display_name}/
├── SOUL.md           # 身份定位、核心职责、行为准则
├── AGENTS.md         # 团队花名册（所有 agent 一致）
├── USER.md           # 用户信息（Boss 是谁）
├── IDENTITY.md       # Agent 名称、emoji、角色定义
├── MEMORY.md         # 长期记忆（重要决策和经验教训）
├── TOOLS.md          # 工具使用心得（可选）
├── HEARTBEAT.md      # Heartbeat 检查清单（可选）
├── memory/           # 每日工作日志目录
│   └── YYYY-MM-DD.md # 当日日志（部署时自动创建）
└── skills/           # Workspace 专属技能（如有）
```

**验证 workspace 结构：**

```bash
# 列出某 agent 的 workspace 文件
orb run -s -m $VM_NAME "ls -la ~/.openclaw/OPC/$OPC_ID/workspace-小龙虾/"

# 检查 memory 目录
orb run -s -m $VM_NAME "ls -la ~/.openclaw/OPC/$OPC_ID/workspace-小龙虾/memory/"
```

---

### 排查任务执行问题

当任务执行异常时，按以下顺序排查：

1. **检查 Daemon 日志**（最重要）
   ```bash
   orb run -s -m $VM_NAME "grep -A5 'TASK DISPATCH' ~/.clawpilot/logs/daemon.\$(date +%Y-%m-%d) | tail -50"
   ```

2. **检查 Agent Session**
   ```bash
   orb run -s -m $VM_NAME "cat ~/.openclaw/agents/frontend/sessions/*.jsonl | jq -c 'select(.type==\"message\")'"
   ```

3. **检查 Gateway 状态**
   ```bash
   orb run -s -m $VM_NAME "openclaw gateway status"
   ```

4. **检查设备配对状态**
   ```bash
   orb run -s -m $VM_NAME "export PATH=\$PATH:~/.npm-global/bin && openclaw devices list"
   ```
