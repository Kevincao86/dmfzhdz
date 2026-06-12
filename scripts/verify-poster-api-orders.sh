#!/usr/bin/env bash
# 批量验证招募单分享海报发单方名称 API（GET 优先）
set -euo pipefail
BASE="${MP_API_BASE:-https://mofangdianai.com/erp-api}"
IDS=("$@")
if [ ${#IDS[@]} -eq 0 ]; then
  IDS=(MP-RO-178099398735)
fi
failed=0
for id in "${IDS[@]}"; do
  echo "==> GET ${BASE}/meoo-ops-mp-publisher-display?mpOrderId=${id}"
  body="$(curl -sS -m 25 "${BASE%/}/meoo-ops-mp-publisher-display?mpOrderId=${id}" || true)"
  echo "$body" | head -c 400
  echo ""
  if echo "$body" | grep -q '"displayName":"[^"][^"]' ; then
    echo "OK ${id}"
  else
    echo "FAIL ${id} (no displayName)"
    failed=$((failed + 1))
  fi
done
exit "$failed"
