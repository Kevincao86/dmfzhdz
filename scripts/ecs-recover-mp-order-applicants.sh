#!/usr/bin/env bash
# 轻量 ECS 上恢复招募单 applicants（只读取 auth-api.env 中的 Supabase 变量，勿 source 整文件）
#   ORDER_ID=MP-RO-xxx DRY_RUN=1 bash scripts/ecs-recover-mp-order-applicants.sh
#   ORDER_ID=MP-RO-xxx bash scripts/ecs-recover-mp-order-applicants.sh

set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
ORDER_ID="${ORDER_ID:-}"
DRY_RUN="${DRY_RUN:-}"

if [[ -z "$ORDER_ID" ]]; then
  echo "用法: ORDER_ID=MP-RO-xxx [DRY_RUN=1] bash scripts/ecs-recover-mp-order-applicants.sh"
  exit 1
fi

read_env_kv() {
  local file="$1"
  local key="$2"
  [[ -f "$file" ]] || return 1
  grep -E "^${key}=" "$file" 2>/dev/null | head -1 | cut -d= -f2- | tr -d '\r' | sed 's/^["'\''"]//;s/["'\''"]$//'
}

for f in "$HOME/stack/auth-api.env" "$HOME/stack/.env"; do
  if [[ -z "${SUPABASE_URL:-}" ]]; then
    v="$(read_env_kv "$f" SUPABASE_URL || true)"
    [[ -n "$v" ]] && export SUPABASE_URL="$v"
  fi
  if [[ -z "${SUPABASE_SERVICE_ROLE_KEY:-}" ]]; then
    v="$(read_env_kv "$f" SUPABASE_SERVICE_ROLE_KEY || true)"
    [[ -n "$v" ]] && export SUPABASE_SERVICE_ROLE_KEY="$v"
  fi
done

cd "$ROOT"
export ORDER_ID DRY_RUN
exec node scripts/ecs-recover-mp-order-applicants.mjs
