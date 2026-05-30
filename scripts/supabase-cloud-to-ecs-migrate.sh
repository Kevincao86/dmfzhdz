#!/usr/bin/env bash
# Supabase Cloud → ECS PostgreSQL 数据迁移（保留 auth.users + public 业务表）
#
# 在 Mac 上执行导出；在 ECS 上执行导入。
# 需要：Supabase 数据库密码、ECS postgres 密码（~/stack/db-credentials.txt）
#
# 用法示例：
#   # Mac 导出
#   export SUPABASE_DB_URL='postgresql://postgres:YOUR_PASS@db.rborqkadhtwxqoaskddy.supabase.co:5432/postgres'
#   bash scripts/supabase-cloud-to-ecs-migrate.sh export
#
#   scp ~/Downloads/meoo-supabase.dump admin@139.196.42.5:~/stack/
#
#   # ECS 导入（会覆盖 public/auth 同名对象，导入前请先备份 ECS）
#   bash scripts/supabase-cloud-to-ecs-migrate.sh import ~/stack/meoo-supabase.dump

set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
DUMP="${2:-$HOME/Downloads/meoo-supabase.dump}"
ECS_PORT="${ECS_PG_PORT:-5433}"
ECS_DB="${ECS_PG_DB:-postgres}"
ECS_USER="${ECS_PG_USER:-postgres}"

export_cmd() {
  if [[ -z "${SUPABASE_DB_URL:-}" ]]; then
    echo "请设置 Supabase 直连 URL（Dashboard → Project Settings → Database → Connection string → URI）："
    echo "  export SUPABASE_DB_URL='postgresql://postgres:密码@db.项目ref.supabase.co:5432/postgres'"
    exit 1
  fi
  if ! command -v pg_dump >/dev/null; then
    echo "Mac 需安装 PostgreSQL 客户端：brew install libpq && brew link --force libpq"
    exit 1
  fi

  echo "导出 Supabase Cloud → $DUMP"
  echo "包含 schema: public, auth, storage（若有）"

  pg_dump "$SUPABASE_DB_URL" \
    --format=custom \
    --no-owner \
    --no-acl \
    --schema=public \
    --schema=auth \
    --schema=storage \
    --file="$DUMP"

  ls -lh "$DUMP"
  echo "完成。请 scp 到 ECS: scp $DUMP admin@139.196.42.5:~/stack/"
}

import_cmd() {
  local file="$1"
  if [[ ! -f "$file" ]]; then
    echo "找不到 dump 文件: $file"
    exit 1
  fi

  CREDS="$HOME/stack/db-credentials.txt"
  if [[ -f "$CREDS" ]]; then
    # shellcheck disable=SC1090
    source "$CREDS"
  fi

  if [[ -z "${POSTGRES_PASSWORD:-}" ]]; then
    read -rsp "ECS postgres 密码: " POSTGRES_PASSWORD
    echo
  fi

  export PGPASSWORD="$POSTGRES_PASSWORD"

  echo "=== 1/4 备份当前 ECS 库（以防万一）==="
  BACKUP="$HOME/stack/ecs-before-import-$(date +%Y%m%d-%H%M%S).dump"
  pg_dump -h 127.0.0.1 -p "$ECS_PORT" -U "$ECS_USER" -d "$ECS_DB" \
    --format=custom --no-owner --no-acl \
    --schema=public --schema=auth \
    --file="$BACKUP" || true
  echo "ECS 备份: $BACKUP"

  echo "=== 2/4 导入 Supabase dump（--clean 会删除同名表后重建）==="
  pg_restore -h 127.0.0.1 -p "$ECS_PORT" -U "$ECS_USER" -d "$ECS_DB" \
    --no-owner --no-acl --clean --if-exists \
    "$file" || {
      echo "pg_restore 可能有 benign 警告（如 extension 已存在），继续后续步骤…"
    }

  echo "=== 3/4 补 GRANT（PostgREST service_role）==="
  if [[ -f "$ROOT/supabase/ecs_service_role_grants.sql" ]]; then
    psql -h 127.0.0.1 -p "$ECS_PORT" -U "$ECS_USER" -d "$ECS_DB" \
      -f "$ROOT/supabase/ecs_service_role_grants.sql"
  elif [[ -f "$HOME/app/supabase/ecs_service_role_grants.sql" ]]; then
    psql -h 127.0.0.1 -p "$ECS_PORT" -U "$ECS_USER" -d "$ECS_DB" \
      -f "$HOME/app/supabase/ecs_service_role_grants.sql"
  fi

  echo "=== 4/4 简单校验 ==="
  psql -h 127.0.0.1 -p "$ECS_PORT" -U "$ECS_USER" -d "$ECS_DB" -c \
    "SELECT 'auth.users' AS tbl, count(*) FROM auth.users
     UNION ALL SELECT 'public.tenants', count(*) FROM public.tenants
     UNION ALL SELECT 'public.tenant_members', count(*) FROM public.tenant_members;"

  echo "导入完成。请重启 GoTrue / PostgREST："
  echo "  sudo systemctl restart meoo-gotrue meoo-postgrest"
}

verify_cmd() {
  export PGPASSWORD="${POSTGRES_PASSWORD:-}"
  if [[ -z "$PGPASSWORD" && -f "$HOME/stack/db-credentials.txt" ]]; then
    source "$HOME/stack/db-credentials.txt"
    export PGPASSWORD="$POSTGRES_PASSWORD"
  fi
  psql -h 127.0.0.1 -p "$ECS_PORT" -U "$ECS_USER" -d "$ECS_DB" <<'SQL'
\dt public.*
SELECT count(*) AS users FROM auth.users;
SELECT count(*) AS tenants FROM public.tenants;
SQL
}

case "${1:-}" in
  export) export_cmd ;;
  import) import_cmd "$DUMP" ;;
  verify) verify_cmd ;;
  *)
    echo "用法: $0 export | import [dump路径] | verify"
    exit 1
    ;;
esac
