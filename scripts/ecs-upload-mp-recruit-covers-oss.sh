#!/usr/bin/env bash
# 在 ECS 上执行：cd ~/app && bash scripts/ecs-upload-mp-recruit-covers-oss.sh
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"

for f in "$HOME/stack/auth-api.env" "$ROOT/web版/merchant-erp/.env.production" "$ROOT/web版/merchant-erp/.env.merchant"; do
  if [[ -f "$f" ]]; then
    set -a
    # shellcheck disable=SC1090
    source "$f"
    set +a
  fi
done

bash "$ROOT/scripts/sync-mp-recruit-covers.sh" "$ROOT/.recruit-covers-staging" 2>/dev/null \
  || bash "$ROOT/scripts/sync-mp-recruit-covers.sh" "$ROOT/灵祺达人履约管理后台/public/recruit-covers" 2>/dev/null \
  || true

echo "==> 读取 OSS 环境（auth-api.env / .env.production）"
if [[ -z "${MERCHANT_PRODUCT_IMAGE_OSS_ACCESS_KEY_ID:-}${ALIYUN_ICE_ACCESS_KEY_ID:-}" ]]; then
  echo "FAIL: 未找到 OSS AccessKey，请检查 ~/stack/auth-api.env 或 web版/merchant-erp/.env.production"
  exit 1
fi

node "$ROOT/scripts/upload-mp-recruit-covers-oss.js"
echo "OK: 封面 + 首页 Banner 已上传 OSS，请重新上传小程序体验版（build mp-20260613-oss-slim-cover-fill）"
