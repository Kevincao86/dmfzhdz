#!/usr/bin/env bash
# 在线客服 relay 冒烟：模拟小程序发消息 → 运营回复 → 小程序拉取（只读 + 写入测试会话）
#
# 用法:
#   MEOO_API_BASE=https://mofangdianai.com/erp-api \
#   MEOO_SUPPORT_OPS_HTTP_TOKEN='...' \
#   bash scripts/mp-support-relay-e2e-smoke.sh

set -euo pipefail

API_BASE="${MEOO_API_BASE:-https://mofangdianai.com/erp-api}"
API_BASE="${API_BASE%/}"
TOKEN="${MEOO_SUPPORT_OPS_HTTP_TOKEN:-}"

SID="lq-mp-smoke_${RANDOM}_$(date +%s)"
GFP="lq-mp:gf_smoke_${RANDOM}_$(date +%s)"
USER_MSG_ID="u_${RANDOM}"
OID="ops_${RANDOM}"

echo "== relay e2e =="
echo "API_BASE=$API_BASE"
echo "session=$SID"

post_relay() {
  curl -sS -X POST "$API_BASE/meoo-ops-mp-support-relay" \
    -H 'Content-Type: application/json' \
    -d "$1"
}

echo "1) 小程序发 user 消息"
R1="$(post_relay "{\"action\":\"send_message\",\"sessionId\":\"$SID\",\"guestFingerprint\":\"$GFP\",\"fromRole\":\"user\",\"text\":\"smoke user ping\",\"clientMsgId\":\"$USER_MSG_ID\",\"ts\":$(date +%s000)}")"
echo "$R1" | head -c 240
echo ""
echo "$R1" | grep -q '"ok":true' || { echo "FAIL: send user"; exit 1; }

if [[ -n "$TOKEN" ]]; then
  echo "2) 运营台 ops 回复"
  R2="$(curl -sS -X POST "$API_BASE/support-ops-send" \
    -H "Authorization: Bearer $TOKEN" \
    -H 'Content-Type: application/json' \
    -d "{\"sessionId\":\"$SID\",\"text\":\"smoke ops reply\",\"id\":\"$OID\"}")"
  echo "$R2" | head -c 240
  echo ""
  echo "$R2" | grep -q '"ok":true' || { echo "FAIL: ops send"; exit 1; }
  echo "$R2" | grep -q '"verified":true' || echo "WARN: ops verified=false（可能 RLS/库不一致）"
else
  echo "2) 跳过 ops 回复（未设 MEOO_SUPPORT_OPS_HTTP_TOKEN）"
fi

echo "3) 小程序 fetch_messages"
R3="$(post_relay "{\"action\":\"fetch_messages\",\"sessionId\":\"$SID\",\"guestFingerprint\":\"$GFP\"}")"
echo "$R3" | head -c 400
echo ""
echo "$R3" | grep -q '"ok":true' || { echo "FAIL: fetch"; exit 1; }
echo "$R3" | grep -q 'smoke user ping' || { echo "FAIL: user 消息未拉回"; exit 1; }
if [[ -n "$TOKEN" ]]; then
  echo "$R3" | grep -q 'smoke ops reply' || { echo "FAIL: ops 回复未拉回（根因：写入库与拉取库不一致或 RLS）"; exit 1; }
fi

echo "OK: mp-support-relay e2e passed"
