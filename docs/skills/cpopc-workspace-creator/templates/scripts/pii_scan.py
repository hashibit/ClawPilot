#!/usr/bin/env python3
"""
PII 扫描脚本
扫描团队所有 Agent 的 memory 文件，检测是否含有敏感个人信息。
输出 JSON 到 stdout，由 guard agent 的 HEARTBEAT 解析。

检测项：中国手机号、身份证号、银行卡号、邮箱

输出格式：
  {"found": false, "scanned_files": 12}
  {"found": true, "hits": [{"file": "...", "type": "phone", "snippet": "138****8888 附近"}]}
"""
import json
import re
from pathlib import Path

# 扫描范围：OPC 团队目录下所有 Agent 的 memory 文件
# 脚本位于 <团队目录>/scripts/，向上一级是团队目录
TEAM_DIR = Path(__file__).parent.parent

PII_PATTERNS = [
    # 中国手机号：1 开头，第二位 3-9，共 11 位
    ("phone",    re.compile(r"(?<!\d)(1[3-9]\d{9})(?!\d)")),
    # 居民身份证：17位数字 + 1位数字或X；用数字边界替代 \b（\b 在中文环境不可靠）
    ("id_card",  re.compile(r"(?<!\d)(\d{17}[\dXx])(?![\dXx])")),
    # 银行卡号：16-17位或19位纯数字；18位排除（与身份证号重叠）
    ("bankcard", re.compile(r"(?<!\d)(\d{16,17}|\d{19})(?!\d)")),
    # 邮箱
    ("email",    re.compile(r"[\w.+-]+@[\w-]+\.[a-zA-Z]{2,}")),
]

REDACT = {
    "phone":    lambda m: m[:3] + "****" + m[-4:],
    "id_card":  lambda m: m[:4] + "**********" + m[-2:],
    "bankcard": lambda m: m[:4] + "****" + m[-4:],
    "email":    lambda m: m[:2] + "***" + m[m.index("@"):],
}


def scan_file(path: Path) -> list[dict]:
    hits = []
    try:
        text = path.read_text(encoding="utf-8", errors="ignore")
    except OSError:
        return hits

    for ptype, pattern in PII_PATTERNS:
        for match in pattern.finditer(text):
            raw      = match.group(0)
            redacted = REDACT[ptype](raw)
            start    = max(0, match.start() - 20)
            end      = min(len(text), match.end() + 20)
            snippet  = text[start:end].replace(raw, redacted).replace("\n", " ")
            hits.append({
                "file":    str(path.relative_to(TEAM_DIR)),
                "type":    ptype,
                "snippet": f"...{snippet}...",
            })
    return hits


def main():
    memory_files = list(TEAM_DIR.glob("*/memory/*.md"))
    all_hits     = []

    for f in memory_files:
        all_hits.extend(scan_file(f))

    if all_hits:
        print(json.dumps({"found": True, "hits": all_hits}, ensure_ascii=False, indent=2))
    else:
        print(json.dumps({"found": False, "scanned_files": len(memory_files)}))


if __name__ == "__main__":
    main()
