#!/usr/bin/env bash
# 修复外网 HTTPS 握手被 reset（SSL Labs / 手机微信 ERR_CONNECTION_RESET）
# ECS: cd ~/app && git pull && sudo bash scripts/ecs-fix-https-reset.sh

set -euo pipefail

DOMAIN="${1:-mofangdianai.com}"
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
NGINX_SITE="/etc/nginx/sites-available/meoo-api"
HEALTH="https://${DOMAIN}/erp-api/meoo-erp-api-health"

echo "== 1) 谁在监听 443 =="
sudo ss -tlnp | grep -E ':443\b' || true

echo "== 2) 备份并重写 meoo-api（含 TLSv1.2/1.3 + erp-api） =="
if [[ -f "$ROOT/scripts/ecs-meoo-api.nginx.conf" ]]; then
  sudo cp "$NGINX_SITE" "${NGINX_SITE}.bak.$(date +%Y%m%d%H%M%S)" 2>/dev/null || true
  sudo cp "$ROOT/scripts/ecs-meoo-api.nginx.conf" "$NGINX_SITE"
else
  echo "缺少 $ROOT/scripts/ecs-meoo-api.nginx.conf"
  exit 1
fi

if [[ ! -L /etc/nginx/sites-enabled/meoo-api ]]; then
  sudo ln -sf "$NGINX_SITE" /etc/nginx/sites-enabled/meoo-api
fi
sudo rm -f /etc/nginx/sites-enabled/default 2>/dev/null || true

echo "== 3) 证书（Nginx 需要 ${DOMAIN} 的 fullchain，不能只有 api 子域） =="
CERT_DIR="/etc/letsencrypt/live/${DOMAIN}"
if [[ ! -f "${CERT_DIR}/fullchain.pem" ]]; then
  echo "未找到 ${CERT_DIR}/fullchain.pem（常见：仅有 api.${DOMAIN} 证书）"
  echo "申请根域证书（含 api 子域）…"
  sudo certbot certonly --nginx \
    -d "$DOMAIN" \
    -d "api.${DOMAIN}" \
    --non-interactive --agree-tos --register-unsafely-without-email \
    2>/dev/null || {
    echo "nginx 模式失败，尝试 standalone（将短暂停 nginx）…"
    sudo systemctl stop nginx
    sudo certbot certonly --standalone \
      -d "$DOMAIN" \
      -d "api.${DOMAIN}" \
      --non-interactive --agree-tos --register-unsafely-without-email
    sudo systemctl start nginx
  }
fi
if [[ ! -f "${CERT_DIR}/fullchain.pem" ]]; then
  echo "FAIL: 仍无 ${CERT_DIR}/fullchain.pem"
  echo "请手动: sudo certbot certonly --nginx -d ${DOMAIN} -d api.${DOMAIN}"
  sudo ls -la /etc/letsencrypt/live/ 2>/dev/null || true
  exit 1
fi
sudo ls -la "${CERT_DIR}/"

echo "== 4) 校验配置并重载 =="
sudo nginx -t
sudo systemctl reload nginx

echo "== 5) 本机 SNI 探活 =="
echo | openssl s_client -connect "127.0.0.1:443" -servername "$DOMAIN" 2>/dev/null \
  | openssl x509 -noout -subject -dates 2>/dev/null || echo "WARN: 本机 SNI 无证书"

echo "== 6) 公网 health =="
if curl -sS -m 20 "$HEALTH" | head -c 120; then
  echo
  echo "OK: 外网 HTTPS 已通。请 iPhone Safari 再开同一 URL，然后测体验版小程序。"
else
  echo
  echo "仍失败。请检查："
  echo "  - 轻量控制台是否另开「一键 HTTPS」与 Nginx 抢 443（只保留一种）"
  echo "  - 防火墙入站 443 是否对 0.0.0.0/0 开放"
  echo "  - DNS 是否有错误 AAAA 记录（可先删除 IPv6）"
  exit 1
fi
