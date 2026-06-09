#!/usr/bin/env bash
# 小程序分享封面 → Nginx /recruit-covers/share/（须 alias 到 merchant-erp/dist，勿仅用 fulfillment/public）
# 用法：cd ~/app && git pull gitee main && bash scripts/ecs-sync-mp-share-cover.sh
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
SRC="$ROOT/灵祺达人撮合小程序/images/share/share-cover-ai-match.jpg"
PUBLIC_DIR="$ROOT/灵祺达人履约管理后台/public/recruit-covers/share"
DIST_DIR="$ROOT/web版/merchant-erp/dist/recruit-covers/share"
NGINX_SITE="/etc/nginx/sites-available/meoo-api"

if [[ ! -f "$SRC" ]]; then
  echo "FAIL: 缺少 $SRC"
  exit 1
fi

install_cover() {
  local dir="$1"
  mkdir -p "$dir"
  cp -f "$SRC" "$dir/share-cover-ai-match.jpg"
  chmod 755 "$dir" "$(dirname "$dir")" 2>/dev/null || true
  chmod 644 "$dir/share-cover-ai-match.jpg"
}

install_cover "$PUBLIC_DIR"
install_cover "$DIST_DIR"
echo "OK: public  $PUBLIC_DIR/share-cover-ai-match.jpg"
echo "OK: dist    $DIST_DIR/share-cover-ai-match.jpg"

if [[ -f "$ROOT/scripts/ecs-meoo-api.nginx.conf" ]]; then
  if [[ -w "$NGINX_SITE" ]] || sudo -n true 2>/dev/null; then
    sudo cp "$ROOT/scripts/ecs-meoo-api.nginx.conf" "$NGINX_SITE"
    sudo nginx -t
    sudo systemctl reload nginx
    echo "OK: nginx 已 reload（recruit-covers → dist alias）"
  else
    echo "WARN: 请手动执行: sudo cp ~/app/scripts/ecs-meoo-api.nginx.conf $NGINX_SITE && sudo nginx -t && sudo systemctl reload nginx"
  fi
fi

echo "==> 自测"
CODE="$(curl -sS -o /dev/null -w '%{http_code}' https://mofangdianai.com/recruit-covers/share/share-cover-ai-match.jpg || echo 000)"
echo "HTTPS $CODE (期望 200)"
if [[ "$CODE" != "200" ]]; then
  echo "若仍 403：确认 dist 目录 www-data 可读，或执行 bash scripts/ecs-apply-root-domain-nginx.sh"
  exit 1
fi
