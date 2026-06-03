#!/usr/bin/env bash
# 修复微信登录 42501：ops_registry_snapshot RLS 阻止 service_role 写入
#
# ECS: cd ~/app && git pull origin main && bash scripts/ecs-fix-ops-registry-rls.sh
# 本机: ECS_HOST=admin@139.196.42.5 bash scripts/ecs-fix-ops-registry-rls.sh --remote

set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
ECS_HOST="${ECS_HOST:-admin@139.196.42.5}"
MIGRATION="20260603190000_ops_registry_snapshot_rls_service_role.sql"

run_local() {
  cd "$ROOT"
  bash "$ROOT/scripts/ecs-apply-supabase-migration.sh" "supabase/migrations/$MIGRATION"
  if [[ -f "$ROOT/supabase/ecs_service_role_grants.sql" ]]; then
    # shellcheck disable=SC1090
    source "$HOME/stack/db-credentials.txt"
    export PGPASSWORD="${POSTGRES_PASSWORD:?}"
    echo "=== 重放 ecs_service_role_grants.sql ==="
    psql -h 127.0.0.1 -p "${ECS_PG_PORT:-5433}" -U postgres -d "${ECS_PG_DB:-postgres}" \
      -v ON_ERROR_STOP=1 -f "$ROOT/supabase/ecs_service_role_grants.sql"
  fi
  verify_postgrest
}

verify_postgrest() {
  local base key
  base="${SUPABASE_URL:-${VITE_SUPABASE_URL:-http://127.0.0.1:3000}}"
  key="${SUPABASE_SERVICE_ROLE_KEY:-${SERVICE_ROLE_KEY:-}}"
  if [[ -z "$key" ]] && [[ -f "$HOME/stack/.env" ]]; then
    # shellcheck disable=SC1090
    source "$HOME/stack/.env"
    key="${SUPABASE_SERVICE_ROLE_KEY:-${SERVICE_ROLE_KEY:-}}"
  fi
  if [[ -z "$key" ]]; then
    echo "WARN: 未找到 SUPABASE_SERVICE_ROLE_KEY，跳过 PostgREST 探活"
    return 0
  fi
  echo "=== PostgREST upsert ops_registry_snapshot（应 201/204，非 42501）==="
  local code
  code=$(curl -sS -m 10 -o /tmp/ops-snap-test.json -w "%{http_code}" \
    -X POST "${base%/}/rest/v1/ops_registry_snapshot" \
    -H "apikey: ${key}" \
    -H "Authorization: Bearer ${key}" \
    -H "Content-Type: application/json" \
    -H "Prefer: resolution=merge-duplicates,return=minimal" \
    -d '{"id":1,"registry":{},"updated_at":"'"$(date -u +%Y-%m-%dT%H:%M:%SZ)"'"}' || echo 000)
  echo "http_code=$code body=$(head -c 200 /tmp/ops-snap-test.json 2>/dev/null || true)"
  if [[ "$code" == "401" ]] || [[ "$code" == "403" ]]; then
    echo "FAIL: 请确认 ~/stack/.env 中 SUPABASE_SERVICE_ROLE_KEY 为 service_role JWT（非 anon）"
    return 1
  fi
  if [[ "$code" != "201" && "$code" != "204" && "$code" != "200" ]]; then
    echo "FAIL: 若仍含 row-level security，请检查迁移是否已应用"
    return 1
  fi
  echo "OK: ops_registry_snapshot 可写"
}

if [[ "${1:-}" == "--remote" ]]; then
  echo "远程执行 → $ECS_HOST"
  scp "$ROOT/supabase/migrations/$MIGRATION" "${ECS_HOST}:/tmp/$MIGRATION"
  ssh "$ECS_HOST" bash -s <<EOF
set -euo pipefail
CREDS="\$HOME/stack/db-credentials.txt"
source "\$CREDS"
export PGPASSWORD="\$POSTGRES_PASSWORD"
echo "=== 应用 $MIGRATION ==="
sudo -u postgres psql -h 127.0.0.1 -p 5433 -d postgres -v ON_ERROR_STOP=1 -f "/tmp/$MIGRATION"
rm -f "/tmp/$MIGRATION"
if [[ -f "\$HOME/app/supabase/ecs_service_role_grants.sql" ]]; then
  sudo -u postgres psql -h 127.0.0.1 -p 5433 -d postgres -v ON_ERROR_STOP=1 -f "\$HOME/app/supabase/ecs_service_role_grants.sql"
fi
if [[ -f "\$HOME/stack/.env" ]]; then set -a; source "\$HOME/stack/.env"; set +a; fi
SUPABASE_URL="\${SUPABASE_URL:-http://127.0.0.1:3000}"
export SUPABASE_URL
$(declare -f verify_postgrest)
verify_postgrest
sudo systemctl restart meoo-postgrest 2>/dev/null || true
sudo systemctl restart meoo-auth-api
EOF
  echo "远程完成。请在 ECS 再测: curl -X POST .../meoo-ops-mp-auth -d '{\"action\":\"scan_create\"}'"
  exit 0
fi

run_local
