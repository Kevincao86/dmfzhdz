#!/usr/bin/env bash
# 环墙：保留 520px 原图；从原图单次生成 -hd 960px（预览清晰，仍 <200KB）
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
MAX=204800
ORBIT="$ROOT/images/login-orbit"

rm -f "$ORBIT"/orbit-*.png 2>/dev/null || true

gen_hd() {
  local f="$1"
  local base="${f%.jpg}"
  local hd="${base}-hd.jpg"
  sips -Z 960 "$f" --out "${hd}.tmp.jpg" -s format jpeg -s formatOptions 88 >/dev/null
  mv "${hd}.tmp.jpg" "$hd"
  local sz
  sz=$(wc -c <"$hd" | tr -d ' ')
  if [[ "$sz" -gt "$MAX" ]]; then
    sips -Z 840 "$hd" --out "${hd}.tmp.jpg" -s format jpeg -s formatOptions 82 >/dev/null
    mv "${hd}.tmp.jpg" "$hd"
    sz=$(wc -c <"$hd" | tr -d ' ')
  fi
  if [[ "$sz" -gt "$MAX" ]]; then
    echo "FAIL: $hd still ${sz} bytes"
    return 1
  fi
  echo "OK $hd ($sz bytes)"
}

for i in 01 02 03 04 05 06; do
  f="$ORBIT/orbit-${i}.jpg"
  [[ -f "$f" ]] || continue
  sz=$(wc -c <"$f" | tr -d ' ')
  if [[ "$sz" -gt "$MAX" ]]; then
    echo "WARN: $f ${sz}b >200KB, skip touch"
    exit 1
  fi
  echo "OK $f ($sz bytes, ring)"
  gen_hd "$f"
done

FAIL=0
while IFS= read -r -d '' f; do
  sz=$(wc -c <"$f" | tr -d ' ')
  if [[ "$sz" -gt "$MAX" ]]; then
    echo "OVER 200KB: $f ($sz bytes)"
    FAIL=1
  fi
done < <(
  find "$ORBIT" -maxdepth 1 -type f \( -iname 'orbit-*.jpg' \) -print0
)

if [[ "$FAIL" -ne 0 ]]; then
  exit 1
fi
echo "OK: 环墙 + -hd 预览图均 ≤200KB"
