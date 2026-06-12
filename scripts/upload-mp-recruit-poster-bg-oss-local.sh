#!/usr/bin/env bash
# 本机上传招募分享海报背景 + QR 框至 OSS
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
node "$ROOT/scripts/upload-mp-recruit-poster-bg-oss.js"
