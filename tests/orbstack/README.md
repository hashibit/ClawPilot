# OrbStack 真实部署测试

这些测试用于验证 ClawPilot 在真实 Linux 虚拟机环境中的部署功能。

## 前置要求

1. **OrbStack 已安装**
   - 从 https://orbstack.dev 下载安装

2. **Daemon 已构建**
   ```bash
   cd daemon && cargo build --release
   ```

3. **SSH 访问权限**
   - 确保可以通过 `orb ssh <vm-name>` 访问 VM

## 运行测试

### 自动测试脚本

```bash
./tests/orbstack/test-deploy.sh
```

此脚本将：
1. 检查 OrbStack 是否安装
2. 创建/启动测试 VM
3. 复制并安装 daemon
4. 执行 Health 检查
5. 测试部署包上传
6. 测试任务状态查询
7. 清理环境

### 手动测试步骤

#### 1. 创建测试 VM

```bash
orb create ubuntu clawpilot-test
```

#### 2. 复制 Daemon 到 VM

```bash
orb scp daemon/target/release/clawpilot-daemon clawpilot-test:/tmp/
orb ssh clawpilot-test "sudo mv /tmp/clawpilot-daemon /usr/local/bin/ && sudo chmod +x /usr/local/bin/clawpilot-daemon"
```

#### 3. 启动 Daemon

```bash
orb ssh clawpilot-test "nohup clawpilot-daemon --listen 0.0.0.0:8443 > /tmp/daemon.log 2>&1 &"
```

#### 4. 验证 Health 端点

```bash
orb ssh clawpilot-test "curl http://localhost:8443/health"
```

预期输出：
```json
{"status":"ok","version":"0.1.0"}
```

#### 5. 测试部署

```bash
# 创建测试包
echo '{"version":"1.0.0","opc_id":"test"}' > manifest.json
tar -czf package.tar.gz manifest.json

# 获取 API key
API_KEY=$(orb ssh clawpilot-test "cat ~/.clawpilot/daemon.key")

# 上传部署
orb ssh clawpilot-test "curl -X POST \
  -H 'Authorization: Bearer ${API_KEY}' \
  -F 'manifest=@manifest.json' \
  -F 'package=@package.tar.gz' \
  http://localhost:8443/deploy"
```

#### 6. 清理

```bash
orb ssh clawpilot-test "pkill -f clawpilot-daemon"
orb delete clawpilot-test
```

## 故障排除

### Daemon 启动失败

检查日志：
```bash
orb ssh clawpilot-test "cat /tmp/daemon.log"
```

### 端口冲突

使用不同端口：
```bash
clawpilot-daemon --listen 0.0.0.0:8444
```

### SSH 连接问题

确保 OrbStack 正在运行：
```bash
orb status
```

## 自动化 CI/CD 集成

由于 OrbStack 测试需要真实 VM 环境，建议：

1. **本地开发时**：手动运行测试脚本
2. **CI/CD 中**：使用 Docker 模拟环境或跳过这些测试
3. **发布前**：在 macOS 开发者机器上运行完整测试
