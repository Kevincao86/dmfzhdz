#!/usr/bin/env bash
# 延长指定招募单报名截止，修复「运营台可见、大厅失踪」
# ECS admin: ORDER_ID=MP-ICE-178099886982 bash scripts/ecs-repair-mp-hall-order-deadline.sh

set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
ORDER_ID="${ORDER_ID:-}"
EXTEND_DAYS="${EXTEND_DAYS:-14}"

if [[ "$(id -un)" != "admin" ]]; then
  echo "请用 admin 执行（勿 sudo 整条命令）"
  exit 1
fi

if [[ -z "$ORDER_ID" ]]; then
  echo "用法: ORDER_ID=MP-ICE-xxx [EXTEND_DAYS=14] bash scripts/ecs-repair-mp-hall-order-deadline.sh"
  exit 1
fi

cd "$ROOT/web版/merchant-erp"
if [[ -f .env ]]; then
  set -a
  # shellcheck disable=SC1091
  source .env
  set +a
fi

export ORDER_ID EXTEND_DAYS
node "$ROOT/scripts/ecs-repair-mp-hall-order-deadline.mjs"

echo ""
echo "=== 重启 auth-api 使大厅缓存刷新 ==="
sudo systemctl restart meoo-auth-api
sleep 2
curl -sf -m 5 "http://127.0.0.1:${AUTH_API_PORT:-3001}/api/meoo-auth-ping" >/dev/null && echo "auth-api OK"
