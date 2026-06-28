#!/usr/bin/env bash
# 上传 cs / fws / dr Web 静态资源至 OSS（原图/原视频无损）
# 轻量：cd ~/app && bash scripts/ecs-upload-web-static-oss.sh
# 本机 SSH：ECS_HOST=admin@139.196.42.5 bash scripts/ecs-upload-web-static-oss.sh --remote
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"

run_upload() {
  if [[ ! -f "$ROOT/web版/merchant-erp/node_modules/ali-oss/package.json" ]]; then
    echo "==> 安装 ali-oss 依赖…"
    (cd "$ROOT/web版/merchant-erp" && npm ci --omit=dev 2>/dev/null || npm ci)
  fi
  node "$ROOT/scripts/upload-web-static-oss.js"
}

if [[ "${1:-}" == "--remote" ]]; then
  ECS_HOST="${ECS_HOST:-admin@139.196.42.5}"
  echo "远程执行 → $ECS_HOST"
  ssh "$ECS_HOST" 'bash -s' <<EOF
set -euo pipefail
cd ~/app && bash scripts/ecs-git-pull-gitee.sh && bash scripts/ecs-upload-web-static-oss.sh
EOF
else
  run_upload
fi
