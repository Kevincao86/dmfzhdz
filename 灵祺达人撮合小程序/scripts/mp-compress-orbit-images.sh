#!/usr/bin/env bash
# 登录环墙 + images 目录：单文件压到 <200KB（微信代码质量）
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
MAX=204800
ORBIT="$ROOT/images/login-orbit"

rm -f "$ORBIT"/orbit-*.png 2>/dev/null || true

compress_jpeg() {
  local f="$1"
  local max_px="${2:-400}"
  local q="${3:-68}"
  sips -Z "$max_px" "$f" --out "${f}.tmp.jpg" -s format jpeg -s formatOptions "$q" >/dev/null
  mv "${f}.tmp.jpg" "$f"
  local sz
  sz=$(wc -c <"$f" | tr -d ' ')
  if [[ "$sz" -gt "$MAX" ]]; then
    sips -Z 320 "$f" --out "${f}.tmp.jpg" -s format jpeg -s formatOptions 55 >/dev/null
    mv "${f}.tmp.jpg" "$f"
    sz=$(wc -c <"$f" | tr -d ' ')
  fi
  if [[ "$sz" -gt "$MAX" ]]; then
    echo "FAIL: $f still ${sz} bytes (>200KB)"
    return 1
  fi
  echo "OK $f ($sz bytes)"
}

for i in 01 02 03 04 05 06; do
  f="$ORBIT/orbit-${i}.jpg"
  [[ -f "$f" ]] || continue
  compress_jpeg "$f" 400 68
done

if [[ -f "$ROOT/images/logo.png" ]]; then
  sips -Z 256 "$ROOT/images/logo.png" --out "$ROOT/images/logo.png.tmp" -s format png >/dev/null 2>&1 || true
  if [[ -f "$ROOT/images/logo.png.tmp" ]]; then
    mv "$ROOT/images/logo.png.tmp" "$ROOT/images/logo.png"
    echo "OK images/logo.png ($(wc -c <"$ROOT/images/logo.png" | tr -d ' ') bytes)"
  fi
fi

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
  exit 1
fi
echo "OK: 所有图片/音频 ≤200KB"
