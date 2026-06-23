#!/usr/bin/env bash
# 产品介绍动态演示站 · sysc.mofangdianai.com（新 ECS 纯静态）
#
# 前置：DNS sysc → 新 ECS 公网 IP；TLS 证书
#   sudo bash scripts/ecs-setup-ssl-fulfillment-domain.sh sysc.mofangdianai.com
#
# 新 ECS admin:
#   cd ~/app && git pull && bash scripts/ecs-deploy-sysc-product-deck-web.sh
#
# 本机预览（无需部署）:
#   bash scripts/preview-sysc-product-deck.sh

set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
# shellcheck source=ecs-resolve-admin-home.sh
source "$ROOT/scripts/ecs-resolve-admin-home.sh"

DECK_SRC="$ROOT/docs/灵祺商家ERP"
DECK_DST="${SYSC_DECK_DIST:-/var/www/meoo-sysc-product-deck}"
SYSC_DOMAIN="${SYSC_DOMAIN:-sysc.mofangdianai.com}"
NGINX_TEMPLATE="$ROOT/scripts/ecs-nginx-sysc-product-deck.conf"
NGINX_SITE="/etc/nginx/sites-available/meoo-sysc-product-deck"

if [[ "$(id -un)" == "root" && "${HOME:-}" == "/root" ]]; then
  echo "请用 admin 执行: su - admin -c 'cd ~/app && bash scripts/ecs-deploy-sysc-product-deck-web.sh'"
  exit 1
fi

echo "== 0) 拉代码 =="
if [[ -f "$ROOT/scripts/ecs-git-pull-gitee.sh" ]]; then
  bash "$ROOT/scripts/ecs-git-pull-gitee.sh"
elif [[ -d "$ROOT/.git" ]]; then
  (cd "$ROOT" && git pull --ff-only) || (cd "$ROOT" && git pull)
fi

if [[ ! -f "$DECK_SRC/index.html" ]]; then
  echo "FAIL: 缺少 $DECK_SRC/index.html"
  exit 1
fi

echo "== 1) 同步静态文件 → $DECK_DST =="
sudo mkdir -p "$DECK_DST"
sudo rsync -a --delete \
  --exclude '.DS_Store' \
  "$DECK_SRC/" "$DECK_DST/"
echo "OK: $(du -sh "$DECK_DST" | awk '{print $1}')"

echo "== 2) Nginx =="
if [[ ! -f "$NGINX_TEMPLATE" ]]; then
  echo "缺少 $NGINX_TEMPLATE"
  exit 1
fi

SSL_DIR="${SYSC_SSL_DIR:-/etc/nginx/ssl/${SYSC_DOMAIN}}"
if [[ ! -f "${SSL_DIR}/fullchain.pem" ]]; then
  SSL_DIR="/etc/nginx/ssl/mofangdianai.com"
fi
SSL_CERT="${SSL_DIR}/fullchain.pem"
SSL_KEY="${SSL_DIR}/privkey.pem"
SSL_DHPARAM="/etc/letsencrypt/ssl-dhparams.pem"
if [[ ! -f "$SSL_DHPARAM" ]]; then
  SSL_DHPARAM="/dev/null"
fi
if [[ ! -f "$SSL_CERT" ]]; then
  echo "缺少 TLS: ${SSL_CERT}"
  echo "请先: sudo bash scripts/ecs-setup-ssl-fulfillment-domain.sh ${SYSC_DOMAIN}"
  exit 1
fi

TMP_NGINX="$(mktemp)"
sed \
  -e "s|__SYSC_DIST__|${DECK_DST}|g" \
  -e "s|__SYSC_SERVER_NAMES__|${SYSC_DOMAIN}|g" \
  -e "s|__SYSC_SERVER_NAMES_80__|${SYSC_DOMAIN}|g" \
  -e "s|__SSL_CERT__|${SSL_CERT}|g" \
  -e "s|__SSL_KEY__|${SSL_KEY}|g" \
  -e "s|__SSL_DHPARAM__|${SSL_DHPARAM}|g" \
  "$NGINX_TEMPLATE" >"$TMP_NGINX"

sudo cp "$TMP_NGINX" "$NGINX_SITE"
rm -f "$TMP_NGINX"
sudo ln -sf "$NGINX_SITE" /etc/nginx/sites-enabled/meoo-sysc-product-deck
sudo nginx -t
sudo systemctl reload nginx

echo ""
echo "完成: https://${SYSC_DOMAIN}/"
echo "  动态演示（键盘 ← → / 空格翻页，O 目录，F 全屏）"
echo "  长页滚动版: https://${SYSC_DOMAIN}/?scroll=1"
