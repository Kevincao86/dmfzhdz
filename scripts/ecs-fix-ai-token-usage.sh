#!/usr/bin/env bash
# 在轻量 ECS 上创建 ai_token_usage_daily 表与 increment 函数
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
SQL="$ROOT/supabase/migrations/20260624120000_ai_token_usage_daily.sql"
if [[ ! -f "$SQL" ]]; then
  echo "missing migration: $SQL" >&2
  exit 1
fi
if [[ "${1:-}" == "--remote" ]]; then
  ECS_HOST="${ECS_HOST:-admin@139.196.42.5}"
  scp "$SQL" "$ECS_HOST:/tmp/ai_token_usage_daily.sql"
  ssh "$ECS_HOST" 'sudo -u postgres psql -d postgres -f /tmp/ai_token_usage_daily.sql && rm -f /tmp/ai_token_usage_daily.sql'
  echo "OK: ai_token_usage_daily applied on ECS"
  exit 0
fi
if command -v psql >/dev/null 2>&1 && [[ -n "${DATABASE_URL:-}" ]]; then
  psql "$DATABASE_URL" -f "$SQL"
  echo "OK: ai_token_usage_daily applied locally"
  exit 0
fi
echo "Run on ECS: ECS_HOST=admin@139.196.42.5 bash scripts/ecs-fix-ai-token-usage.sh --remote" >&2
exit 1
