#!/usr/bin/env bash
# 在 ECS 上执行：cd ~/app && bash scripts/ecs-upload-mp-recruit-poster-bg-oss.sh
# 本机 SSH（需免密）：ECS_HOST=admin@139.196.42.5 bash scripts/ecs-upload-mp-recruit-poster-bg-oss.sh --remote
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"

run_upload() {
  for f in "$HOME/stack/auth-api.env" "$ROOT/web版/merchant-erp/.env.production" "$ROOT/web版/merchant-erp/.env.merchant"; do
    if [[ -f "$f" ]]; then
      set -a
      # shellcheck disable=SC1090
      source "$f"
      set +a
    fi
  done

  echo "==> 读取 OSS 环境（auth-api.env / .env.production）"
  if [[ -z "${MERCHANT_PRODUCT_IMAGE_OSS_ACCESS_KEY_ID:-}${ALIYUN_ICE_ACCESS_KEY_ID:-}" ]]; then
    echo "FAIL: 未找到 OSS AccessKey，请检查 ~/stack/auth-api.env"
    exit 1
  fi

  node "$ROOT/scripts/upload-mp-recruit-poster-bg-oss.js"
  echo "OK: 海报背景已上传 OSS → mp-recruit-covers/posters/"
}

if [[ "${1:-}" == "--remote" ]]; then
  ECS_HOST="${ECS_HOST:-admin@139.196.42.5}"
  echo "远程执行 → $ECS_HOST"
  ssh "$ECS_HOST" 'bash -s' <<EOF
set -euo pipefail
cd ~/app && bash scripts/ecs-git-pull-gitee.sh && bash scripts/ecs-upload-mp-recruit-poster-bg-oss.sh
EOF
else
  run_upload
fi
