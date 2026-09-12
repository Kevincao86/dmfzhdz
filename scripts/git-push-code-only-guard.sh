#!/usr/bin/env bash
# 禁止把文档/素材目录推进 GitHub / Gitee。应用 public、小程序图仍算代码资产。
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"

range=""
if git rev-parse --verify --quiet origin/main >/dev/null; then
  range="origin/main..HEAD"
elif git rev-parse --verify --quiet gitee/main >/dev/null; then
  range="gitee/main..HEAD"
fi

if [[ -z "$range" ]]; then
  exit 0
fi

blocked="$(
  git diff --name-only "$range" | python3 -c '
import sys
rules = (
    "docs/",
    "商业BP/",
    "公众号首发文章/",
    "营销素材/",
    "调研报告/",
    "页面/",
    "videos/",
    ".media/",
)
hits = []
for line in sys.stdin:
    p = line.strip().strip("\"")
    if not p:
        continue
    if any(p == r[:-1] or p.startswith(r) for r in rules):
        hits.append(p)
for h in hits:
    print(h)
'
)"

# 本仓库允许：从远程拿掉文档（D），禁止再新增文档（A/M）
if [[ -z "$blocked" ]]; then
  exit 0
fi

bad="$(
  git diff --name-status "$range" | python3 -c '
import sys
rules = (
    "docs/",
    "商业BP/",
    "公众号首发文章/",
    "营销素材/",
    "调研报告/",
    "页面/",
    "videos/",
    ".media/",
)
def hit(p):
    return any(p == r[:-1] or p.startswith(r) for r in rules)
for line in sys.stdin:
    line = line.rstrip("\n")
    if not line:
        continue
    parts = line.split("\t", 1)
    if len(parts) < 2:
        continue
    status, path = parts[0], parts[1].strip().strip("\"")
    if hit(path) and not status.startswith("D"):
        print(path)
'
)"

if [[ -n "$bad" ]]; then
  echo "FATAL: 远程只推代码。以下文档/素材出现在待推送提交中（请 gitignore 或勿 add）："
  echo "$bad"
  exit 1
fi
