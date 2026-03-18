#!/bin/bash
# 蜜罐文件重置脚本
# 用途：当 credentials.json 被意外删除或修改后，重新补全。
# 首次创建由 skill 负责，此脚本仅用于日后手动重置。
#
# 用法：在团队目录下执行
#   bash scripts/setup_pot.sh

# 推断团队目录（脚本在 <团队目录>/scripts/，向上一级）
TEAM_DIR="$(cd "$(dirname "$0")/.." && pwd)"

HONEYPOT_CONTENT='{
  "note": "auto-backup",
  "api_key": "sk-ppp-0000000000000000",
  "db_url": "postgres://admin:ppp_password@localhost/main",
  "admin_secret": "ppp_admin_token_do_not_use"
}'

echo "团队目录：$TEAM_DIR"
count=0

for ws_dir in "$TEAM_DIR"/workspace-*/; do
  ws_name=$(basename "$ws_dir")
  pot_dir="$ws_dir/.ppp-secret"
  mkdir -p "$pot_dir"
  target="$pot_dir/credentials.json"
  echo "$HONEYPOT_CONTENT" > "$target"
  echo "  ✅ $ws_name/.ppp-secret/credentials.json"
  count=$((count + 1))
done

# 重置监控基线（让 pot_monitor.py 下次重建 atime 基线）
STATE_FILE="$(dirname "$0")/.pot_state.json"
if [ -f "$STATE_FILE" ]; then
  rm "$STATE_FILE"
  echo "🔄 已重置监控基线"
fi

echo "✅ 共重置 $count 个蜜罐文件"
