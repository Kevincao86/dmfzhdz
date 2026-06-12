#!/usr/bin/env bash
# 验证 ECS 微信太阳码接口（分享海报右下角）
set -euo pipefail
MP_ID="${1:-MP-RO-178099398735}"
BASE="${MP_API_BASE:-https://mofangdianai.com/erp-api}"
echo "==> POST ${BASE}/meoo-ops-mp-auth action=mp_apply_wxacode_get mpOrderId=${MP_ID}"
BODY=$(curl -sS -m 30 -X POST "${BASE%/}/meoo-ops-mp-auth" \
  -H 'Content-Type: application/json' \
  -d "{\"action\":\"mp_apply_wxacode_get\",\"mpOrderId\":\"${MP_ID}\"}")
echo "$BODY" | head -c 400
echo ""
if echo "$BODY" | grep -q '"dataUrl":"data:image/png;base64,'; then
  echo "OK wxacode dataUrl present"
else
  echo "WARN wxacode missing — 小程序将走本地二维码兜底；检查 ~/stack/auth-api.env MP_WECHAT_APPID/SECRET"
  echo "$BODY" | grep -o '"error":"[^"]*"' || true
fi
