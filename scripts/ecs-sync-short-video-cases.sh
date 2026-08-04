#!/usr/bin/env bash
# 同步短视频案例墙到轻量 CDN：https://mofangdianai.com/erp-mp-static/short-video-cases/
# 本机执行：bash scripts/ecs-sync-short-video-cases.sh
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
SRC="$ROOT/web版/merchant-erp/public/short-video-cases/"
HOST="${ECS_LIGHT_HOST:-admin@139.196.42.5}"
DEST="/var/www/meoo-static/erp-mp-static/short-video-cases/"

if [[ ! -d "$SRC" ]]; then
  echo "缺少目录: $SRC" >&2
  exit 1
fi

ssh "$HOST" "mkdir -p '$DEST'"
rsync -avz --delete --exclude '_bak*' --exclude '_task_*' --exclude '*.tmp.mp4' "$SRC" "$HOST:$DEST"
echo "OK → https://mofangdianai.com/erp-mp-static/short-video-cases/"
curl -sS -o /dev/null -w "probe case-visit-night.mp4 HTTP %{http_code} size=%{size_download}\n" \
  "https://mofangdianai.com/erp-mp-static/short-video-cases/case-visit-night.mp4" || true
