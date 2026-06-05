#!/usr/bin/env bash
# 修复微信登录 42501：ops_registry_snapshot RLS 阻止 service_role 写入
#
# ECS: cd ~/app && git pull origin main && bash scripts/ecs-fix-ops-registry-rls.sh
# 本机: ECS_HOST=admin@139.196.42.5 bash scripts/ecs-fix-ops-registry-rls.sh --remote

set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
ECS_HOST="${ECS_HOST:-admin@139.196.42.5}"
MIGRATION_RLS="20260603190000_ops_registry_snapshot_rls_service_role.sql"
MIGRATION_DISABLE="20260603210000_ops_registry_snapshot_disable_rls_ecs.sql"
MIGRATION_TABLE="20260511140000_ops_registry_snapshot.sql"

load_auth_env() {
  for f in "$HOME/stack/auth-api.env" "$HOME/stack/.env"; do
    if [[ -f "$f" ]]; then
      # shellcheck disable=SC1090
      set -a
      source "$f"
      set +a
      return 0
    fi
  done
  return 1
}

reload_postgrest() {
  if systemctl list-unit-files meoo-postgrest.service &>/dev/null; then
    echo "=== 重启 meoo-postgrest（刷新 schema，表须在 :8888 可见）==="
    sudo systemctl restart meoo-postgrest
    sleep 2
  fi
  # shellcheck disable=SC1090
  source "$HOME/stack/db-credentials.txt"
  export PGPASSWORD="${POSTGRES_PASSWORD:?}"
  psql -h 127.0.0.1 -p "${ECS_PG_PORT:-5433}" -U postgres -d "${ECS_PG_DB:-postgres}" \
    -c "NOTIFY pgrst, 'reload schema';" 2>/dev/null || true
}

apply_sql() {
  local file="$1"
  # shellcheck disable=SC1090
  source "$HOME/stack/db-credentials.txt"
  export PGPASSWORD="${POSTGRES_PASSWORD:?}"
  echo "=== 应用 $(basename "$file") ==="
  psql -h 127.0.0.1 -p "${ECS_PG_PORT:-5433}" -U postgres -d "${ECS_PG_DB:-postgres}" \
    -v ON_ERROR_STOP=1 -f "$file"
}

run_local() {
  cd "$ROOT"
  if [[ -f "$ROOT/supabase/migrations/$MIGRATION_TABLE" ]]; then
    apply_sql "$ROOT/supabase/migrations/$MIGRATION_TABLE" || true
  fi
  apply_sql "$ROOT/supabase/migrations/$MIGRATION_RLS"
  if [[ -f "$ROOT/supabase/migrations/$MIGRATION_DISABLE" ]]; then
    apply_sql "$ROOT/supabase/migrations/$MIGRATION_DISABLE"
  fi
  if [[ -f "$ROOT/supabase/migrations/20260511160000_ops_registry_snapshot_grants.sql" ]]; then
    apply_sql "$ROOT/supabase/migrations/20260511160000_ops_registry_snapshot_grants.sql" || true
  fi
  if [[ -f "$ROOT/supabase/ecs_service_role_grants.sql" ]]; then
    apply_sql "$ROOT/supabase/ecs_service_role_grants.sql"
  fi
  reload_postgrest
  verify_postgrest
  sudo systemctl restart meoo-auth-api 2>/dev/null || true
}

verify_postgrest() {
  load_auth_env || true
  local base key
  base="${SUPABASE_URL:-${VITE_SUPABASE_URL:-http://127.0.0.1:8888}}"
  base="${base%/}"
  key="${SUPABASE_SERVICE_ROLE_KEY:-${SERVICE_ROLE_KEY:-}}"
  if [[ -z "$key" ]]; then
    echo "WARN: 未找到 SUPABASE_SERVICE_ROLE_KEY（检查 ~/stack/auth-api.env）"
    echo "      可执行: bash ~/app/scripts/ecs-run-auth-api.sh"
    return 0
  fi
  echo "=== PostgREST @ ${base}/rest/v1/ops_registry_snapshot ==="
  local code
  code=$(curl -sS -m 10 -o /tmp/ops-snap-test.json -w "%{http_code}" \
    -X GET "${base}/rest/v1/ops_registry_snapshot?id=eq.1&select=id" \
    -H "apikey: ${key}" \
    -H "Authorization: Bearer ${key}" || echo 000)
  echo "GET http_code=$code body=$(head -c 120 /tmp/ops-snap-test.json 2>/dev/null || true)"
  if [[ "$code" == "404" ]]; then
    echo "FAIL: 404 多为 PostgREST 未刷新或 URL 端口错（ECS 应为 :8888，不是 :3000）"
    return 1
  fi
  # 仅 PATCH updated_at 验证可写；切勿 POST registry:{} — 会清空全部 vendorKeys/videoAi 绑定
  code=$(curl -sS -m 10 -o /tmp/ops-snap-test.json -w "%{http_code}" \
    -X PATCH "${base}/rest/v1/ops_registry_snapshot?id=eq.1" \
    -H "apikey: ${key}" \
    -H "Authorization: Bearer ${key}" \
    -H "Content-Type: application/json" \
    -H "Prefer: return=minimal" \
    -d '{"updated_at":"'"$(date -u +%Y-%m-%dT%H:%M:%SZ)"'"}' || echo 000)
  echo "PATCH(updated_at) http_code=$code body=$(head -c 200 /tmp/ops-snap-test.json 2>/dev/null || true)"
  if [[ "$code" == "401" ]] || [[ "$code" == "403" ]]; then
    echo "FAIL: 请执行 bash ~/app/scripts/ecs-run-auth-api.sh 重生 service_role JWT"
    return 1
  fi
  if [[ "$code" != "201" && "$code" != "204" && "$code" != "200" ]]; then
    echo "FAIL: 若含 row-level security，RLS 迁移未生效；若 404，请 sudo systemctl restart meoo-postgrest"
    return 1
  fi
  echo "OK: ops_registry_snapshot 可读可写"
  echo "=== 经 meoo-auth-api 探活 scan_create ==="
  curl -sS -m 10 -X POST "http://127.0.0.1:${AUTH_API_PORT:-3001}/api/meoo-ops-mp-auth" \
    -H 'Content-Type: application/json' \
    -d '{"action":"scan_create"}' | head -c 160
  echo
}

if [[ "${1:-}" == "--remote" ]]; then
  echo "远程执行 → $ECS_HOST"
  scp "$ROOT/supabase/migrations/$MIGRATION_RLS" "${ECS_HOST}:/tmp/$MIGRATION_RLS"
  ssh "$ECS_HOST" "cd ~/app && git pull origin main && bash scripts/ecs-fix-ops-registry-rls.sh"
  exit 0
fi

run_local
