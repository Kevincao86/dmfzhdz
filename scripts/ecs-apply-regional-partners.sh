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
MIGRATIONS=(
  "20260726170000_regional_partners.sql"
  "20260726180000_tenants_register_city.sql"
  "20260727100000_tenants_business_license_address.sql"
  "20260728120000_regional_partners_subscription_pricing.sql"
)
PG_PORT="${ECS_PG_PORT:-5433}"
PG_DB="${ECS_PG_DB:-postgres}"

resolve_mig() {
  local app_root="$1"
  local name="$2"
  local p="$app_root/supabase/migrations/$name"
  if [[ -f "$p" ]]; then
    echo "$p"
    return 0
  fi
  p="$ROOT/supabase/migrations/$name"
  if [[ -f "$p" ]]; then
    echo "$p"
    return 0
  fi
  return 1
}

run_apply() {
  local app_root="$1"

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

  local i=1
  for mig in "${MIGRATIONS[@]}"; do
    local mig_path
    mig_path="$(resolve_mig "$app_root" "$mig")" || {
      echo "FATAL: 找不到 $mig"
      exit 1
    }
    echo "=== $i) 应用迁移 $mig ==="
    psql -h 127.0.0.1 -p "$PG_PORT" -U postgres -d "$PG_DB" -v ON_ERROR_STOP=1 -f "$mig_path"
    i=$((i + 1))
  done

  local grants="$app_root/supabase/ecs_service_role_grants.sql"
  if [[ -f "$grants" ]]; then
    echo "=== $i) GRANT service_role ==="
    psql -h 127.0.0.1 -p "$PG_PORT" -U postgres -d "$PG_DB" -v ON_ERROR_STOP=1 -f "$grants"
  fi

  echo "=== 校验 ==="
  psql -h 127.0.0.1 -p "$PG_PORT" -U postgres -d "$PG_DB" -v ON_ERROR_STOP=1 -c \
    "select to_regclass('public.regional_partners') as regional_partners,
            (select count(*) from information_schema.columns
              where table_schema='public' and table_name='tenants' and column_name='register_city') as has_register_city;"

  echo "OK: regional_partners + register_city 已就绪。请 sudo systemctl restart meoo-postgrest && 重启 auth-api。"
}

if [[ "${1:-}" == "--remote" ]]; then
  ssh -o StrictHostKeyChecking=accept-new "$ECS_HOST" \
    "cd ~/app && git pull --ff-only && bash scripts/ecs-apply-regional-partners.sh"
  exit 0
fi

run_apply "${HOME}/app"
