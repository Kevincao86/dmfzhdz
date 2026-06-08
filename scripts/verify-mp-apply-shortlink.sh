#!/usr/bin/env bash
# 探活招募报名短链 API（genwxashortlink）
set -euo pipefail

BASE="${MP_API_BASE:-https://mofangdianai.com/erp-api}"
MP_ID="${1:-MP-RO-1780934358368}"

echo "==> POST ${BASE}/meoo-ops-mp-auth action=mp_apply_shortlink_get mpOrderId=${MP_ID}"

BODY=$(curl -fsS -X POST "${BASE%/}/meoo-ops-mp-auth" \
  -H 'Content-Type: application/json' \
  -d "{\"action\":\"mp_apply_shortlink_get\",\"mpOrderId\":\"${MP_ID}\",\"title\":\"测试招募\"}" \
  2>/dev/null || true)

if [ -z "$BODY" ]; then
  echo "FAIL: 无响应（检查 ECS meoo-auth-api 与 MP_WECHAT_APPID/SECRET）"
  exit 1
fi

echo "$BODY" | head -c 500
echo

if echo "$BODY" | grep -q '"ok":true'; then
  if echo "$BODY" | grep -q '#小程序://\|wxaurl.cn\|weixin://dl/business'; then
    echo "OK: 返回可识别链接"
    exit 0
  fi
  echo "WARN: ok=true 但 link 格式异常"
  exit 1
fi

echo "FAIL: API 未返回 ok:true（需部署含 mp_apply_shortlink_get 的 auth-api）"
exit 1
