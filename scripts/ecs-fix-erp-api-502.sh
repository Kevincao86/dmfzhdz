#!/usr/bin/env bash
# 修复运营台 / 智能体「erp-api 502」：auth-api 须由 systemd 常驻（仅 Vercel 部署无法修复）。
# 在 ECS 执行:
#   cd ~/app && git pull && bash scripts/ecs-fix-erp-api-502.sh

set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
# shellcheck source=ecs-resolve-admin-home.sh
source "$ROOT/scripts/ecs-resolve-admin-home.sh"
# shellcheck source=ecs-resolve-erp-path.sh
source "$ROOT/scripts/ecs-resolve-erp-path.sh"
ERP="$(ecs_resolve_erp_dir "$ROOT")"
echo "merchant-erp 路径: $ERP"

if [[ ! -f "$HOME/stack/db-credentials.txt" ]]; then
  echo "缺少 $HOME/stack/db-credentials.txt（当前用户=$(id -un) HOME=$HOME）"
  echo "勿使用: sudo bash scripts/ecs-fix-erp-api-502.sh"
  echo "请用 admin 执行: cd ~/app && bash scripts/ecs-fix-erp-api-502.sh"
  exit 1
fi
PORT="${AUTH_API_PORT:-3001}"
MIN_REVISION="$(
  grep -E "ECS_AUTH_API_ROUTE_REVISION\s*=" "$ERP/scripts/ecs-auth-api-server.ts" \
    | head -1 \
    | sed -E "s/.*'([^']+)'.*/\1/"
)"
echo "期望 revision=${MIN_REVISION:-unknown}"

echo "== 0) 拉取最新代码（含 meoo-ai-chat 路由） =="
if [[ -d "$ROOT/.git" ]]; then
  (cd "$ROOT" && git pull --ff-only) || (cd "$ROOT" && git pull)
else
  echo "WARN: $ROOT 不是 git 仓库，请确认代码已同步到 ECS"
fi

echo "== 1) 停止旧进程 =="
sudo systemctl stop meoo-auth-api 2>/dev/null || true
sudo pkill -f 'tsx.*ecs-auth-api-server' 2>/dev/null || true
sudo pkill -f ecs-auth-api-server 2>/dev/null || true
sleep 2

echo "== 2) 生成 env（若缺失）并安装 systemd =="
if [[ ! -f "$HOME/stack/auth-api.env" ]]; then
  bash "$ROOT/scripts/ecs-run-auth-api.sh" &
  sleep 3
  pkill -f ecs-auth-api-server 2>/dev/null || true
fi
if [[ ! -d "$ERP/node_modules/@supabase/supabase-js" ]]; then
  echo "== 2b) 安装 merchant-erp 依赖 =="
  (cd "$ERP" && npm ci)
fi

bash "$ROOT/scripts/ecs-install-auth-api-systemd.sh"

echo "== 3) 本机探活 =="
curl -sf "http://127.0.0.1:${PORT}/api/meoo-auth-ping" >/dev/null
HEALTH_LOCAL="$(curl -sS "http://127.0.0.1:${PORT}/api/meoo-erp-api-health")"
echo "$HEALTH_LOCAL" | head -c 200
echo
if ! echo "$HEALTH_LOCAL" | grep -q "$MIN_REVISION"; then
  echo "WARN: 本机 revision 未含 $MIN_REVISION，请确认 git pull 成功并: sudo systemctl restart meoo-auth-api"
fi
REG_SAMPLE="$(curl -sS "http://127.0.0.1:${PORT}/api/meoo-ops-sync-registry")"
echo "${REG_SAMPLE}" | head -c 120
echo

echo "== 4) 公网探活（经 Nginx） =="
HEALTH_PUBLIC="$(curl -sS "https://mofangdianai.com/erp-api/meoo-erp-api-health" 2>/dev/null || true)"
if echo "$HEALTH_PUBLIC" | grep -q '"ok":true'; then
  echo "OK: https://mofangdianai.com/erp-api/meoo-erp-api-health"
  echo "$HEALTH_PUBLIC" | head -c 200
  echo
  if ! echo "$HEALTH_PUBLIC" | grep -q "$MIN_REVISION"; then
    echo "WARN: 公网 revision 过旧，ECS 代码可能未更新"
  fi
else
  echo "WARN: 公网仍失败。请检查 Nginx 是否含 location /erp-api/ 并 proxy_pass http://127.0.0.1:${PORT}/api/;"
  echo "  sudo cp ~/app/scripts/ecs-meoo-api.nginx.conf /etc/nginx/sites-available/meoo-api"
  echo "  sudo nginx -t && sudo systemctl reload nginx"
  echo "  sudo journalctl -u meoo-auth-api -n 40 --no-pager"
  curl -sSI "https://mofangdianai.com/erp-api/meoo-erp-api-health" | head -n 8 || true
  exit 1
fi

echo "完成。商户 ERP 智能体无需再改 Vercel，刷新 AI 智能体即可。"
