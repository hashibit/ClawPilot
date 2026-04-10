# OpenClaw 离线包安装 SOP

## 概述

使用 `hashibit/openclaw-pkgs` 项目的离线包安装 OpenClaw，无需用户预装 Node.js 或 git。

## 离线包信息

| 项目 | GitHub Releases |
|------|-----------------|
| **仓库** | https://github.com/hashibit/openclaw-pkgs |
| **内容** | Node.js 22.x + OpenClaw + 所有依赖 |
| **大小** | ~500MB（因平台略有差异） |

## 支持平台

| 平台 | 架构 | 文件名格式 |
|------|------|------------|
| macOS | x64 (Intel) | `darwin-x64.tar.gz` |
| macOS | arm64 (M1/M2) | `darwin-arm64.tar.gz` |
| Linux | x64 (amd64) | `linux-x64.tar.gz` |
| Linux | arm64 | `linux-arm64.tar.gz` |
| Windows | x64 | `windows-x64.zip` |
| Windows | arm64 | `windows-arm64.zip` |

---

## 安装步骤

### Step 1: 获取最新版本号

```bash
# 从 npm registry 获取最新版本
curl -s https://registry.npmjs.org/openclaw/latest | jq -r '.version'
# 输出示例: 2026.4.9
```

### Step 2: 确定目标平台

```bash
# 检测操作系统
OS=$(uname -s | tr '[:upper:]' '[:lower:]')  # linux / darwin

# 检测架构
ARCH=$(uname -m)
case $ARCH in
  x86_64|amd64)  ARCH="x64" ;;
  aarch64|arm64) ARCH="arm64" ;;
esac

echo "Platform: $OS-$ARCH"
```

### Step 3: 下载离线包

```bash
VERSION="2026.4.9"  # 从 Step 1 获取
PLATFORM="linux-arm64"  # 从 Step 2 获取

DOWNLOAD_URL="https://github.com/hashibit/openclaw-pkgs/releases/download/v${VERSION}/openclaw-pkgs-v${VERSION}-${PLATFORM}.tar.gz"
SHA256_URL="${DOWNLOAD_URL}.sha256"

# 下载
cd /tmp
curl -L -o openclaw-pkgs.tar.gz "$DOWNLOAD_URL"
curl -L -o openclaw-pkgs.tar.gz.sha256 "$SHA256_URL"
```

### Step 4: 校验 SHA256

```bash
# 优先尝试标准格式，失败则回退到纯 hash 格式
if sha256sum -c openclaw-pkgs.tar.gz.sha256 --status 2>/dev/null; then
  echo "Checksum OK (standard format)"
else
  # 回退：手动比对纯 hash
  EXPECTED=$(cat openclaw-pkgs.tar.gz.sha256 | awk '{print $1}')
  ACTUAL=$(sha256sum openclaw-pkgs.tar.gz | awk '{print $1}')
  if [ "$EXPECTED" = "$ACTUAL" ]; then
    echo "Checksum OK (plain hash format)"
  else
    echo "Checksum FAILED: expected $EXPECTED, got $ACTUAL"
    exit 1
  fi
fi
```

### Step 5: 解压到目标目录

```bash
INSTALL_DIR="$HOME/openclaw-v${VERSION}"
mkdir -p "$INSTALL_DIR"
tar -xzf openclaw-pkgs.tar.gz -C "$INSTALL_DIR"
```

解压后目录结构：
```
$INSTALL_DIR/
├── nodejs/           # Node.js 22.x 运行时
│   └── bin/node      # Node 可执行文件
├── node_modules/     # OpenClaw + 所有依赖
│   └── .bin/openclaw # OpenClaw CLI
├── package.json
├── package-lock.json
└── README.md
```

### Step 6: 运行 OpenClaw

```bash
# 验证版本
"$INSTALL_DIR/nodejs/bin/node" "$INSTALL_DIR/node_modules/.bin/openclaw" --version
# 输出: OpenClaw 2026.4.9 (0512059)
```

### Step 7: 注册系统服务（onboard）

```bash
"$INSTALL_DIR/nodejs/bin/node" "$INSTALL_DIR/node_modules/.bin/openclaw" onboard \
  --non-interactive \
  --install-daemon \
  --skip-skills \
  --skip-health \
  --accept-risk
```

**onboard 完成后自动执行：**
- 创建 `~/.openclaw/` 目录
- 生成 `~/.openclaw/openclaw.json` 配置文件
- 注册 systemd/launchd 服务
- 启动 Gateway（默认端口 18789）

### Step 8: 验证服务状态

```bash
# Linux (systemd)
systemctl --user status openclaw-gateway

# macOS (launchd)
launchctl list | grep openclaw

# 检查 Gateway 健康
curl -s http://localhost:18789/health
# 输出: {"ok":true,"status":"live"}
```

### Step 9: 创建 symlink（可选）

```bash
# 创建 current symlink 便于管理
ln -sfn "$HOME/openclaw-v${VERSION}" "$HOME/.openclaw/current"

# 后续可直接使用
"$HOME/.openclaw/current/nodejs/bin/node" "$HOME/.openclaw/current/node_modules/.bin/openclaw" ...
```

---

## 清理临时文件

```bash
rm /tmp/openclaw-pkgs.tar.gz /tmp/openclaw-pkgs.tar.gz.sha256
```

---

## 版本更新流程

当需要更新到新版本时：

```bash
# 1. 下载新版本离线包（重复 Step 1-5）
NEW_VERSION="2026.5.0"
# ...下载解压到 ~/openclaw-v2026.5.0

# 2. 停止旧服务
systemctl --user stop openclaw-gateway

# 3. 运行新版本 onboard
~/openclaw-v${NEW_VERSION}/nodejs/bin/node \
  ~/openclaw-v${NEW_VERSION}/node_modules/.bin/openclaw onboard \
  --non-interactive --install-daemon --skip-skills --skip-health --accept-risk

# 4. 更新 symlink
ln -sfn "$HOME/openclaw-v${NEW_VERSION}" "$HOME/.openclaw/current"

# 5. 验证新版本
curl -s http://localhost:18789/health
```

---

## 常见问题

### Q: sha256 校验失败？

校验逻辑会自动兼容两种格式：
```bash
# 标准格式优先
sha256sum -c file.sha256 --status

# 失败则回退到纯 hash 格式手动比对
EXPECTED=$(cat file.sha256 | awk '{print $1}')
ACTUAL=$(sha256sum file | awk '{print $1}')
[ "$EXPECTED" = "$ACTUAL" ]
```

### Q: Windows 平台如何运行？

Windows 使用 `.zip` 格式，解压后：
```cmd
nodejs\node.exe node_modules\.bin\openclaw onboard --non-interactive --install-daemon ...
```

### Q: 如何卸载？

```bash
# 停止并禁用服务
systemctl --user stop openclaw-gateway
systemctl --user disable openclaw-gateway

# 删除服务文件
rm ~/.config/systemd/user/openclaw-gateway.service

# 删除安装目录
rm -rf ~/openclaw-v*

# 保留或删除配置（谨慎）
# rm -rf ~/.openclaw  # 这会删除所有配置和 workspace
```

---

## 实测记录

| 日期 | 版本 | 平台 | 机器 | 结果 |
|------|------|------|------|------|
| 2026-04-10 | v2026.4.9 | Linux arm64 (Ubuntu 25.10) | 192.168.139.207 | ✅ 成功 |
| 2026-04-10 | v2026.4.9 | Linux arm64 (Ubuntu 25.10) | 192.168.139.70 (OrbStack VM) | ✅ SOP 验证成功 |

**实测命令：**
```bash
ssh jiechen@192.168.139.207

# 下载
curl -L -o openclaw-pkgs.tar.gz \
  "https://github.com/hashibit/openclaw-pkgs/releases/download/v2026.4.9/openclaw-pkgs-v2026.4.9-linux-arm64.tar.gz"

# 解压
mkdir -p ~/openclaw-v2026.4.9
tar -xzf openclaw-pkgs.tar.gz -C ~/openclaw-v2026.4.9

# 运行
~/openclaw-v2026.4.9/nodejs/bin/node ~/openclaw-v2026.4.9/node_modules/.bin/openclaw onboard \
  --non-interactive --install-daemon --skip-skills --skip-health --accept-risk

# 验证
systemctl --user status openclaw-gateway  # ✅ active (running)
curl http://localhost:18789/health         # ✅ {"ok":true,"status":"live"}
```