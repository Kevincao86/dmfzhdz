#!/usr/bin/env bash
# 在 ECS 上执行：cd ~/app && bash scripts/ecs-upload-mp-recruit-covers-oss.sh
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"

# 勿 source ~/stack/auth-api.env（Secret 含 +/= 等特殊字符时 bash 会报 line N: xxx: No such file）
if [[ -d "$ROOT/.recruit-covers-staging/platforms" ]]; then
  bash "$ROOT/scripts/sync-mp-recruit-covers.sh" "$ROOT/.recruit-covers-staging" || true
elif [[ -d "$ROOT/灵祺达人履约管理后台/public/recruit-covers/platforms" ]]; then
  bash "$ROOT/scripts/sync-mp-recruit-covers.sh" "$ROOT/灵祺达人履约管理后台/public/recruit-covers" || true
else
  echo "跳过 sync（使用 Git 内 packages/recruit-covers-mp 现成 JPEG）"
fi

echo "==> 检查 OSS 凭证（auth-api.env，不 source 整文件）"
if ! bash "$ROOT/scripts/ecs-diagnose-oss-env.sh"; then
  echo ""
  echo "  或先执行: bash scripts/ecs-fix-oss-env-from-existing.sh"
  exit 1
fi

node "$ROOT/scripts/upload-mp-recruit-covers-oss.js"
echo "OK: 封面 + 商家审核海报 + Banner 已上传 OSS，请重新上传小程序体验版"
