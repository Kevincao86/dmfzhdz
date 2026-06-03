#!/usr/bin/env bash
# 一次性放开 ECS 小程序相关库表权限（关 RLS + GRANT + 重载 PostgREST）
# ECS: cd ~/app && git pull origin main && bash scripts/ecs-fix-mp-open-all-permissions.sh

set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
MIG="20260603220000_ecs_mp_open_permissions.sql"

# shellcheck disable=SC1090
source "$HOME/stack/db-credentials.txt"
export PGPASSWORD="${POSTGRES_PASSWORD:?}"

echo "=== 应用 $MIG ==="
psql -h 127.0.0.1 -p "${ECS_PG_PORT:-5433}" -U postgres -d "${ECS_PG_DB:-postgres}" \
  -v ON_ERROR_STOP=1 -f "$ROOT/supabase/migrations/$MIG"

if [[ -f "$ROOT/supabase/ecs_service_role_grants.sql" ]]; then
  psql -h 127.0.0.1 -p "${ECS_PG_PORT:-5433}" -U postgres -d "${ECS_PG_DB:-postgres}" \
    -v ON_ERROR_STOP=1 -f "$ROOT/supabase/ecs_service_role_grants.sql"
fi

psql -h 127.0.0.1 -p "${ECS_PG_PORT:-5433}" -U postgres -d "${ECS_PG_DB:-postgres}" \
  -c "NOTIFY pgrst, 'reload schema';" 2>/dev/null || true

sudo systemctl restart meoo-postgrest 2>/dev/null || true
sudo systemctl restart meoo-auth-api

for i in 1 2 3 4 5 6 7 8 9 10; do
  if curl -sS -m 3 http://127.0.0.1:3001/api/meoo-erp-api-health | grep -q '"ok":true'; then
    break
  fi
  sleep 1
done
echo "=== 探活 ==="
curl -sS -m 10 http://127.0.0.1:3001/api/meoo-erp-api-health | head -c 120
echo ""
bash "$ROOT/scripts/ecs-verify-mp-wx-login-path.sh" || true
echo "OK: 小程序相关表 RLS 已关闭，服务已重启。请手机再试微信登录。"
