#!/usr/bin/env bash
# 备案通过后为新域名（如 mofangdian.com）增加 Nginx 443 + 证书
# ECS: sudo bash scripts/ecs-mp-add-domain.sh mofangdian.com

set -euo pipefail

NEW_DOMAIN="${1:-}"
if [[ -z "$NEW_DOMAIN" ]]; then
  echo "用法: sudo bash scripts/ecs-mp-add-domain.sh mofangdian.com"
  exit 1
fi

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
SITE="/etc/nginx/sites-available/meoo-api"
SSL="/etc/nginx/ssl/${NEW_DOMAIN}"

echo "== 1) 签发证书 ${NEW_DOMAIN} =="
sudo mkdir -p "$SSL"
if [[ ! -f "${SSL}/fullchain.pem" ]]; then
  sudo certbot certonly --nginx -d "$NEW_DOMAIN" --non-interactive --agree-tos --register-unsafely-without-email \
    || sudo certbot certonly --webroot -w /var/www/certbot -d "$NEW_DOMAIN" --non-interactive --agree-tos --register-unsafely-without-email
  sudo cp "/etc/letsencrypt/live/${NEW_DOMAIN}/fullchain.pem" "${SSL}/fullchain.pem"
  sudo cp "/etc/letsencrypt/live/${NEW_DOMAIN}/privkey.pem" "${SSL}/privkey.pem"
fi

echo "== 2) 追加 server 块（仅 /erp-api/） =="
if sudo grep -q "server_name ${NEW_DOMAIN}" "$SITE" 2>/dev/null; then
  echo "已存在 ${NEW_DOMAIN}，跳过"
else
  sudo tee -a "$SITE" >/dev/null <<NGX

# 备案域名 ${NEW_DOMAIN}（小程序直连）
server {
    server_name ${NEW_DOMAIN};

    location = /erp-api/mp-cronet-ping {
        default_type application/json;
        add_header Access-Control-Allow-Origin * always;
        return 200 '{"ok":true,"via":"nginx-${NEW_DOMAIN}"}';
    }

    location /erp-api/ {
        client_max_body_size 4m;
        gzip off;
        proxy_pass http://127.0.0.1:3001/api/;
        proxy_http_version 1.1;
        proxy_set_header Connection close;
        proxy_set_header Host \$host;
        proxy_set_header X-Real-IP \$remote_addr;
        proxy_set_header X-Forwarded-For \$proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto \$scheme;
    }

    listen 443 ssl;
    ssl_certificate ${SSL}/fullchain.pem;
    ssl_certificate_key ${SSL}/privkey.pem;
    ssl_protocols TLSv1.2 TLSv1.3;
    ssl_session_tickets off;
}
NGX
fi

sudo nginx -t && sudo systemctl reload nginx
echo "OK: https://${NEW_DOMAIN}/erp-api/mp-cronet-ping"
echo "小程序 config.release: MERCHANT_API_BASE_URL=https://${NEW_DOMAIN}/erp-api , MP_USE_CLOUD_PROXY=false"
