#!/usr/bin/env bash
# 上传 dr 营销大图/视频至 OSS（原图无损）
# 轻量：cd ~/app && bash scripts/ecs-upload-dr-landing-assets-oss.sh
# 本机 SSH：ECS_HOST=admin@139.196.42.5 bash scripts/ecs-upload-dr-landing-assets-oss.sh --remote
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"

run_upload() {
  for f in "$HOME/stack/auth-api.env" "$HOME/stack/.env" "$ROOT/web版/merchant-erp/.env.production" "$ROOT/web版/merchant-erp/.env.merchant"; do
    if [[ -f "$f" ]]; then
      set -a
      # shellcheck disable=SC1090
      source "$f"
      set +a
      echo "已加载: $f"
    fi
  done

  HAS_KEY=0
  for k in MERCHANT_PRODUCT_IMAGE_OSS_ACCESS_KEY_ID OSS_ACCESS_KEY_ID ALIYUN_ICE_ACCESS_KEY_ID ALIBABA_CLOUD_ACCESS_KEY_ID; do
    if [[ -n "${!k:-}" ]]; then HAS_KEY=1; echo "  OK: $k"; fi
  done
  if [[ "$HAS_KEY" -eq 0 ]]; then
    echo "FAIL: 未找到 OSS AccessKey，请检查 ~/stack/auth-api.env"
    exit 1
  fi

  node "$ROOT/scripts/upload-dr-landing-assets-oss.js"
}

if [[ "${1:-}" == "--remote" ]]; then
  ECS_HOST="${ECS_HOST:-admin@139.196.42.5}"
  echo "远程执行 → $ECS_HOST"
  ssh "$ECS_HOST" 'bash -s' <<EOF
set -euo pipefail
cd ~/app && bash scripts/ecs-git-pull-gitee.sh && bash scripts/ecs-upload-dr-landing-assets-oss.sh
EOF
else
  run_upload
fi
