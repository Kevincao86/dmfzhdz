#!/usr/bin/env bash
# 商家 ERP：构建 dist 并部署到 mofangdianai.com（替代 Vercel cs）
# ECS（admin）:
#   cd ~/app && git pull
#   sudo bash scripts/ecs-deploy-merchant-web-mofangdianai.sh
#
# 构建前请准备 web版/merchant-erp/.env.production（见 .env.production.example）

set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
# shellcheck source=ecs-resolve-admin-home.sh
source "$ROOT/scripts/ecs-resolve-admin-home.sh"
ERP="$ROOT/web版/merchant-erp"
ENV_PROD="$ERP/.env.production"
ENV_EXAMPLE="$ERP/.env.production.example"
NGINX_SITE="/etc/nginx/sites-available/meoo-api"

if [[ "$(id -un)" == "root" && "${HOME:-}" == "/root" ]]; then
  echo "请用 admin 执行，或: su - admin -c 'cd ~/app && sudo bash scripts/ecs-deploy-merchant-web-mofangdianai.sh'"
  exit 1
fi

echo "== 0) 代码 =="
if [[ -d "$ROOT/.git" ]]; then
  (cd "$ROOT" && git pull --ff-only) || (cd "$ROOT" && git pull)
fi

echo "== 1) 生产构建环境 =="
if [[ ! -f "$ENV_PROD" ]]; then
  if [[ -f "$ENV_EXAMPLE" ]]; then
    cp "$ENV_EXAMPLE" "$ENV_PROD"
    echo "已从 .env.production.example 生成 $ENV_PROD，请填入 VITE_SUPABASE_ANON_KEY 后重跑"
  else
    echo "缺少 $ENV_PROD，请创建并设置 VITE_SUPABASE_URL=https://mofangdianai.com"
    exit 1
  fi
fi

echo "== 2) npm build =="
(cd "$ERP" && npm ci && npm run build)

if [[ ! -f "$ERP/dist/index.html" ]]; then
  echo "FAIL: 未生成 $ERP/dist/index.html"
  exit 1
fi
echo "OK: dist 已生成 ($(du -sh "$ERP/dist" | awk '{print $1}'))"

echo "== 3) Nginx =="
if [[ ! -f "$ROOT/scripts/ecs-meoo-api.nginx.conf" ]]; then
  echo "缺少 ecs-meoo-api.nginx.conf"
  exit 1
fi
sudo cp "$NGINX_SITE" "${NGINX_SITE}.bak.$(date +%Y%m%d%H%M%S)" 2>/dev/null || true
sudo cp "$ROOT/scripts/ecs-meoo-api.nginx.conf" "$NGINX_SITE"
sudo ln -sf "$NGINX_SITE" /etc/nginx/sites-enabled/meoo-api
sudo sed -i "s|root /home/admin/app/web版/merchant-erp/dist|root $ERP/dist|g" "$NGINX_SITE"
sudo nginx -t
sudo systemctl reload nginx

echo "== 4) auth-api =="
if systemctl is-active --quiet meoo-auth-api 2>/dev/null; then
  sudo systemctl restart meoo-auth-api
  sleep 2
fi

echo "== 5) 探活 =="
curl -sf "http://127.0.0.1:3001/api/meoo-auth-ping" >/dev/null && echo "OK: auth-api :3001"
curl -sS -o /dev/null -w "OK: local index HTTP %{http_code}\n" "http://127.0.0.1/" -H "Host: mofangdianai.com" 2>/dev/null || true

echo "完成。浏览器打开 https://mofangdianai.com ，API: https://mofangdianai.com/erp-api/meoo-erp-api-health"
