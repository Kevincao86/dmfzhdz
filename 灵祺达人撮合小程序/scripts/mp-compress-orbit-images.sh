#!/usr/bin/env bash
# 登录环墙样片压到 <200KB（微信代码质量扫描）
set -euo pipefail
DIR="$(cd "$(dirname "$0")/../images/login-orbit" && pwd)"
cd "$DIR"
rm -f orbit-*.png 2>/dev/null || true
for i in 01 02 03 04 05 06; do
  f="orbit-${i}.jpg"
  [[ -f "$f" ]] || continue
  sips -Z 420 "$f" --out "${f}.tmp" -s format jpeg -s formatOptions 72
  mv "${f}.tmp" "$f"
  sz=$(wc -c <"$f" | tr -d ' ')
  if [[ "$sz" -gt 204800 ]]; then
    echo "WARN: $f still ${sz} bytes (>200KB)"
    exit 1
  fi
  echo "OK $f ($sz bytes)"
done
