#!/usr/bin/env bash
# 在 ECS 上执行：cd ~/app && bash scripts/ecs-upload-mp-recruit-poster-bg-oss.sh
# 本机 SSH（需免密）：ECS_HOST=admin@139.196.42.5 bash scripts/ecs-upload-mp-recruit-poster-bg-oss.sh --remote
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

  echo "==> 读取 OSS 环境（auth-api.env / .env.production）"
  HAS_KEY=0
  for k in MERCHANT_PRODUCT_IMAGE_OSS_ACCESS_KEY_ID OSS_ACCESS_KEY_ID ALIYUN_ICE_ACCESS_KEY_ID ALIBABA_CLOUD_ACCESS_KEY_ID; do
    if [[ -n "${!k:-}" ]]; then HAS_KEY=1; echo "  OK: $k"; fi
  done
  if [[ -z "${OSS_BUCKET:-}${MERCHANT_PRODUCT_IMAGE_OSS_BUCKET:-}" ]]; then
    echo "  WARN: 未设置 OSS_BUCKET / MERCHANT_PRODUCT_IMAGE_OSS_BUCKET（将尝试 modianningbo）"
  fi
  if [[ "$HAS_KEY" -eq 0 ]]; then
    echo "FAIL: 未找到 OSS AccessKey，请检查 ~/stack/auth-api.env"
    echo "  诊断: bash scripts/ecs-diagnose-oss-env.sh"
    echo "  自动修复: bash scripts/ecs-fix-oss-env-from-existing.sh"
    echo "  或手动写入 OSS_ACCESS_KEY_ID / OSS_ACCESS_KEY_SECRET / OSS_BUCKET=modianningbo"
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
