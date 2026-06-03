#!/usr/bin/env bash
# 探活招募大厅接口（只应返回 mpRecruitmentOrders 数组）
# ECS admin: cd ~/app && bash scripts/ecs-git-pull-main.sh && bash scripts/ecs-verify-mp-hall-registry.sh

set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
PORT="${AUTH_API_PORT:-3001}"

if [[ "$(id -un)" != "admin" ]]; then
  echo "请用 admin 执行（勿 sudo 整条命令）"
  exit 1
fi

if ! curl -sf -m 3 "http://127.0.0.1:${PORT}/api/meoo-auth-ping" >/dev/null 2>&1; then
  echo "=== :${PORT} 未监听，先修复 auth-api ==="
  bash "$ROOT/scripts/ecs-ensure-auth-api.sh"
  echo ""
fi

echo "=== :${PORT} POST hall_registry（小程序主路径）==="
BODY="$(curl -sS -m 25 -X POST -H "Content-Type: application/json" \
  "http://127.0.0.1:${PORT}/api/meoo-ops-mp-auth" \
  -d '{"action":"hall_registry"}' || true)"
echo "${BODY}" | head -c 500
echo ""

if ! echo "$BODY" | grep -q 'mpRecruitmentOrders'; then
  echo "=== 回退 GET meoo-ops-mp-hall-registry ==="
  BODY="$(curl -sS -m 25 "http://127.0.0.1:${PORT}/api/meoo-ops-mp-hall-registry" || true)"
  echo "${BODY}" | head -c 500
  echo ""
fi

if ! echo "$BODY" | grep -q 'mpRecruitmentOrders'; then
  echo "FAIL: 响应不含 mpRecruitmentOrders"
  echo "  sudo journalctl -u meoo-auth-api -n 40 --no-pager"
  exit 1
fi

echo "=== Nginx /erp-api ==="
NGX="$(curl -sS -m 25 -H "Host: 139.196.42.5" "http://127.0.0.1/erp-api/meoo-ops-mp-hall-registry" || true)"
echo "${NGX}" | head -c 500
echo ""
echo "OK: 招募大厅接口可用。请上传体验版并部署云函数 mpErpProxy。"
