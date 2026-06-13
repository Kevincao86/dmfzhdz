#!/usr/bin/env bash
# 将 canonical logo.png 同步到星选 / 商家 ERP / 运营后台 public（含 favicon）
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
CANON="${ROOT}/灵祺达人履约管理后台/public/logo.png"
if [[ ! -f "$CANON" ]]; then
  echo "missing canonical logo: $CANON" >&2
  exit 1
fi
for dir in \
  "${ROOT}/灵祺达人履约管理后台/public" \
  "${ROOT}/web版/merchant-erp/public" \
  "${ROOT}/商家管理后台/public"; do
  mkdir -p "$dir"
  cp -f "$CANON" "$dir/logo.png"
  cp -f "$CANON" "$dir/favicon.png"
  echo "synced -> $dir"
done
echo "done: $(md5 -q "$CANON" 2>/dev/null || md5sum "$CANON" | awk '{print $1}')"
