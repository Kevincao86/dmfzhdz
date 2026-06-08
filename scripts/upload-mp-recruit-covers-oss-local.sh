#!/usr/bin/env bash
# 在本机 Mac 项目根目录执行 OSS 上传（自动 cd，避免 MODULE_NOT_FOUND）
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"

for f in "$ROOT/web版/merchant-erp/.env.local" "$ROOT/web版/merchant-erp/.env.merchant" "$ROOT/web版/merchant-erp/.env.production"; do
  if [[ -f "$f" ]]; then
    set -a
    # shellcheck disable=SC1090
    source "$f"
    set +a
  fi
done

echo "项目目录: $ROOT"
node "$ROOT/scripts/upload-mp-recruit-covers-oss.js"
