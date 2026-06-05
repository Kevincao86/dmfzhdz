#!/usr/bin/env bash
# 新 ECS：为履约域名签发 TLS（默认 dr.mofangdianai.com）
# Nginx 已占 80 时：先装 ACME 专用 server，再 webroot 签发（勿 standalone 抢 80）
#
# 用法（root）:
#   bash /home/admin/app/scripts/ecs-setup-ssl-fulfillment-domain.sh dr.mofangdianai.com

set -euo pipefail

DOMAIN="${1:-dr.mofangdianai.com}"
SSL_DIR="/etc/nginx/ssl/${DOMAIN}"
WEBROOT="/var/www/certbot"
DHPARAM="/etc/letsencrypt/ssl-dhparams.pem"
ACME_SITE="/etc/nginx/sites-available/meoo-acme-${DOMAIN}"

if [[ "$(id -un)" != "root" ]]; then
  echo "请 root 执行: bash $0 ${DOMAIN}"
  exit 1
fi

if [[ -f "${SSL_DIR}/fullchain.pem" && -f "${SSL_DIR}/privkey.pem" ]]; then
  echo "OK: 证书已存在 ${SSL_DIR}/fullchain.pem"
  exit 0
fi

apt-get update -qq
apt-get install -y -qq certbot nginx dnsutils curl 2>/dev/null || true
mkdir -p "$WEBROOT" "$SSL_DIR"
chmod 755 /var/www /var/www/certbot 2>/dev/null || true

if [[ ! -f "$DHPARAM" ]]; then
  mkdir -p /etc/letsencrypt
  openssl dhparam -out "$DHPARAM" 2048
fi

echo "== 1) DNS 检查 =="
RESOLVED="$(dig +short "$DOMAIN" A 2>/dev/null | tail -1 | tr -d ' ')"
PUBLIC_IP="$(curl -fsS --max-time 8 https://api.ipify.org 2>/dev/null || curl -fsS --max-time 8 http://api.ipify.org 2>/dev/null || true)"
echo "  ${DOMAIN} → ${RESOLVED:-（无 A 记录）}"
echo "  本机公网 IP → ${PUBLIC_IP:-未知}"
if [[ -n "$RESOLVED" && -n "$PUBLIC_IP" && "$RESOLVED" != "$PUBLIC_IP" ]]; then
  echo ""
  echo "WARN: DNS 未指向本机！请把 dr 的 A 记录改为 ${PUBLIC_IP}（当前解析为 ${RESOLVED}）"
  echo "      阿里云 ECS → 安全组须放行入站 TCP 80、443"
  echo ""
fi

echo "== 2) Nginx ACME 放行（80 端口） =="
mkdir -p "${WEBROOT}/.well-known/acme-challenge"
chmod -R 755 /var/www /var/www/certbot "${WEBROOT}" 2>/dev/null || true
# 默认站点常抢走 80 并导致 acme-challenge 403
rm -f /etc/nginx/sites-enabled/default 2>/dev/null || true

cat >"$ACME_SITE" <<NGX
server {
    listen 80 default_server;
    listen [::]:80 default_server;
    server_name ${DOMAIN};

    location ^~ /.well-known/acme-challenge/ {
        root ${WEBROOT};
        default_type "text/plain";
        allow all;
    }

    location / {
        return 200 'acme-pending';
        add_header Content-Type text/plain;
    }
}
NGX
ln -sf "$ACME_SITE" "/etc/nginx/sites-enabled/meoo-acme-${DOMAIN}"
nginx -t
systemctl reload nginx

echo "== 3) 本机 ACME 路径自测 =="
TEST_FILE="ping-$(date +%s).txt"
ACME_DIR="${WEBROOT}/.well-known/acme-challenge"
mkdir -p "$ACME_DIR"
echo ok >"${ACME_DIR}/${TEST_FILE}"
LOCAL_CODE="$(curl -sS -o /dev/null -w '%{http_code}' --max-time 5 "http://127.0.0.1/.well-known/acme-challenge/${TEST_FILE}" -H "Host: ${DOMAIN}" || echo 000)"
PUBLIC_CODE="$(curl -sS -o /dev/null -w '%{http_code}' --max-time 15 "http://${DOMAIN}/.well-known/acme-challenge/${TEST_FILE}" || echo 000)"
rm -f "${WEBROOT}/.well-known/acme-challenge/${TEST_FILE}"
echo "  127.0.0.1 ACME HTTP ${LOCAL_CODE}（期望 200）"
echo "  公网 ${DOMAIN} ACME HTTP ${PUBLIC_CODE}（期望 200）"
if [[ "$LOCAL_CODE" != "200" || "$PUBLIC_CODE" != "200" ]]; then
  echo "FAIL: ACME 路径未通（403 多为 default 站点抢占 80，已尝试移除 sites-enabled/default）"
  exit 1
fi

echo "== 4) certbot webroot 签发 =="
certbot certonly --webroot -w "$WEBROOT" -d "$DOMAIN" \
  --non-interactive --agree-tos --register-unsafely-without-email \
  --preferred-challenges http

cp "/etc/letsencrypt/live/${DOMAIN}/fullchain.pem" "${SSL_DIR}/fullchain.pem"
cp "/etc/letsencrypt/live/${DOMAIN}/privkey.pem" "${SSL_DIR}/privkey.pem"
chmod 644 "${SSL_DIR}/fullchain.pem"
chmod 600 "${SSL_DIR}/privkey.pem"

echo "OK: ${SSL_DIR}/fullchain.pem"
echo "下一步（admin）:"
echo "  cd ~/app && SKIP_BUILD=1 MEOO_API_UPSTREAM=https://mofangdianai.com bash scripts/ecs-deploy-talent-fulfillment-web.sh"
