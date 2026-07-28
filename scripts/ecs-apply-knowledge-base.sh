#!/usr/bin/env bash
# 知识库表迁移：先 pg_dump 备份，再应用 20260728100000_knowledge_base.sql
# 本机远程：
#   bash scripts/ecs-apply-knowledge-base.sh --remote
# 轻量上（代码已在 ~/app）：
#   bash ~/app/scripts/ecs-apply-knowledge-base.sh

set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
ECS_HOST="${ECS_HOST:-admin@139.196.42.5}"
ECS_APP="${ECS_APP:-~/app}"
MIGRATION_REL="supabase/migrations/20260728100000_knowledge_base.sql"
REMOTE=0

for arg in "$@"; do
  case "$arg" in
    --remote) REMOTE=1 ;;
  esac
done

run_on_light() {
  local app_dir="$1"
  local mig="$app_dir/$MIGRATION_REL"
  CREDS="${HOME}/stack/db-credentials.txt"
  if [[ ! -f "$CREDS" ]]; then
    echo "缺少 ~/stack/db-credentials.txt"
    exit 1
  fi
  # shellcheck disable=SC1090
  source "$CREDS"
  export PGPASSWORD="$POSTGRES_PASSWORD"
  mkdir -p "$HOME/stack/backups"
  local ts
  ts="$(date +%Y%m%d-%H%M%S)"
  local dump_file="$HOME/stack/backups/postgres-kb-${ts}.dump"
  echo "=== 备份 Postgres → $dump_file ==="
  pg_dump -h 127.0.0.1 -p 5433 -U postgres -d postgres -Fc -f "$dump_file"
  echo "=== 应用迁移 $mig ==="
  if [[ ! -f "$mig" ]]; then
    echo "缺少迁移文件: $mig"
    exit 1
  fi
  psql -h 127.0.0.1 -p 5433 -U postgres -d postgres -v ON_ERROR_STOP=1 -f "$mig"
  echo "=== 校验表 ==="
  psql -h 127.0.0.1 -p 5433 -U postgres -d postgres -c "
SELECT to_regclass('public.kb_spaces') AS kb_spaces,
       to_regclass('public.kb_documents') AS kb_documents,
       to_regclass('public.kb_chunks') AS kb_chunks;
"
  if systemctl is-active --quiet meoo-postgrest 2>/dev/null; then
    echo "=== 重启 PostgREST ==="
    sudo systemctl restart meoo-postgrest
  fi
  echo "OK: knowledge_base migration applied"
}

if [[ "$REMOTE" -eq 1 ]]; then
  echo "=== 同步迁移与脚本到轻量 ==="
  ssh "$ECS_HOST" "mkdir -p ${ECS_APP}/supabase/migrations ${ECS_APP}/scripts"
  scp "$ROOT/$MIGRATION_REL" "${ECS_HOST}:${ECS_APP}/${MIGRATION_REL}"
  scp "$ROOT/scripts/ecs-apply-knowledge-base.sh" "${ECS_HOST}:${ECS_APP}/scripts/ecs-apply-knowledge-base.sh"
  ssh "$ECS_HOST" "bash ${ECS_APP}/scripts/ecs-apply-knowledge-base.sh"
  exit 0
fi

if [[ -f "$HOME/stack/db-credentials.txt" ]]; then
  run_on_light "$ROOT"
  exit 0
fi

echo "请在轻量上执行，或本机加 --remote"
exit 1
