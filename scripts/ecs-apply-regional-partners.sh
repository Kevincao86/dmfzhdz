#!/usr/bin/env bash
# 区域服务商表 regional_partners + tenants 归因字段 → 轻量 ECS Postgres
#
# 在轻量 ECS 上（须先备份）：
#   source ~/stack/db-credentials.txt && pg_dump ...
#   cd ~/app && bash scripts/ecs-apply-regional-partners.sh
#
# 本机经 SSH：
#   ECS_HOST=admin@139.196.42.5 bash scripts/ecs-apply-regional-partners.sh --remote

set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
ECS_HOST="${ECS_HOST:-admin@139.196.42.5}"
MIGRATION="20260726170000_regional_partners.sql"
PG_PORT="${ECS_PG_PORT:-5433}"
PG_DB="${ECS_PG_DB:-postgres}"

run_apply() {
  local app_root="$1"
  local mig_path="$app_root/supabase/migrations/$MIGRATION"

  if [[ ! -f "$mig_path" ]]; then
    mig_path="$ROOT/supabase/migrations/$MIGRATION"
  fi
  if [[ ! -f "$mig_path" ]]; then
    echo "FATAL: 找不到 $MIGRATION"
    exit 1
  fi

  if [[ ! -f "$HOME/stack/db-credentials.txt" ]]; then
    echo "FATAL: 缺少 ~/stack/db-credentials.txt（请在轻量 ECS 上执行）"
    exit 1
  fi
  # shellcheck disable=SC1090
  source "$HOME/stack/db-credentials.txt"
  export PGPASSWORD="${POSTGRES_PASSWORD:-}"
  if [[ -z "$PGPASSWORD" ]]; then
    echo "FATAL: db-credentials.txt 中 POSTGRES_PASSWORD 为空"
    exit 1
  fi

  local backup_dir="$HOME/stack/backups"
  mkdir -p "$backup_dir"
  local stamp
  stamp="$(date +%Y%m%d-%H%M%S)"
  local dump_file="$backup_dir/postgres-before-regional-partners-${stamp}.dump"
  echo "=== 0) 备份 Postgres → $dump_file ==="
  pg_dump -h 127.0.0.1 -p "$PG_PORT" -U postgres -d "$PG_DB" -Fc -f "$dump_file"

  echo "=== 1) 应用迁移 $MIGRATION ==="
  psql -h 127.0.0.1 -p "$PG_PORT" -U postgres -d "$PG_DB" -v ON_ERROR_STOP=1 -f "$mig_path"

  local grants="$app_root/supabase/ecs_service_role_grants.sql"
  if [[ -f "$grants" ]]; then
    echo "=== 2) GRANT service_role ==="
    psql -h 127.0.0.1 -p "$PG_PORT" -U postgres -d "$PG_DB" -v ON_ERROR_STOP=1 -f "$grants"
  fi

  echo "=== 3) 校验 ==="
  psql -h 127.0.0.1 -p "$PG_PORT" -U postgres -d "$PG_DB" -v ON_ERROR_STOP=1 -c \
    "select to_regclass('public.regional_partners') as regional_partners;"

  echo "OK: regional_partners 已就绪。请 sudo systemctl restart meoo-postgrest && 重启 auth-api。"
}

if [[ "${1:-}" == "--remote" ]]; then
  ssh -o StrictHostKeyChecking=accept-new "$ECS_HOST" \
    "cd ~/app && git pull --ff-only && bash scripts/ecs-apply-regional-partners.sh"
  exit 0
fi

run_apply "${HOME}/app"
