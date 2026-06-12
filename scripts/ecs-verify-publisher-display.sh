#!/usr/bin/env bash
# 验证分享海报发单方名称接口
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
MP_ID="${1:-MP-RO-178099398735}"
BASE="${MP_API_BASE:-https://mofangdianai.com/erp-api}"
echo "==> POST ${BASE}/meoo-ops-mp-auth action=publisher_display_for_order mpOrderId=${MP_ID}"
curl -sS -m 25 -X POST "${BASE%/}/meoo-ops-mp-auth" \
  -H 'Content-Type: application/json' \
  -d "{\"action\":\"publisher_display_for_order\",\"mpOrderId\":\"${MP_ID}\"}" | head -c 600
echo ""
