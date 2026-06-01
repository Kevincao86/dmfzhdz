#!/usr/bin/env bash
# 在 ECS 上执行 Supabase 迁移 SQL（Postgres 默认端口 5433）
#
# ECS 上（代码已在 ~/app）：
#   bash ~/app/scripts/ecs-apply-supabase-migration.sh
#   bash ~/app/scripts/ecs-apply-supabase-migration.sh supabase/migrations/20260601120000_tenant_partner_edition.sql
#
# 从本机经 SSH 推送并执行（需能 ssh admin@ECS）：
#   ECS_HOST=admin@139.196.42.5 bash scripts/ecs-apply-supabase-migration.sh --remote
#   ECS_HOST=admin@139.196.42.5 bash scripts/ecs-apply-supabase-migration.sh --remote 20260601120000_tenant_partner_edition.sql

set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
ECS_HOST="${ECS_HOST:-admin@139.196.42.5}"
ECS_APP="${ECS_APP:-~/app}"
ECS_PORT="${ECS_PG_PORT:-5433}"
ECS_DB="${ECS_PG_DB:-postgres}"
REMOTE=0
MIGRATION_ARG=""

for arg in "$@"; do
  case "$arg" in
    --remote) REMOTE=1 ;;
    *)
      if [[ -z "$MIGRATION_ARG" ]]; then
        MIGRATION_ARG="$arg"
      fi
      ;;
  esac
done

resolve_migration_file() {
  local spec="${1:-}"
  if [[ -z "$spec" ]]; then
    echo "$ROOT/supabase/migrations/20260601120000_tenant_partner_edition.sql"
    return
  fi
  if [[ -f "$spec" ]]; then
    echo "$spec"
    return
  fi
  if [[ -f "$ROOT/supabase/migrations/${spec}.sql" ]]; then
    echo "$ROOT/supabase/migrations/${spec}.sql"
    return
  fi
  if [[ -f "$ROOT/supabase/migrations/$spec" ]]; then
    echo "$ROOT/supabase/migrations/$spec"
    return
  fi
  echo "找不到迁移文件: $spec" >&2
  exit 1
}

MIGRATION_FILE="$(resolve_migration_file "$MIGRATION_ARG")"
MIGRATION_BASENAME="$(basename "$MIGRATION_FILE")"

run_on_ecs() {
  local remote_sql_path="$1"
  ssh "$ECS_HOST" bash -s <<EOF
set -euo pipefail
CREDS="\$HOME/stack/db-credentials.txt"
if [[ ! -f "\$CREDS" ]]; then
  echo "缺少 ~/stack/db-credentials.txt"
  exit 1
fi
# shellcheck disable=SC1090
source "\$CREDS"
export PGPASSWORD="\$POSTGRES_PASSWORD"

echo "=== 应用迁移: ${MIGRATION_BASENAME} ==="
sudo -u postgres psql -h 127.0.0.1 -p ${ECS_PORT} -d ${ECS_DB} -v ON_ERROR_STOP=1 -f "${remote_sql_path}"

echo "=== 校验 ==="
sudo -u postgres psql -h 127.0.0.1 -p ${ECS_PORT} -d ${ECS_DB} -c "
SELECT column_name FROM information_schema.columns
 WHERE table_schema='public' AND table_name='tenants' AND column_name='edition';
"
sudo -u postgres psql -h 127.0.0.1 -p ${ECS_PORT} -d ${ECS_DB} -c "
SELECT to_regclass('public.tenant_partner_clients') AS tenant_partner_clients;
"

if systemctl is-active --quiet meoo-postgrest 2>/dev/null; then
  echo "=== 重启 PostgREST（刷新 schema）==="
  sudo systemctl restart meoo-postgrest
fi
echo "完成."
EOF
}

if [[ "$REMOTE" -eq 1 ]]; then
  REMOTE_PATH="/tmp/${MIGRATION_BASENAME}"
  echo "上传 → $ECS_HOST:$REMOTE_PATH"
  scp "$MIGRATION_FILE" "${ECS_HOST}:${REMOTE_PATH}"
  run_on_ecs "$REMOTE_PATH"
  ssh "$ECS_HOST" "rm -f ${REMOTE_PATH}"
  exit 0
fi

# 在 ECS 本机执行
if [[ ! -f "$HOME/stack/db-credentials.txt" ]]; then
  echo "请在 ECS 上运行，或本机使用: ECS_HOST=... $0 --remote"
  exit 1
fi
# shellcheck disable=SC1090
source "$HOME/stack/db-credentials.txt"
export PGPASSWORD="$POSTGRES_PASSWORD"

SQL_PATH="$MIGRATION_FILE"
if [[ ! -f "$SQL_PATH" && -f "$ECS_APP/supabase/migrations/$MIGRATION_BASENAME" ]]; then
  SQL_PATH="$HOME/app/supabase/migrations/$MIGRATION_BASENAME"
fi

echo "=== 应用迁移: $MIGRATION_BASENAME ==="
psql -h 127.0.0.1 -p "$ECS_PORT" -U postgres -d "$ECS_DB" -v ON_ERROR_STOP=1 -f "$SQL_PATH"

echo "完成."
