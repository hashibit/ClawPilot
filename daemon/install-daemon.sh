#!/bin/bash
set -e

# ClawPilot Daemon 一键安装脚本
# 用法：curl -fsSL https://clawpilot.ai/install-daemon.sh | sudo bash

DAEMON_URL="https://github.com/clawpilot/clawpilot/releases/latest/download/clawpilot-daemon"
SERVICE_URL="https://raw.githubusercontent.com/clawpilot/clawpilot/main/daemon/clawpilot-daemon.service"
BIN_PATH="/usr/local/bin/clawpilot-daemon"
SERVICE_PATH="/etc/systemd/system/clawpilot-daemon.service"

echo "🔧 ClawPilot Daemon 安装脚本"
echo "=============================="

# 检查是否以 root 运行
if [ "$EUID" -ne 0 ]; then
  echo "❌ 请使用 sudo 运行此脚本"
  exit 1
fi

# 下载二进制
echo "📥 下载 Daemon 二进制..."
curl -fsSL "$DAEMON_URL" -o /tmp/clawpilot-daemon
chmod +x /tmp/clawpilot-daemon
mv /tmp/clawpilot-daemon "$BIN_PATH"
echo "✅ 二进制已安装到 $BIN_PATH"

# 下载 systemd 服务文件
echo "📥 下载 systemd 服务文件..."
curl -fsSL "$SERVICE_URL" -o "$SERVICE_PATH"
echo "✅ 服务文件已安装到 $SERVICE_PATH"

# 重载 systemd
echo "🔄 重载 systemd..."
systemctl daemon-reload

# 启用并启动服务
echo "🚀 启用并启动服务..."
systemctl enable clawpilot-daemon
systemctl start clawpilot-daemon

# 等待服务启动
sleep 2

# 显示状态
echo ""
echo "✅ 安装完成！"
echo ""
echo "📊 服务状态:"
systemctl status clawpilot-daemon --no-pager -l
echo ""

# 显示 API Key
echo "🔑 API Key (请复制保存):"
echo "=============================="
journalctl -u clawpilot-daemon -n 50 --no-pager | grep "API Key" | tail -1
echo "=============================="
echo ""
echo "⚠️  重要：将此 API Key 配置到 ClawPilot App 的办公室设置中"
echo ""
echo "📖 使用帮助:"
echo "  查看状态：sudo systemctl status clawpilot-daemon"
echo "  查看日志：sudo journalctl -u clawpilot-daemon -f"
echo "  重启服务：sudo systemctl restart clawpilot-daemon"
echo ""
