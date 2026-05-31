#!/usr/bin/env bash
# 修复 erp-api 502（智能体 / 运营台）。ECS 任选其一执行：
#   cd ~/app && git pull && bash scripts/ecs-fix-erp-api-502.sh
#   cd ~/app/web版/merchant-erp && git pull && bash scripts/ecs-fix-erp-api-502.sh

set -euo pipefail

HERE="$(cd "$(dirname "$0")" && pwd)"
ERP="$(cd "$HERE/.." && pwd)"
# 仓库根：web版/merchant-erp/scripts -> ../../..
if [[ -f "$HERE/../../../scripts/ecs-install-auth-api-systemd.sh" ]]; then
  ROOT="$(cd "$HERE/../../.." && pwd)"
elif [[ -f "$HOME/app/scripts/ecs-install-auth-api-systemd.sh" ]]; then
  ROOT="$HOME/app"
else
  ROOT="$(cd "$HERE/../../.." && pwd)"
fi

PORT="${AUTH_API_PORT:-3001}"
MIN_REVISION="20260531-ai-erp-api"
INSTALL="$ROOT/scripts/ecs-install-auth-api-systemd.sh"
RUN_AUTH="$ROOT/scripts/ecs-run-auth-api.sh"

echo "ROOT=$ROOT"
echo "ERP=$ERP"

echo "== 0) 拉取最新代码 =="
if [[ -d "$ROOT/.git" ]]; then
  (cd "$ROOT" && git pull --ff-only) || (cd "$ROOT" && git pull)
fi

echo "== 1) 停止旧进程 =="
pkill -f ecs-auth-api-server 2>/dev/null || true
sleep 1

echo "== 2) 生成 env（若缺失）并安装 systemd =="
if [[ ! -f "$HOME/stack/auth-api.env" ]]; then
  if [[ -f "$RUN_AUTH" ]]; then
    bash "$RUN_AUTH" &
    sleep 3
    pkill -f ecs-auth-api-server 2>/dev/null || true
  else
    echo "缺少 $RUN_AUTH，请先配置 ~/stack/auth-api.env"
    exit 1
  fi
fi

if [[ ! -d "$ERP/node_modules/@supabase/supabase-js" ]]; then
  echo "== 2b) npm ci =="
  (cd "$ERP" && npm ci)
fi

if [[ -f "$INSTALL" ]]; then
  bash "$INSTALL"
else
  echo "缺少 $INSTALL，尝试直接 systemctl restart meoo-auth-api"
  sudo systemctl daemon-reload
  sudo systemctl enable meoo-auth-api 2>/dev/null || true
  sudo systemctl restart meoo-auth-api
fi

echo "== 3) 本机探活 =="
curl -sf "http://127.0.0.1:${PORT}/api/meoo-auth-ping" >/dev/null
HEALTH_LOCAL="$(curl -sS "http://127.0.0.1:${PORT}/api/meoo-erp-api-health")"
echo "$HEALTH_LOCAL" | head -c 200
echo
if ! echo "$HEALTH_LOCAL" | grep -q "$MIN_REVISION"; then
  echo "WARN: revision 未含 $MIN_REVISION → sudo systemctl restart meoo-auth-api"
fi

echo "== 4) 公网探活 =="
HEALTH_PUBLIC="$(curl -sS "https://mofangdianai.com/erp-api/meoo-erp-api-health" 2>/dev/null || true)"
if echo "$HEALTH_PUBLIC" | grep -q '"ok":true'; then
  echo "OK: https://mofangdianai.com/erp-api/meoo-erp-api-health"
  echo "$HEALTH_PUBLIC" | head -c 200
  echo
else
  echo "公网失败，查看: sudo journalctl -u meoo-auth-api -n 40 --no-pager"
  exit 1
fi

echo "完成。请刷新商户 ERP AI 智能体。"
