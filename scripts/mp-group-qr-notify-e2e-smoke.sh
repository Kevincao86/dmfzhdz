#!/usr/bin/env bash
# 群码通知链路只读/最小写验收（轻量 auth-api 部署后执行）
# 用法: MP_ORDER_ID=MP-RO-xxx bash scripts/mp-group-qr-notify-e2e-smoke.sh
set -euo pipefail

API_BASE="${MEOO_API_BASE:-https://mofangdianai.com/erp-api}"
MP_ORDER_ID="${MP_ORDER_ID:-MP-RO-178179789817}"
TEST_QR="${TEST_QR:-https://meoo-public.oss-cn-shanghai.aliyuncs.com/mp-group-qr/smoke-test.jpg}"

echo "== health =="
curl -sS "$API_BASE/meoo-erp-api-health"
echo ""

echo "== patch group qr (side map via PG) =="
PATCH_RES="$(curl -sS -X POST "$API_BASE/meoo-ops-mp-recruitment-orders-patch" \
  -H "Content-Type: application/json" \
  -d "{\"id\":\"$MP_ORDER_ID\",\"groupQrImage\":\"$TEST_QR\"}")"
echo "$PATCH_RES"
echo "$PATCH_RES" | grep -q '"ok":true' || { echo "FAIL: patch"; exit 1; }

echo "== notify WITHOUT client imageUrl (must succeed after normalize fix) =="
NOTIFY_RES="$(curl -sS -X POST "$API_BASE/meoo-ops-mp-talent-inbox-append" \
  -H "Content-Type: application/json" \
  -d "{\"entries\":[{\"talentMemberId\":\"contact:15757468650\",\"title\":\"smoke入选\",\"body\":\"smoke\",\"noticeType\":\"selection\",\"mpOrderId\":\"$MP_ORDER_ID\",\"applicantId\":\"smoke-applicant-$(date +%s)\"}]}")"
echo "$NOTIFY_RES"
echo "$NOTIFY_RES" | grep -q '"ok":true' || { echo "FAIL: notify without imageUrl"; exit 1; }

echo "== notify WITH client imageUrl =="
NOTIFY2="$(curl -sS -X POST "$API_BASE/meoo-ops-mp-talent-inbox-append" \
  -H "Content-Type: application/json" \
  -d "{\"entries\":[{\"talentMemberId\":\"contact:15757468650\",\"title\":\"smoke入选2\",\"body\":\"smoke\",\"noticeType\":\"selection\",\"mpOrderId\":\"$MP_ORDER_ID\",\"applicantId\":\"smoke-applicant2-$(date +%s)\",\"imageUrl\":\"$TEST_QR\"}]}")"
echo "$NOTIFY2"
echo "$NOTIFY2" | grep -q '"ok":true' || { echo "FAIL: notify with imageUrl"; exit 1; }

echo "OK: group qr notify e2e smoke passed"
