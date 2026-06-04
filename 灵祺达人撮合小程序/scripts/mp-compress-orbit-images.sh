#!/usr/bin/env bash
# 登录环墙：清晰优先，单文件仍 <200KB（微信代码质量）
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
MAX=204800
ORBIT="$ROOT/images/login-orbit"

rm -f "$ORBIT"/orbit-*.png 2>/dev/null || true

compress_jpeg() {
  local f="$1"
  sips -Z 720 "$f" --out "${f}.tmp.jpg" -s format jpeg -s formatOptions 82 >/dev/null
  mv "${f}.tmp.jpg" "$f"
  local sz
  sz=$(wc -c <"$f" | tr -d ' ')
  if [[ "$sz" -gt "$MAX" ]]; then
    sips -Z 640 "$f" --out "${f}.tmp.jpg" -s format jpeg -s formatOptions 76 >/dev/null
    mv "${f}.tmp.jpg" "$f"
    sz=$(wc -c <"$f" | tr -d ' ')
  fi
  if [[ "$sz" -gt "$MAX" ]]; then
    sips -Z 560 "$f" --out "${f}.tmp.jpg" -s format jpeg -s formatOptions 70 >/dev/null
    mv "${f}.tmp.jpg" "$f"
    sz=$(wc -c <"$f" | tr -d ' ')
  fi
  if [[ "$sz" -gt "$MAX" ]]; then
    echo "FAIL: $f still ${sz} bytes (>200KB)"
    return 1
  fi
  echo "OK $f ($sz bytes, 720px tier)"
}

for i in 01 02 03 04 05 06; do
  f="$ORBIT/orbit-${i}.jpg"
  [[ -f "$f" ]] || continue
  compress_jpeg "$f"
done

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
    -type f \( -iname '*.jpg' -o -iname '*.jpeg' -o -iname '*.png' -o -iname '*.gif' -o -iname '*.webp' \) \
    -print0
)

if [[ "$FAIL" -ne 0 ]]; then
  exit 1
fi
echo "OK: 所有图片 ≤200KB（环墙 720px 清晰档）"
