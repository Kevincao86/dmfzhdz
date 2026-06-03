#!/usr/bin/env bash
# 探活 wx_login：假 code → invalid code；dev 模式 → 必须写注册表成功
# ECS: bash ~/app/scripts/ecs-verify-mp-wx-login-path.sh

set -euo pipefail

AUTH_ENV="$HOME/stack/auth-api.env"
ROOT="$(cd "$(dirname "$0")/.." && pwd)"

wait_auth_api() {
  local i
  for i in 1 2 3 4 5 6 7 8 9 10; do
    if curl -sS -m 3 http://127.0.0.1:3001/api/meoo-erp-api-health | grep -q '"ok":true'; then
      return 0
    fi
    sleep 1
  done
  echo "WARN: meoo-auth-api 未在 10s 内就绪"
  return 1
}

post_mp_auth() {
  local label="$1"
  local body="$2"
  echo "=== $label（直连 :3001）==="
  curl -sS -m 20 -X POST -H "Content-Type: application/json" \
    http://127.0.0.1:3001/api/meoo-ops-mp-auth \
    -d "$body"
  echo ""
  echo "=== $label（经 Nginx /erp-api）==="
  curl -sS -m 20 -X POST -H "Host: 139.196.42.5" -H "Content-Type: application/json" \
    http://127.0.0.1/erp-api/meoo-ops-mp-auth \
    -d "$body"
  echo ""
}

# 假 code：须关闭 dev 模式，仅测微信 invalid code
if grep -q '^MP_AUTH_DEV_MODE=true' "$AUTH_ENV" 2>/dev/null; then
  sed -i.bak '/^MP_AUTH_DEV_MODE=true$/d' "$AUTH_ENV"
  echo "已临时关闭 MP_AUTH_DEV_MODE（探活假 code）"
  sudo systemctl restart meoo-auth-api
  wait_auth_api || true
fi

post_mp_auth "1) 假 code" '{"action":"wx_login","code":"ecs_probe_not_real","role":"talent"}'

echo "=== 2) dev 模式全链路（写 mp_accounts + ops_registry_snapshot）==="
if ! grep -q '^MP_AUTH_DEV_MODE=true' "$AUTH_ENV" 2>/dev/null; then
  echo 'MP_AUTH_DEV_MODE=true' >>"$AUTH_ENV"
  echo "已写入 MP_AUTH_DEV_MODE=true → $AUTH_ENV"
fi
sudo systemctl restart meoo-auth-api
wait_auth_api || true

post_mp_auth "2) dev 全链路" \
  '{"action":"wx_login","code":"ecs_dev_full_path_probe","role":"talent","wxNickName":"probe"}'

echo "期望 {\"ok\":true,\"token\":...}；若 502：bash scripts/ecs-fix-erp-api-502.sh"
