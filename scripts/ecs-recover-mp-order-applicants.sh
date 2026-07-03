#!/usr/bin/env bash
# 轻量 ECS 上恢复招募单 applicants（自动加载 ~/stack/auth-api.env）
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

for f in "$HOME/stack/auth-api.env" "$HOME/stack/.env"; do
  if [[ -f "$f" ]]; then
    set -a
    # shellcheck disable=SC1090
    source "$f"
    set +a
    break
  fi
done

cd "$ROOT"
export ORDER_ID DRY_RUN
exec node scripts/ecs-recover-mp-order-applicants.mjs
