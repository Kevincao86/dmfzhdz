#!/usr/bin/env bash
# 上传前检查：单张图片/音频须 ≤200KB（微信代码质量）
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
MAX=204800
FAIL=0
while IFS= read -r -d '' f; do
  sz=$(wc -c <"$f" | tr -d ' ')
  if [[ "$sz" -gt "$MAX" ]]; then
    echo "OVER 200KB: $f ($sz bytes)"
    FAIL=1
  fi
done < <(
  find "$ROOT" \
    -path "$ROOT/node_modules" -prune -o \
    -path "$ROOT/cloudfunctions" -prune -o \
    -type f \( -iname '*.jpg' -o -iname '*.jpeg' -o -iname '*.png' -o -iname '*.gif' -o -iname '*.webp' -o -iname '*.mp3' -o -iname '*.wav' \) \
    -print0
)
if [[ "$FAIL" -ne 0 ]]; then
  echo ""
  echo "修复：bash scripts/mp-compress-orbit-images.sh"
  echo "并删除 images/login-orbit/*.png"
  exit 1
fi
echo "OK: 所有图片/音频 ≤200KB"
