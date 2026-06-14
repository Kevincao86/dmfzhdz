#!/usr/bin/env bash
# 仅检查，不压缩（逻辑与 mp-compress-orbit-images.sh 末尾一致）
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
    -path "$ROOT/assets/recruit-poster-bg" -prune -o \
    -path "$ROOT/assets/recruit-covers" -prune -o \
    -path "$ROOT/packages/recruit-covers-mp" -prune -o \
    -path "$ROOT/images/home" -prune -o \
    -path "$ROOT/images/auth" -prune -o \
    -path "$ROOT/images/login-orbit" -prune -o \
    -path "$ROOT/images/identity" -prune -o \
    -path "$ROOT/images/recommend" -prune -o \
    -path "$ROOT/images/logo-candidates" -prune -o \
    -path "$ROOT/docs" -prune -o \
    -type f \( -iname '*.jpg' -o -iname '*.jpeg' -o -iname '*.png' -o -iname '*.gif' -o -iname '*.webp' -o -iname '*.mp3' -o -iname '*.wav' \) \
    -print0
)
if [[ "$FAIL" -ne 0 ]]; then
  echo "运行: bash scripts/mp-compress-orbit-images.sh"
  exit 1
fi
echo "OK: 所有图片/音频 ≤200KB"
