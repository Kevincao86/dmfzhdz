#!/usr/bin/env bash
# 将小程序分享封面同步到 Nginx /recruit-covers/share/（downloadFile 合法域名 mofangdianai.com）
# 用法：cd ~/app && bash scripts/ecs-sync-mp-share-cover.sh
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
SRC="$ROOT/灵祺达人撮合小程序/images/share/share-cover-ai-match.jpg"
DST_DIR="$ROOT/灵祺达人履约管理后台/public/recruit-covers/share"
DST="$DST_DIR/share-cover-ai-match.jpg"

if [[ ! -f "$SRC" ]]; then
  echo "FAIL: 缺少 $SRC"
  exit 1
fi
mkdir -p "$DST_DIR"
cp -f "$SRC" "$DST"
chmod 644 "$DST"
echo "OK: $DST"
echo "自测: curl -sSI https://mofangdianai.com/recruit-covers/share/share-cover-ai-match.jpg | head -3"
