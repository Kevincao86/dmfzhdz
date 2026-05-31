#!/usr/bin/env bash
# 修复运营台「注册表 502 Bad Gateway」：确保 auth-api 由 systemd 常驻且 Nginx /erp-api 可反代。
# 在 ECS 执行: cd ~/app && git pull && bash scripts/ecs-fix-erp-api-502.sh

set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
PORT="${AUTH_API_PORT:-3001}"

echo "== 1) 停止旧进程 =="
pkill -f ecs-auth-api-server 2>/dev/null || true
sleep 1

echo "== 2) 生成 env（若缺失）并安装 systemd =="
if [[ ! -f "$HOME/stack/auth-api.env" ]]; then
  bash "$ROOT/scripts/ecs-run-auth-api.sh" &
  sleep 3
  pkill -f ecs-auth-api-server 2>/dev/null || true
fi
bash "$ROOT/scripts/ecs-install-auth-api-systemd.sh"

echo "== 3) 本机探活 =="
curl -sf "http://127.0.0.1:${PORT}/api/meoo-auth-ping" >/dev/null
curl -sS "http://127.0.0.1:${PORT}/api/meoo-ops-sync-registry" | head -c 120
echo

echo "== 4) 公网探活（经 Nginx） =="
if curl -sf "https://mofangdianai.com/erp-api/meoo-erp-api-health" >/dev/null; then
  echo "OK: https://mofangdianai.com/erp-api/meoo-erp-api-health"
else
  echo "WARN: 公网仍失败。请检查 Nginx 是否含 location /erp-api/ 并 proxy_pass http://127.0.0.1:${PORT}/api/;"
  echo "  sudo nginx -t && sudo systemctl reload nginx"
  curl -sSI "https://mofangdianai.com/erp-api/meoo-erp-api-health" | head -n 8 || true
fi

echo "完成。运营台请 Redeploy 后刷新 AI 模型页。"
