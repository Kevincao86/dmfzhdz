#!/usr/bin/env bash
# 探活 wx_login：假 code → invalid code；dev 模式 → 必须写注册表成功
# ECS: bash ~/app/scripts/ecs-verify-mp-wx-login-path.sh

set -euo pipefail

AUTH_ENV="$HOME/stack/auth-api.env"

echo "=== 1) 假 code（仅测微信接口，不写注册表）==="
curl -sS -m 15 -X POST -H "Host: 139.196.42.5" -H "Content-Type: application/json" \
  http://127.0.0.1/erp-api/meoo-ops-mp-auth \
  -d '{"action":"wx_login","code":"ecs_probe_not_real","role":"talent"}'
echo ""

echo "=== 2) dev 模式全链路（写 mp_accounts + ops_registry_snapshot）==="
if ! grep -q '^MP_AUTH_DEV_MODE=true' "$AUTH_ENV" 2>/dev/null; then
  echo 'MP_AUTH_DEV_MODE=true' >>"$AUTH_ENV"
  echo "已写入 MP_AUTH_DEV_MODE=true → $AUTH_ENV"
fi
sudo systemctl restart meoo-auth-api
sleep 2
curl -sS -m 20 -X POST -H "Host: 139.196.42.5" -H "Content-Type: application/json" \
  http://127.0.0.1/erp-api/meoo-ops-mp-auth \
  -d '{"action":"wx_login","code":"ecs_dev_full_path_probe","role":"talent","wxNickName":"probe"}'
echo ""
echo "期望 {\"ok\":true,\"token\":...}；若 row-level security 须 bash scripts/ecs-fix-ops-registry-rls.sh"
