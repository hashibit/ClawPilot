#!/usr/bin/env python3
"""
蜜罐文件监控脚本
扫描团队所有 workspace 下 .ppp-secret/ 目录中的蜜罐文件，检测 atime 变化。
输出 JSON 到 stdout，由 guard agent 的 cron 任务解析。

蜜罐位置：<团队目录>/workspace-*/.ppp-secret/  下所有文件

输出格式：
  {"triggered": false, "checked": 6}
  {"triggered": true, "accessed": [{"file": "...", "workspace": "...", "at": "..."}]}
"""
import json
import time
from pathlib import Path

# 脚本位于 <团队目录>/scripts/，向上一级是团队目录
TEAM_DIR   = Path(__file__).parent.parent
STATE_FILE = Path(__file__).parent / ".pot_state.json"


def load_state() -> dict:
    if STATE_FILE.exists():
        return json.loads(STATE_FILE.read_text())
    return {}


def save_state(state: dict):
    STATE_FILE.write_text(json.dumps(state, indent=2))


def find_honeypots() -> list[Path]:
    """找出所有 workspace/.ppp-secret/ 下的蜜罐文件"""
    return list(TEAM_DIR.glob("workspace-*/.ppp-secret/*"))


def main():
    files = find_honeypots()
    if not files:
        print(json.dumps({"triggered": False, "error": "no honeypot files found"}))
        return

    state    = load_state()
    accessed = []

    for f in files:
        atime = f.stat().st_atime
        key   = str(f)
        prev  = state.get(key, 0)

        if prev == 0:
            # 首次运行：记录基线，不告警
            state[key] = atime
            continue

        if atime > prev:
            accessed.append({
                "workspace": f.parent.parent.name,
                "file":      f.name,
                "at":        time.strftime("%Y-%m-%d %H:%M:%S", time.localtime(atime)),
            })
            state[key] = atime

    save_state(state)

    if accessed:
        print(json.dumps({"triggered": True, "accessed": accessed}, ensure_ascii=False))
    else:
        print(json.dumps({"triggered": False, "checked": len(files)}))


if __name__ == "__main__":
    main()
