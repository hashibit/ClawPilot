# Daemon 安装功能测试用例

> 📜 **历史档案**：记录 Daemon 安装能力早期验证。Bug 表中 `server/utils/ssh.js` 已随 Node Server 下线迁移至 Rust，等价逻辑现位于 `src-tauri/src/services/ssh_service.rs`；其它 daemon/openclaw 路径仍然有效。

**测试目标**: 验证 `install_daemon` 命令在 macOS 和 Linux 平台上的安装功能

---

## 测试结果摘要

| 测试项 | 平台 | 状态 | 备注 |
|--------|------|------|------|
| 手动安装 | macOS | ✅ 通过 | binary 复制、API Key 生成、进程启动正常 |
| launchd 服务 | macOS | ✅ 通过 | 用户级 launchd agent 正常加载运行 |
| 健康检查 | macOS | ✅ 通过 | `/health` 返回正确响应 |
| 交叉编译 | macOS→Linux | ✅ 通过 | aarch64-unknown-linux-gnu 目标编译成功 |
| 手动安装 | Linux | ✅ 通过 | 交叉编译 binary 在 OrbStack 运行正常 |
| systemd 服务 | Linux | ✅ 通过 | 用户级 systemd service 正常加载运行 |
| 健康检查 | Linux | ✅ 通过 | `/health` 返回正确响应 |
| 一键构建 | macOS | ✅ 通过 | `./build-daemon.sh` 成功构建双平台 binary |
| Tauri 打包 | macOS | ✅ 通过 | App bundle 和 DMG 生成成功 |

**Binary 验证**:
```
daemon/target/aarch64-apple-darwin/release/clawpilot-daemon:      Mach-O 64-bit executable arm64 (6.6MB)
daemon/target/aarch64-unknown-linux-gnu/release/clawpilot-daemon: ELF 64-bit LSB pie executable, ARM aarch64 (7.7MB)
```

**Tauri Bundle 结构**:
```
ClawPilot.app/Contents/Resources/resources/
├── clawpilot-daemon-macos (6.6MB)
└── clawpilot-daemon-linux (7.7MB)
```

---

## 测试准备

### 1. 构建 Daemon Binary

**macOS 本机 (aarch64-apple-darwin)**:
```bash
cd daemon
cargo build --release
```

**Linux 交叉编译 (aarch64-unknown-linux-gnu)**:
```bash
# 添加目标
rustup target add aarch64-unknown-linux-gnu

# 安装交叉编译工具链
brew install messense/macos-cross-toolchains/aarch64-unknown-linux-gnu

# 配置 ~/.cargo/config.toml
[target.aarch64-unknown-linux-gnu]
linker = "aarch64-unknown-linux-gnu-gcc"

# 编译
cargo build --release --target aarch64-unknown-linux-gnu
```

**一键构建双平台**:
```bash
./build-daemon.sh
```

**实际输出 (2026-04-03)**:
```
🔨 Building clawpilot-daemon for macOS...
    Finished `release` profile [optimized] target(s) in 29.35s
🔨 Building clawpilot-daemon for Linux (aarch64)...
    Finished `release` profile [optimized] target(s) in 0.21s
✅ Daemon build complete!
  macOS: daemon/target/aarch64-apple-darwin/release/clawpilot-daemon
  Linux: daemon/target/aarch64-unknown-linux-gnu/release/clawpilot-daemon
```

### 2. 检查项

- [x] daemon binary 存在：`daemon/target/release/clawpilot-daemon`
- [x] binary 可执行：`./daemon/target/release/clawpilot-daemon --version`

---

## 测试用例 1: macOS 本机安装测试

**测试目标**: 验证在 macOS 本机安装 daemon 功能

### 前置条件
- macOS 10.13+
- Rust 工具链
- 无 sudo 权限要求

### 测试步骤

#### Step 1: 手动安装测试

**实际测试结果 (2026-04-03)**:
```
✅ Binary 已复制到 ~/.clawpilot/bin/clawpilot-daemon (6.6MB)
✅ 版本输出：clawpilot-daemon 0.1.0
✅ 进程运行中：PID 44503
✅ API Key 生成：fbced083b52941b1906a83a460b35ef7 (32 位 UUID)
✅ 健康检查响应：{"openclaw_status":"running","status":"ok","version":"0.1.0"}
```

**执行命令**:
```bash
# 1. 创建目录
mkdir -p ~/.clawpilot/bin ~/.clawpilot/logs

# 2. 复制 binary
cp daemon/target/release/clawpilot-daemon ~/.clawpilot/bin/
chmod +x ~/.clawpilot/bin/clawpilot-daemon

# 3. 验证 binary 可执行
~/.clawpilot/bin/clawpilot-daemon --version

# 4. 手动启动 daemon (后台运行)
nohup ~/.clawpilot/bin/clawpilot-daemon --listen 127.0.0.1:16668 > ~/.clawpilot/logs/daemon.log 2>&1 &

# 5. 检查进程
pgrep -x clawpilot-daemon

# 6. 检查 API Key 生成
cat ~/.clawpilot/daemon.key

# 7. 检查健康端点
curl -s http://127.0.0.1:16668/health | jq

# 8. 停止 daemon
pkill -x clawpilot-daemon
```

#### Step 2: launchd 用户级服务测试

```bash
# 1. 创建 plist 文件
cat > ~/Library/LaunchAgents/com.clawpilot.daemon.plist << 'EOF'
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
    <key>Label</key>
    <string>com.clawpilot.daemon</string>
    <key>ProgramArguments</key>
    <array>
        <string>/Users/$(whoami)/.clawpilot/bin/clawpilot-daemon</string>
        <string>--listen</string>
        <string>127.0.0.1:16668</string>
    </array>
    <key>RunAtLoad</key>
    <true/>
    <key>KeepAlive</key>
    <dict>
        <key>SuccessfulExit</key>
        <false/>
        <key>Crashed</key>
        <true/>
    </dict>
    <key>StandardOutPath</key>
    <string>/Users/$(whoami)/.clawpilot/logs/daemon.log</string>
    <key>StandardErrorPath</key>
    <string>/Users/$(whoami)/.clawpilot/logs/daemon.log</string>
</dict>
</plist>
EOF

# 2. 加载 launchd agent
launchctl load -w ~/Library/LaunchAgents/com.clawpilot.daemon.plist

# 3. 检查服务状态
launchctl list | grep clawpilot

# 4. 检查健康端点
curl -s http://127.0.0.1:16668/health | jq

# 5. 卸载服务
launchctl unload -w ~/Library/LaunchAgents/com.clawpilot.daemon.plist
```

**实际测试结果 (2026-04-03)**:
```
✅ Plist 文件创建成功，plutil 验证通过
✅ Launchd agent 加载成功
✅ 服务在 launchctl list 中：45226	0	com.clawpilot.daemon
✅ 进程运行中：PID 45226
✅ 健康检查响应：{"openclaw_status":"running","status":"ok","version":"0.1.0"}
```

### 预期结果

| 检查项 | 预期结果 |
|--------|----------|
| binary 复制 | ✅ 成功复制到 `~/.clawpilot/bin/` |
| API Key 生成 | ✅ 生成 32 位 UUID 格式 key |
| 进程启动 | ✅ `pgrep` 返回 PID |
| 健康检查 | ✅ `/health` 返回 `{"status":"ok",...}` |
| launchd 加载 | ✅ `launchctl list` 显示服务 |
| 日志文件 | ✅ `~/.clawpilot/logs/daemon.log` 有内容 |

---

## 测试用例 2: Linux (OrbStack) 安装测试

**测试目标**: 验证在 Linux 环境下 daemon 安装功能

### 前置条件
- OrbStack 已安装
- 可创建新的 Linux 环境
- **重要**: 需要在 Linux 环境中编译 daemon binary（macOS binary 不兼容 Linux）

### 在 Linux 环境中编译 Daemon

```bash
# 1. 进入 OrbStack 环境
orb shell clawpilot-test

# 2. 安装 Rust
curl --proto '=https' --tlsv1.2 -sSf https://sh.rustup.rs | sh -s -- -y
source $HOME/.cargo/env

# 3. 克隆项目并编译
cd /tmp
git clone https://github.com/clawpilot/clawpilot.git
cd clawpilot/daemon
cargo build --release

# 4. 验证 binary
./target/release/clawpilot-daemon --version
```

### 测试步骤

#### Step 1: 创建 OrbStack Linux 环境

```bash
# 1. 创建新的 Ubuntu 环境
orb create ubuntu:22.04 clawpilot-test

# 2. 进入环境
orb shell clawpilot-test

# 3. 安装必要工具
apt update && apt install -y curl wget jq
```

#### Step 2: 在 Linux 环境中测试

```bash
# 1. 创建目录
mkdir -p ~/.clawpilot/bin ~/.clawpilot/logs

# 2. 从 macOS 复制 binary 到 OrbStack
orb cp clawpilot-test ~/.clawpilot/bin/clawpilot-daemon:$(pwd)/daemon/target/release/clawpilot-daemon

# 3. 设置权限
chmod +x ~/.clawpilot/bin/clawpilot-daemon

# 4. 验证 binary
~/.clawpilot/bin/clawpilot-daemon --version

# 5. 启动 daemon
nohup ~/.clawpilot/bin/clawpilot-daemon --listen 127.0.0.1:16668 > ~/.clawpilot/logs/daemon.log 2>&1 &

# 6. 检查进程
pgrep -x clawpilot-daemon

# 7. 检查健康端点
curl -s http://127.0.0.1:16668/health | jq

# 8. 停止 daemon
pkill -x clawpilot-daemon
```

#### Step 3: systemd user service 测试

```bash
# 1. 创建 service 文件
mkdir -p ~/.config/systemd/user

cat > ~/.config/systemd/user/clawpilot-daemon.service << 'EOF'
[Unit]
Description=ClawPilot Daemon
After=network.target

[Service]
Type=simple
ExecStart=%h/.clawpilot/bin/clawpilot-daemon --listen 127.0.0.1:16668
Restart=on-failure
RestartSec=5

[Install]
WantedBy=default.target
EOF

# 2. 重载 systemd
export XDG_RUNTIME_DIR=/run/user/$(id -u)
systemctl --user daemon-reload

# 3. 启用并启动服务
systemctl --user enable --now clawpilot-daemon.service

# 4. 检查服务状态
systemctl --user status clawpilot-daemon.service

# 5. 检查健康端点
curl -s http://127.0.0.1:16668/health | jq

# 6. 停止服务
systemctl --user stop clawpilot-daemon.service
```

### 预期结果

| 检查项 | 预期结果 |
|--------|----------|
| binary 复制 | ✅ 成功复制到 `~/.clawpilot/bin/` |
| API Key 生成 | ✅ 生成 32 位 UUID 格式 key |
| 进程启动 | ✅ `pgrep` 返回 PID |
| 健康检查 | ✅ `/health` 返回 `{"status":"ok",...}` |
| systemd 加载 | ✅ `systemctl --user status` 显示 active |
| 日志文件 | ✅ `~/.clawpilot/logs/daemon.log` 有内容 |

---

## 测试用例 3: Tauri 应用集成测试

**测试目标**: 验证通过 Tauri App 安装 daemon

### 测试步骤

```bash
# 1. 构建 Tauri 应用
npm run tauri build

# 2. 运行应用
./src-tauri/target/release/ClawPilot

# 3. UI 操作测试
#    a. 创建新办公室
#    b. 点击「安装物业」
#    c. 选择「本机安装」
#    d. 观察安装日志
#    e. 验证 daemon_url 和 api_key 自动回填
```

### 预期结果

| 检查项 | 预期结果 |
|--------|----------|
| 构建成功 | ✅ 无编译错误 |
| 安装流程 | ✅ UI 显示安装进度日志 |
| 自动配置 | ✅ daemon_url 和 api_key 自动保存 |
| 服务运行 | ✅ daemon 在后台运行 |

---

## 测试检查清单

### macOS 检查项

- [x] 1. daemon binary 成功复制到 `~/.clawpilot/bin/`
- [x] 2. API Key 生成并保存到 `~/.clawpilot/daemon.key`
- [x] 3. launchd plist 创建成功
- [x] 4. launchd 服务加载成功
- [x] 5. `/health` 端点响应正常
- [x] 6. 日志文件正常写入
- [x] 7. 一键构建脚本工作正常

### Linux 检查项

- [x] 1. daemon binary 成功复制到 `~/.clawpilot/bin/`
- [x] 2. API Key 生成并保存到 `~/.clawpilot/daemon.key`
- [x] 3. systemd user service 创建成功
- [x] 4. systemd 服务加载成功
- [x] 5. `/health` 端点响应正常
- [x] 6. 日志文件正常写入

---

## 故障排查

### 常见问题

**Q1: launchd 服务无法启动**
```bash
# 检查 plist 语法
plutil -lint ~/Library/LaunchAgents/com.clawpilot.daemon.plist

# 手动启动测试
~/Library/LaunchAgents/com.clawpilot.daemon.plist

# 查看系统日志
log show --predicate 'eventMessage contains "clawpilot"' --last 5m
```

**Q2: systemd 服务无法启动**
```bash
# 检查用户会话
loginctl show-session $(loginctl | grep $(whoami) | awk '{print $1}') -p Type

# 检查 runtime dir
echo $XDG_RUNTIME_DIR

# 查看服务日志
journalctl --user -u clawpilot-daemon.service -n 50
```

**Q3: daemon 无法绑定端口**
```bash
# 检查端口占用
lsof -i :16668

# 尝试其他端口
clawpilot-daemon --listen 127.0.0.1:16669
```

---

## 测试用例 4: 安装物业完整流程（Server 模式 + 远程 SSH）

**测试日期**: 2026-04-11
**测试目标**: 验证通过 ClawPilot Server (`http://localhost:16667`) 对远程 Linux 办公室执行完整安装物业流程（daemon + OpenClaw 离线包）

### 环境

| 项目 | 值 |
|------|-----|
| 办公室 IP | `192.168.139.237` |
| 平台 / 架构 | Linux arm64 (Ubuntu 25.10) |
| SSH 认证 | ssh_key（`~/.orbstack/ssh/id_ed25519`） |
| SSH 用户 | `jiechen` |
| daemon 端口 | `16668` |
| OpenClaw 版本 | `2026.4.9` |

### 测试步骤

#### Step 1: 启动 Server

```bash
npm run server:dev
```

#### Step 2: 检查 SSH 连通性

```bash
curl -s -X POST http://localhost:16667/api/check_ssh_auth \
  -H 'Content-Type: application/json' \
  -d '{
    "address": "192.168.139.237",
    "auth_type": "ssh_key",
    "user": "jiechen",
    "key_path": "~/.orbstack/ssh/id_ed25519"
  }'
```

**预期响应**:
```json
{"ok":true,"latency_ms":374,"sudo_ok":true,"platform":"linux","arch":"arm64"}
```

#### Step 3: 执行安装物业

```bash
curl -s -X POST http://localhost:16667/api/install_openclaw \
  -H 'Content-Type: application/json' \
  -d '{
    "office_id": "<办公室 ID>",
    "mode": "ssh",
    "ssh_host": "192.168.139.237",
    "ssh_port": 22,
    "ssh_user": "jiechen",
    "ssh_key_path": "~/.orbstack/ssh/id_ed25519"
  }'
```

**预期关键日志**:
```
📡 连接 daemon...
   最新版本: 2026.4.9
   平台: linux, 架构: arm64        ← 必须是 arm64，不能是 x64
📦 Daemon 未配置，先安装 daemon...
✅ 找到: .../daemon/target/aarch64-unknown-linux-gnu/release/clawpilot-daemon
✅ 系统服务已注册
📤 提交安装任务到 daemon...
✅ 使用已缓存包 / 下载离线包...
✅ SHA256 校验通过
✅ 解压完成: ~/.clawpilot/openclaw-pkgs/openclaw-2026.4.9
✅ ~/.clawpilot/openclaw-current -> openclaw-2026.4.9
✅ 系统服务已注册
✅ OpenClaw 已就绪: OpenClaw 2026.4.9 (...)
```

**预期最终响应**:
```json
{"ok":true,"version":"2026.4.9","logs":[...]}
```

#### Step 4: 验证远端状态

```bash
ssh jiechen@192.168.139.237 '
  systemctl --user status clawpilot-daemon | head -5
  systemctl --user status openclaw-gateway | head -5
  ls -la ~/.clawpilot/openclaw-current
  ls ~/.clawpilot/openclaw-pkgs/
'
```

**预期**:
- `clawpilot-daemon.service` 和 `openclaw-gateway.service` 均 `active (running)`
- `~/.clawpilot/openclaw-current` 是指向 `~/.clawpilot/openclaw-pkgs/openclaw-2026.4.9` 的符号链接
- `~/.clawpilot/openclaw-pkgs/` 包含 tar.gz、.sha256、`openclaw-2026.4.9/` 三项

### 实测结果（2026-04-11）

| 步骤 | 结果 |
|------|------|
| SSH 连通 + sudo 权限 | ✅ `latency_ms: 374, sudo_ok: true` |
| daemon 自动安装（SSH 模式） | ✅ systemd 用户服务启动 |
| Health 返回 platform/arch | ✅ `{"platform":"linux","arch":"arm64"}` |
| 离线包下载（约 494MB） | ✅ 从 GitHub Releases 下载 |
| SHA256 校验 | ✅ 通过 |
| 解压到 `~/.clawpilot/openclaw-pkgs/openclaw-2026.4.9` | ✅ |
| symlink `~/.clawpilot/openclaw-current` | ✅ |
| onboard 注册 openclaw-gateway.service | ✅ `active (running)` |
| 安装验证 | ✅ `OpenClaw 2026.4.9 (0512059)` |
| **整体结果** | ✅ `{"ok":true,"version":"2026.4.9"}` |

### 测试中发现并修复的 Bug

| # | 问题 | 影响 | 修复 |
|---|------|------|------|
| 1 | `readFile()` 用 `cat "${path}"` 双引号不展开 `~` | daemon key 读取失败 → 生成新 key → API key 不匹配 → Unauthorized | `server/utils/ssh.js`: `~/ → $HOME/` |
| 2 | aarch64 binary 过旧，`/health` 不含 `platform`/`arch` 字段 | 默认 `linux/x64`，下载错误架构包 | 重新编译 daemon |
| 3 | `extract_tarball` 未清理已有目录，重试时解压失败 | 第二次安装报错 `failed to unpack` | `daemon/src/install.rs`: 解压前先 `remove_dir_all` |
| 4 | `check_openclaw_installed` 用 `which openclaw` | onboard 不将 openclaw 加入 PATH → 验证失败 | 改为走 `~/.clawpilot/openclaw-current/nodejs/bin/node` |

### 目录结构（安装完成后）

```
~/.clawpilot/
├── daemon.key                        # daemon API Key
├── openclaw-current -> openclaw-pkgs/openclaw-2026.4.9   # symlink
└── openclaw-pkgs/
    ├── openclaw-pkgs-v2026.4.9-linux-arm64.tar.gz        # 离线包缓存
    ├── openclaw-pkgs-v2026.4.9-linux-arm64.tar.gz.sha256
    └── openclaw-2026.4.9/            # 解压后安装目录
        ├── nodejs/
        ├── node_modules/
        └── package.json
```
