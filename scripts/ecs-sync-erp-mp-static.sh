#!/usr/bin/env bash
# ERP 小程序静态图 → https://mofangdianai.com/erp-mp-static/
# 须在轻量执行：cd ~/app && bash scripts/ecs-sync-erp-mp-static.sh
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
SRC="$ROOT/灵祺ERP小程序/images"
STATIC_ROOT="/var/www/meoo-static/erp-mp-static"
NGINX_SITE="/etc/nginx/sites-available/meoo-api"

if [[ ! -d "$SRC" ]]; then
  echo "FAIL: 缺少 $SRC，请先 git pull"
  exit 1
fi

echo "==> 同步 ERP 小程序静态图 → $STATIC_ROOT"
sudo mkdir -p "$STATIC_ROOT"
sudo rsync -a --delete --exclude '.DS_Store' "$SRC"/ "$STATIC_ROOT"/
sudo chmod -R a+rX "$STATIC_ROOT"
sudo find "$STATIC_ROOT" -type f -exec chmod 644 {} \;
if id www-data >/dev/null 2>&1; then
  sudo chown -R www-data:www-data /var/www/meoo-static 2>/dev/null || true
fi

echo "==> 部署 Nginx"
sudo cp "$ROOT/scripts/ecs-meoo-api.nginx.conf" "$NGINX_SITE"
sudo ln -sf "$NGINX_SITE" /etc/nginx/sites-enabled/meoo-api
sudo nginx -t
sudo systemctl reload nginx

COUNT="$(find "$STATIC_ROOT" -type f | wc -l | tr -d ' ')"
echo "OK: $COUNT files → https://mofangdianai.com/erp-mp-static/"
curl -sS -o /dev/null -w "probe logo.png HTTP %{http_code}\n" "https://mofangdianai.com/erp-mp-static/logo.png" || true
