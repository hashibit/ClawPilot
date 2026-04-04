# OrbStack 真实部署测试 — 手动测试场景

> ⚠️ **注意**: 这些测试需要手动执行，需要真实的 OrbStack 环境。
> 用于验证 Daemon 在真实 Linux 环境中的部署和运行。

---

## 前置要求

1. **macOS**（OrbStack 仅支持 macOS）
2. **OrbStack 已安装**: https://orbstack.dev
3. **Daemon 已构建**:
   ```bash
   cd daemon && cargo build --release
   ```

---

## 环境准备（首次执行）

OrbStack VM 默认不启动 sshd，需要先完成以下 setup：

```bash
# 创建 VM（如已创建可跳过）
orbctl create ubuntu clawpilot-test

# 安装并启动 sshd
orbctl run -m clawpilot-test -u root bash -c "apt-get install -y openssh-server && systemctl enable ssh && systemctl start ssh"

# 注入 OrbStack 公钥
PUBKEY=$(cat ~/.orbstack/ssh/id_ed25519.pub)
orbctl run -m clawpilot-test -u root bash -c "
  mkdir -p /home/$USER/.ssh
  echo '$PUBKEY' > /home/$USER/.ssh/authorized_keys
  chown -R $USER:$USER /home/$USER/.ssh
  chmod 700 /home/$USER/.ssh
  chmod 600 /home/$USER/.ssh/authorized_keys
"

# 获取 VM IP
VM_IP=$(orbctl list --format json | python3 -c "import sys,json; [print(m['ip']) for m in json.load(sys.stdin) if m['name']=='clawpilot-test']")
echo "VM IP: $VM_IP"

# 验证 SSH 连接
ssh -i ~/.orbstack/ssh/id_ed25519 $USER@$VM_IP "echo ok"
```

之后所有 SSH/SCP 操作统一使用：

```bash
SSH="ssh -i ~/.orbstack/ssh/id_ed25519 $USER@$VM_IP"
SCP="scp -i ~/.orbstack/ssh/id_ed25519"
```

### 常见问题

#### VM IP 变化
VM 重启后 IP 可能会变化，重新获取：
```bash
VM_IP=$(orbctl list --format json | python3 -c "import sys,json; [print(m['ipv4'][0]) for m in json.load(sys.stdin) if m['name']=='clawpilot-test']")
```

#### SSH 认证失败
如果 VM 重启后 SSH 认证失败，重新注入公钥到 root 用户：
```bash
PUBKEY=$(cat ~/.orbstack/ssh/id_ed25519.pub)
orbctl run -m clawpilot-test -u root "mkdir -p ~/.ssh && echo '$PUBKEY' >> ~/.ssh/authorized_keys && chmod 700 ~/.ssh && chmod 600 ~/.ssh/authorized_keys"
```

#### SSH 连接超时
如果 SSH 连接超时，先检查 VM 状态并等待完全启动：
```bash
orbctl list  # 确认 VM 运行中
sleep 10     # 等待 VM 完全启动
ssh -i ~/.orbstack/ssh/id_ed25519 -o ConnectTimeout=5 root@$VM_IP "echo ok"
```

---

## 测试场景

### 1. Daemon 安装测试

**目的**: 验证 Daemon 二进制可在目标系统执行

**步骤**:
```bash
# 复制到 VM
scp -i ~/.orbstack/ssh/id_ed25519 daemon/target/release/clawpilot-daemon $USER@$VM_IP:/tmp/

# 安装到系统路径
ssh -i ~/.orbstack/ssh/id_ed25519 $USER@$VM_IP "sudo mv /tmp/clawpilot-daemon /usr/local/bin/ && sudo chmod +x /usr/local/bin/clawpilot-daemon"

# 验证可执行
ssh -i ~/.orbstack/ssh/id_ed25519 $USER@$VM_IP "clawpilot-daemon --version"
```

**预期结果**: 输出版本号，无报错

---

### 2. Daemon 启动测试

**目的**: 验证 Daemon 可正常启动并监听端口

**步骤**:
```bash
# 启动 Daemon
ssh -i ~/.orbstack/ssh/id_ed25519 $USER@$VM_IP "nohup clawpilot-daemon --listen 0.0.0.0:16668 > /tmp/daemon.log 2>&1 &"
sleep 3

# 检查进程
ssh -i ~/.orbstack/ssh/id_ed25519 $USER@$VM_IP "pgrep -f clawpilot-daemon"

# 检查端口
ssh -i ~/.orbstack/ssh/id_ed25519 $USER@$VM_IP "ss -tlnp | grep 16668"
```

**预期结果**:
- 进程存在
- 端口 16668 处于 LISTEN 状态

---

### 3. Health 检查测试

**目的**: 验证 Health 端点返回正确

**步骤**:
```bash
# 本地调用（VM 内部）
ssh -i ~/.orbstack/ssh/id_ed25519 $USER@$VM_IP "curl http://localhost:16668/health"

# 远程调用（从本机）
curl http://$VM_IP:16668/health
```

**预期结果**:
```json
{"status":"ok","version":"0.1.0"}
```

---

### 4. 部署包上传测试

**目的**: 验证部署 API 可接收并处理部署包

**步骤**:
```bash
# 创建测试包
echo '{"version":"1.0.0","name":"test-opc"}' > manifest.json
tar -czf package.tar.gz manifest.json

# 上传到 VM
scp -i ~/.orbstack/ssh/id_ed25519 manifest.json package.tar.gz $USER@$VM_IP:/tmp/

# 执行部署
API_KEY=$(ssh -i ~/.orbstack/ssh/id_ed25519 $USER@$VM_IP "cat ~/.clawpilot/daemon.key 2>/dev/null || echo 'test-key'")
ssh -i ~/.orbstack/ssh/id_ed25519 $USER@$VM_IP "curl -X POST \
  -H 'Authorization: Bearer ${API_KEY}' \
  -F 'manifest=@/tmp/manifest.json' \
  -F 'package=@/tmp/package.tar.gz' \
  http://localhost:16668/deploy"
```

**预期结果**: 返回任务 ID 和状态，无报错

---

### 5. 任务状态查询测试

**目的**: 验证可查询部署任务状态

**步骤**:
```bash
# 假设上一步返回的 task_id 为 "task-xxx"
ssh -i ~/.orbstack/ssh/id_ed25519 $USER@$VM_IP "curl http://localhost:16668/tasks/task-xxx"
```

**预期结果**: 返回任务状态 JSON

---

### 6. 日志查看测试

**目的**: 验证 Daemon 日志正常记录

**步骤**:
```bash
ssh -i ~/.orbstack/ssh/id_ed25519 $USER@$VM_IP "cat /tmp/daemon.log"
```

**预期结果**: 日志包含启动、请求等记录

---

### 7. Daemon 停止测试

**目的**: 验证 Daemon 可正常停止

**步骤**:
```bash
ssh -i ~/.orbstack/ssh/id_ed25519 $USER@$VM_IP "pkill -f clawpilot-daemon"
ssh -i ~/.orbstack/ssh/id_ed25519 $USER@$VM_IP "pgrep -f clawpilot-daemon || echo 'stopped'"
```

**预期结果**: 进程不存在

---

## 清理环境

```bash
# 停止 Daemon
ssh -i ~/.orbstack/ssh/id_ed25519 $USER@$VM_IP "pkill -f clawpilot-daemon || true"

# 删除 VM
orbctl delete clawpilot-test
```

---

## 测试覆盖矩阵

| 场景 | 验证点 | 状态 |
|------|--------|------|
| Daemon 安装 | 二进制可执行 | ☐ |
| Daemon 启动 | 端口监听正常 | ☐ |
| Health 检查 | 返回正确 JSON | ☐ |
| 部署包上传 | 文件接收成功 | ☐ |
| 任务状态查询 | 状态返回正常 | ☐ |
| 日志记录 | 日志正常输出 | ☐ |
| Daemon 停止 | 进程正常退出 | ☐ |

---

## 常见问题

### SSH 连接失败（Connection refused）
```bash
orbctl run -m clawpilot-test -u root systemctl start ssh
```

### SSH 认证失败（Permission denied）
```bash
PUBKEY=$(cat ~/.orbstack/ssh/id_ed25519.pub)
orbctl run -m clawpilot-test -u root bash -c "echo '$PUBKEY' >> /home/$USER/.ssh/authorized_keys"
```

### 不知道 VM 的 IP
```bash
orbctl info clawpilot-test | grep IPv4
# 或
orbctl list
```

### OrbStack 服务异常
```bash
orbctl status
orbctl stop && open -a OrbStack
```