#!/usr/bin/env bash
# 达人/PR 统一账号表（mp_accounts 等）→ ECS 本机 Postgres，不依赖 Supabase 云
# ECS 上: cd ~/app && git pull && bash scripts/ecs-fix-mp-account-auth.sh
# 本机推送: ECS_HOST=admin@139.196.42.5 bash scripts/ecs-fix-mp-account-auth.sh --remote
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
ECS_HOST="${ECS_HOST:-admin@139.196.42.5}"
MIGRATION="20260603120000_mp_account_auth.sql"

apply_local() {
  bash "$ROOT/scripts/ecs-apply-supabase-migration.sh" "$MIGRATION"
  if [[ -f "$ROOT/supabase/ecs_service_role_grants.sql" ]]; then
    # shellcheck disable=SC1090
    source "$HOME/stack/db-credentials.txt"
    export PGPASSWORD="$POSTGRES_PASSWORD"
    echo "=== GRANT service_role ==="
    psql -h 127.0.0.1 -p "${ECS_PG_PORT:-5433}" -U postgres -d "${ECS_PG_DB:-postgres}" \
      -v ON_ERROR_STOP=1 -f "$ROOT/supabase/ecs_service_role_grants.sql"
  fi
}

verify_tables() {
  # shellcheck disable=SC1090
  source "$HOME/stack/db-credentials.txt"
  export PGPASSWORD="$POSTGRES_PASSWORD"
  echo "=== 校验 mp_accounts / mp_auth_sessions / mp_wx_scan_tickets ==="
  psql -h 127.0.0.1 -p "${ECS_PG_PORT:-5433}" -U postgres -d "${ECS_PG_DB:-postgres}" -c "
SELECT table_name FROM information_schema.tables
 WHERE table_schema='public' AND table_name IN ('mp_accounts','mp_auth_sessions','mp_wx_scan_tickets')
 ORDER BY 1;
"
}

restart_services() {
  if systemctl is-active --quiet meoo-postgrest 2>/dev/null; then
    echo "=== 重启 PostgREST（刷新 schema）==="
    sudo systemctl restart meoo-postgrest
    sleep 2
  fi
  if systemctl is-active --quiet meoo-auth-api 2>/dev/null; then
    echo "=== 重启 meoo-auth-api ==="
    sudo systemctl restart meoo-auth-api
    sleep 2
  fi
  PORT="${AUTH_API_PORT:-3001}"
  echo "=== 探活 mp-auth（dev 模式可能返回 wx_not_configured，表存在即可）==="
  curl -sS -m 10 -X POST "http://127.0.0.1:${PORT}/api/meoo-ops-mp-auth" \
    -H 'Content-Type: application/json' \
    -d '{"action":"scan_create"}' | head -c 280
  echo
}

if [[ "${1:-}" == "--remote" ]]; then
  echo "上传并远程执行 → $ECS_HOST"
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
  sudo -u postgres psql -h 127.0.0.1 -p 5433 -d postgres -f "\$HOME/app/supabase/ecs_service_role_grants.sql" || true
fi
sudo -u postgres psql -h 127.0.0.1 -p 5433 -d postgres -c "
SELECT table_name FROM information_schema.tables
 WHERE table_schema='public' AND table_name LIKE 'mp_%' ORDER BY 1;
"
if systemctl is-active --quiet meoo-postgrest 2>/dev/null; then sudo systemctl restart meoo-postgrest; fi
if systemctl is-active --quiet meoo-auth-api 2>/dev/null; then sudo systemctl restart meoo-auth-api; fi
curl -sS -m 10 -X POST "http://127.0.0.1:3001/api/meoo-ops-mp-auth" -H 'Content-Type: application/json' -d '{"action":"scan_create"}' | head -c 200
echo
echo "完成."
EOF
  exit 0
fi

if [[ ! -f "$HOME/stack/db-credentials.txt" ]]; then
  echo "请在 ECS 上运行，或: ECS_HOST=admin@139.196.42.5 $0 --remote"
  exit 1
fi

apply_local
verify_tables
restart_services
echo "OK: mp 账号表已就绪（ECS Postgres）"
