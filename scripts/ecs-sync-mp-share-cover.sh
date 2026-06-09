#!/usr/bin/env bash
# 小程序分享封面 → https://mofangdianai.com/recruit-covers/share/share-cover-ai-match.jpg
# 须在轻量 ECS 执行（非 Vercel、非本地 Mac）
# 用法：cd ~/app && git pull gitee main && bash scripts/ecs-sync-mp-share-cover.sh
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
SRC="$ROOT/灵祺达人撮合小程序/images/share/share-cover-ai-match.jpg"
NGINX_SITE="/etc/nginx/sites-available/meoo-api"
STATIC_ROOT="/var/www/meoo-static"
STATIC_FILE="$STATIC_ROOT/recruit-covers/share/share-cover-ai-match.jpg"

if [[ ! -f "$SRC" ]]; then
  echo "FAIL: 缺少 $SRC"
  exit 1
fi

echo "==> 写入 $STATIC_FILE"
sudo mkdir -p "$(dirname "$STATIC_FILE")"
sudo cp -f "$SRC" "$STATIC_FILE"
sudo chmod 755 "$STATIC_ROOT" "$STATIC_ROOT/recruit-covers" "$STATIC_ROOT/recruit-covers/share"
sudo chmod 644 "$STATIC_FILE"
if id www-data >/dev/null 2>&1; then
  sudo chown -R www-data:www-data "$STATIC_ROOT" 2>/dev/null || true
fi

# 备份：dist / fulfillment public（可选，本地调试用）
for dir in \
  "$ROOT/web版/merchant-erp/dist/recruit-covers/share" \
  "$ROOT/灵祺达人履约管理后台/public/recruit-covers/share"; do
  mkdir -p "$dir"
  cp -f "$SRC" "$dir/share-cover-ai-match.jpg"
  chmod 644 "$dir/share-cover-ai-match.jpg" 2>/dev/null || true
done

echo "==> 部署 Nginx"
sudo cp "$ROOT/scripts/ecs-meoo-api.nginx.conf" "$NGINX_SITE"
sudo ln -sf "$NGINX_SITE" /etc/nginx/sites-enabled/meoo-api
sudo nginx -t
sudo systemctl reload nginx
echo "OK: nginx reload"

echo "==> 自测（轻量本机）"
LOCAL_CODE="$(curl -sS -o /dev/null -w '%{http_code}' \
  -H 'Host: mofangdianai.com' \
  'http://127.0.0.1/recruit-covers/share/share-cover-ai-match.jpg' || echo 000)"
echo "127.0.0.1 HTTP $LOCAL_CODE (期望 200)"

HTTPS_CODE="$(curl -sS -o /dev/null -w '%{http_code}' \
  'https://mofangdianai.com/recruit-covers/share/share-cover-ai-match.jpg' || echo 000)"
echo "公网 HTTPS $HTTPS_CODE (期望 200)"

if [[ "$LOCAL_CODE" != "200" ]]; then
  echo "FAIL: 本机 Nginx 仍无法读封面，请执行:"
  echo "  ls -la $STATIC_FILE"
  echo "  sudo grep -A6 'recruit-covers' $NGINX_SITE"
  exit 1
fi

if [[ "$HTTPS_CODE" != "200" ]]; then
  echo "WARN: 本机 200 但公网 $HTTPS_CODE，检查 DNS/证书/防火墙"
  exit 1
fi

echo "OK: 分享封面已就绪，小程序可 downloadFile 上述 URL"
