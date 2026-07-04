#!/usr/bin/env bash
# 轻量：报名管理 · 商家反选分享表建表 + 关闭 RLS（小程序点「分享商家反选」503 时执行）
# ECS: cd ~/app && git pull && bash scripts/ecs-fix-mp-applicant-pick-share.sh
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
ECS_PORT="${ECS_PG_PORT:-5433}"
ECS_DB="${ECS_PG_DB:-postgres}"
AUTH_PORT="${AUTH_API_PORT:-3001}"

apply_sql() {
  local file="$1"
  # shellcheck disable=SC1090
  source "$HOME/stack/db-credentials.txt"
  export PGPASSWORD="${POSTGRES_PASSWORD:?}"
  echo "=== 应用 $(basename "$file") ==="
  psql -h 127.0.0.1 -p "$ECS_PORT" -U postgres -d "$ECS_DB" -v ON_ERROR_STOP=1 -f "$file"
}

reload_postgrest() {
  if systemctl list-unit-files meoo-postgrest.service &>/dev/null; then
    echo "=== 重启 meoo-postgrest（刷新 schema）==="
    sudo systemctl restart meoo-postgrest
    sleep 2
  fi
  # shellcheck disable=SC1090
  source "$HOME/stack/db-credentials.txt"
  export PGPASSWORD="${POSTGRES_PASSWORD:?}"
  psql -h 127.0.0.1 -p "$ECS_PORT" -U postgres -d "$ECS_DB" \
    -c "NOTIFY pgrst, 'reload schema';" 2>/dev/null || true
}

verify_tables() {
  # shellcheck disable=SC1090
  source "$HOME/stack/db-credentials.txt"
  export PGPASSWORD="${POSTGRES_PASSWORD:?}"
  echo "=== 校验表与 RLS（rls_enabled 应为 f）==="
  psql -h 127.0.0.1 -p "$ECS_PORT" -U postgres -d "$ECS_DB" -c "
SELECT c.relname, c.relrowsecurity AS rls_enabled
FROM pg_class c
JOIN pg_namespace n ON n.oid = c.relnamespace
WHERE n.nspname = 'public' AND c.relname LIKE 'mp_applicant_pick_share%'
ORDER BY 1;
"
}

verify_postgrest() {
  local key="${SUPABASE_SERVICE_ROLE_KEY:-}"
  if [[ -z "$key" && -f "$HOME/stack/auth-api.env" ]]; then
    # shellcheck disable=SC1090
    set -a
    source "$HOME/stack/auth-api.env"
    set +a
    key="${SUPABASE_SERVICE_ROLE_KEY:-}"
  fi
  if [[ -z "$key" ]]; then
    echo "WARN: 无 SUPABASE_SERVICE_ROLE_KEY，跳过 PostgREST 探活"
    return 0
  fi
  echo "=== PostgREST 表可见性 ==="
  curl -sS -m 8 -o /dev/null -w "GET links HTTP %{http_code}\n" \
    -H "apikey: $key" -H "Authorization: Bearer $key" \
    "http://127.0.0.1:8888/rest/v1/mp_applicant_pick_share_links?select=id&limit=1" || true
}

cd "$ROOT"

if [[ ! -f "$HOME/stack/db-credentials.txt" ]]; then
  echo "缺少 ~/stack/db-credentials.txt"
  exit 1
fi

for mig in \
  20260703120000_mp_applicant_pick_share.sql \
  20260703120100_mp_applicant_pick_share_ecs_rls.sql
do
  f="$ROOT/supabase/migrations/$mig"
  if [[ -f "$f" ]]; then
    apply_sql "$f" || echo "WARN: $mig 可能已应用，继续…"
  fi
done

reload_postgrest
verify_tables
verify_postgrest

echo "=== 接口探活 list_feedback ==="
curl -sS -m 15 -X POST "http://127.0.0.1:${AUTH_PORT}/api/meoo-mp-applicant-pick-share" \
  -H 'Content-Type: application/json' \
  -d '{"action":"list_feedback","mpOrderId":"MP-RO-probe"}' | head -c 240
echo
echo "OK: 商家反选分享表修复完成。请在小程序重试「分享商家反选」。"
