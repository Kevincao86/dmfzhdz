#!/usr/bin/env bash
# 在轻量 ECS 上创建 ai_token_usage_daily 表与 increment 函数（走标准迁移脚本，端口 5433 + 重启 PostgREST）
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
MIGRATION="20260624120000_ai_token_usage_daily.sql"

if [[ ! -f "$ROOT/supabase/migrations/${MIGRATION}.sql" ]]; then
  echo "missing migration: $ROOT/supabase/migrations/${MIGRATION}.sql" >&2
  exit 1
fi

echo "== 应用 AI Token 用量表迁移 =="
bash "$ROOT/scripts/ecs-apply-supabase-migration.sh" "$@" "$MIGRATION"

echo "== 校验 ai_token_usage_daily =="
VERIFY_SQL="SELECT to_regclass('public.ai_token_usage_daily') AS tbl, to_regprocedure('public.increment_ai_token_usage(text,uuid,date,text,text,bigint,bigint,bigint)') AS rpc;"
if [[ "${1:-}" == "--remote" ]]; then
  ECS_HOST="${ECS_HOST:-admin@139.196.42.5}"
  ssh "$ECS_HOST" "source ~/stack/db-credentials.txt && export PGPASSWORD=\"\$POSTGRES_PASSWORD\" && sudo -u postgres psql -h 127.0.0.1 -p 5433 -d postgres -c \"$VERIFY_SQL\""
else
  if [[ -f "$HOME/stack/db-credentials.txt" ]]; then
    # shellcheck disable=SC1090
    source "$HOME/stack/db-credentials.txt"
    export PGPASSWORD="$POSTGRES_PASSWORD"
    psql -h 127.0.0.1 -p 5433 -U postgres -d postgres -c "$VERIFY_SQL"
  fi
fi

echo "OK: ai_token_usage_daily + increment_ai_token_usage 已就绪"
