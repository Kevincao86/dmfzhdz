#!/usr/bin/env bash
# 探活运营管控台云端登录（meoo-ops-staff-login）
# ECS: cd ~/app && bash scripts/ecs-verify-ops-staff-login.sh

set -euo pipefail

PORT="${AUTH_API_PORT:-3001}"
PHONE="${OPS_MASTER_PHONE:-18768501283}"
PASS="${OPS_MASTER_PASS:-kaiyedaji888}"

echo "=== :${PORT} POST meoo-ops-staff-login ==="
BODY="$(curl -sS -m 20 -w "\n__HTTP__%{http_code}" -X POST \
  -H "Content-Type: application/json" \
  "http://127.0.0.1:${PORT}/api/meoo-ops-staff-login" \
  -d "{\"phone\":\"${PHONE}\",\"password\":\"${PASS}\"}")"
HTTP="$(echo "$BODY" | sed -n '$s/.*__HTTP__//p')"
JSON="$(echo "$BODY" | sed '/__HTTP__/d')"
echo "$JSON" | head -c 400
echo ""
echo "http=$HTTP"

if [[ "$HTTP" != "200" ]] || ! echo "$JSON" | grep -q 'sessionToken'; then
  echo "FAIL: 云端登录未成功。若含 ops_staff_table_missing / permission denied，请执行："
  echo "  bash scripts/ecs-apply-ops-staff-accounts.sh"
  echo "  sudo journalctl -u meoo-auth-api -n 40 --no-pager"
  exit 1
fi

echo "OK: 主账号云端登录可用。"
