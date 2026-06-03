#!/usr/bin/env bash
# 确保 meoo-auth-api 在 :3001 监听（失败则自动跑 ecs-fix-erp-api-502.sh）
# ECS admin: cd ~/app && bash scripts/ecs-ensure-auth-api.sh

set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
PORT="${AUTH_API_PORT:-3001}"

if [[ "$(id -un)" != "admin" ]]; then
  echo "请用 admin 执行: su - admin -c 'cd ~/app && bash scripts/ecs-ensure-auth-api.sh'"
  exit 1
fi

ping_ok() {
  curl -sf -m 3 "http://127.0.0.1:${PORT}/api/meoo-auth-ping" >/dev/null 2>&1
}

echo "=== meoo-auth-api 状态 ==="
systemctl is-active meoo-auth-api 2>/dev/null || echo "inactive/failed"
systemctl is-enabled meoo-auth-api 2>/dev/null || true

if ping_ok; then
  echo "OK: :${PORT} 已在监听"
  curl -sS -m 5 "http://127.0.0.1:${PORT}/api/meoo-erp-api-health" | head -c 160
  echo ""
  exit 0
fi

echo "WARN: :${PORT} 无响应，最近日志："
sudo journalctl -u meoo-auth-api -n 25 --no-pager 2>/dev/null || true
echo ""
echo "=== 执行一键修复 ecs-fix-erp-api-502.sh ==="
bash "$ROOT/scripts/ecs-fix-erp-api-502.sh"
