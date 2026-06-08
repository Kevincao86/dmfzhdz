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

bash "$ROOT/scripts/sync-mp-recruit-covers.sh" "$ROOT/灵祺达人履约管理后台/public/recruit-covers" 2>/dev/null || true
node "$ROOT/scripts/upload-mp-recruit-covers-oss.js"
echo "OK: 封面已上传 OSS，请重新上传小程序体验版（build mp-20260609-cover-oss）"
