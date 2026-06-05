#!/usr/bin/env bash
# 新 ECS：为履约域名签发/安装 TLS（默认 dr.mofangdianai.com）
# 用法（root）:
#   sudo bash scripts/ecs-setup-ssl-fulfillment-domain.sh
#   sudo bash scripts/ecs-setup-ssl-fulfillment-domain.sh dr.mofangdianai.com

set -euo pipefail

DOMAIN="${1:-dr.mofangdianai.com}"
SSL_DIR="/etc/nginx/ssl/${DOMAIN}"
WEBROOT="/var/www/certbot"
DHPARAM="/etc/letsencrypt/ssl-dhparams.pem"

if [[ "$(id -un)" != "root" ]]; then
  echo "请 root 执行: sudo bash $0 ${DOMAIN}"
  exit 1
fi

apt-get update -qq
apt-get install -y -qq certbot 2>/dev/null || true
mkdir -p "$WEBROOT" "$SSL_DIR"

if [[ ! -f "$DHPARAM" ]]; then
  openssl dhparam -out "$DHPARAM" 2048
fi

if [[ ! -f "${SSL_DIR}/fullchain.pem" ]]; then
  certbot certonly --webroot -w "$WEBROOT" -d "$DOMAIN" \
    --non-interactive --agree-tos --register-unsafely-without-email \
    || certbot certonly --standalone -d "$DOMAIN" \
    --non-interactive --agree-tos --register-unsafely-without-email
  cp "/etc/letsencrypt/live/${DOMAIN}/fullchain.pem" "${SSL_DIR}/fullchain.pem"
  cp "/etc/letsencrypt/live/${DOMAIN}/privkey.pem" "${SSL_DIR}/privkey.pem"
  chmod 644 "${SSL_DIR}/fullchain.pem"
  chmod 600 "${SSL_DIR}/privkey.pem"
fi

echo "OK: ${SSL_DIR}/fullchain.pem"
echo "下一步: FULFILLMENT_DOMAIN=${DOMAIN} MEOO_API_UPSTREAM=https://mofangdianai.com bash ~/app/scripts/ecs-deploy-talent-fulfillment-web.sh"
