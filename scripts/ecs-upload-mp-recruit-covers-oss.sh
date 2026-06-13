#!/usr/bin/env bash
# 在 ECS 上执行：cd ~/app && bash scripts/ecs-upload-mp-recruit-covers-oss.sh
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"

for f in "$HOME/stack/auth-api.env" "$HOME/stack/.env" "$ROOT/web版/merchant-erp/.env.production" "$ROOT/web版/merchant-erp/.env.merchant"; do
  if [[ -f "$f" ]]; then
    set -a
    # shellcheck disable=SC1090
    source "$f"
    set +a
    echo "已加载: $f"
  fi
done

if [[ -d "$ROOT/.recruit-covers-staging/platforms" ]]; then
  bash "$ROOT/scripts/sync-mp-recruit-covers.sh" "$ROOT/.recruit-covers-staging" || true
elif [[ -d "$ROOT/灵祺达人履约管理后台/public/recruit-covers/platforms" ]]; then
  bash "$ROOT/scripts/sync-mp-recruit-covers.sh" "$ROOT/灵祺达人履约管理后台/public/recruit-covers" || true
else
  echo "跳过 sync（使用 Git 内 packages/recruit-covers-mp 现成 JPEG）"
fi

echo "==> 读取 OSS 环境（auth-api.env / .env.production）"
HAS_KEY=0
for k in MERCHANT_PRODUCT_IMAGE_OSS_ACCESS_KEY_ID OSS_ACCESS_KEY_ID ALIYUN_ICE_ACCESS_KEY_ID ALIBABA_CLOUD_ACCESS_KEY_ID; do
  if [[ -n "${!k:-}" ]]; then HAS_KEY=1; echo "  OK: $k"; fi
done
if [[ -z "${OSS_BUCKET:-}${MERCHANT_PRODUCT_IMAGE_OSS_BUCKET:-}" ]]; then
  echo "  WARN: 未设置 OSS_BUCKET / MERCHANT_PRODUCT_IMAGE_OSS_BUCKET"
fi
if [[ "$HAS_KEY" -eq 0 ]]; then
  echo "FAIL: 未找到 OSS AccessKey"
  echo "  请在 ~/stack/auth-api.env 追加（与云剪/商品图同 AK 即可）："
  echo "    OSS_ACCESS_KEY_ID=..."
  echo "    OSS_ACCESS_KEY_SECRET=..."
  echo "    OSS_BUCKET=modianningbo"
  echo "    OSS_ENDPOINT=oss-cn-shanghai.aliyuncs.com"
  exit 1
fi

node "$ROOT/scripts/upload-mp-recruit-covers-oss.js"
echo "OK: 封面 + 首页 Banner 已上传 OSS，请重新上传小程序体验版（build mp-20260613-oss-slim-cover-fill）"
