#!/usr/bin/env bash
# 修复外网 / 微信小程序 ERR_CONNECTION_RESET（TLS 握手被 reset）
# 仅改 Nginx 443 与证书，不动商家 Vercel、不改 meoo-auth-api 业务代码。
#
# ECS Workbench:
#   cd ~/app && git pull
#   sudo bash scripts/ecs-fix-wechat-https-443.sh
#
set -euo pipefail

DOMAIN="${1:-mofangdianai.com}"
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
NGINX_SITE="/etc/nginx/sites-available/meoo-api"
HEALTH="https://${DOMAIN}/erp-api/meoo-erp-api-health"
SSL_DIR="/etc/nginx/ssl/${DOMAIN}"
ALI_PEM="/tmp/${DOMAIN}.pem"
ALI_KEY="/tmp/${DOMAIN}.key"

echo "== 0) 谁在监听 443（只能有一个 HTTPS 入口） =="
sudo ss -tlnp | grep -E ':443\b' || true
if sudo ss -tlnp | grep -E ':443\b' | grep -v nginx | grep -q .; then
  echo "WARN: 除 nginx 外还有进程占用 443。请在轻量控制台关闭「一键 HTTPS」/ 面板自带 SSL，只保留 Nginx。"
fi

echo "== 1) 部署 meoo-api 站点配置 =="
if [[ ! -f "$ROOT/scripts/ecs-meoo-api.nginx.conf" ]]; then
  echo "缺少 $ROOT/scripts/ecs-meoo-api.nginx.conf"
  exit 1
fi
sudo cp "$NGINX_SITE" "${NGINX_SITE}.bak.$(date +%Y%m%d%H%M%S)" 2>/dev/null || true
sudo cp "$ROOT/scripts/ecs-meoo-api.nginx.conf" "$NGINX_SITE"
sudo ln -sf "$NGINX_SITE" /etc/nginx/sites-enabled/meoo-api
sudo rm -f /etc/nginx/sites-enabled/default 2>/dev/null || true

echo "== 2) 证书（优先阿里云上传的 PEM，其次 Let's Encrypt） =="
sudo mkdir -p "$SSL_DIR"
if [[ -f "$ALI_PEM" && -f "$ALI_KEY" ]]; then
  sudo cp "$ALI_PEM" "$SSL_DIR/fullchain.pem"
  sudo cp "$ALI_KEY" "$SSL_DIR/privkey.pem"
  echo "已使用 $ALI_PEM"
elif [[ -f "${SSL_DIR}/fullchain.pem" && -f "${SSL_DIR}/privkey.pem" ]]; then
  echo "已存在 ${SSL_DIR}"
elif [[ -f "/etc/letsencrypt/live/${DOMAIN}/fullchain.pem" ]]; then
  sudo cp "/etc/letsencrypt/live/${DOMAIN}/fullchain.pem" "$SSL_DIR/fullchain.pem"
  sudo cp "/etc/letsencrypt/live/${DOMAIN}/privkey.pem" "$SSL_DIR/privkey.pem"
elif [[ -f "/etc/letsencrypt/live/api.${DOMAIN}/fullchain.pem" ]]; then
  sudo cp "/etc/letsencrypt/live/api.${DOMAIN}/fullchain.pem" "$SSL_DIR/fullchain.pem"
  sudo cp "/etc/letsencrypt/live/api.${DOMAIN}/privkey.pem" "$SSL_DIR/privkey.pem"
else
  echo "FAIL: 未找到证书。请上传 ${ALI_PEM} / ${ALI_KEY} 或签发 Let's Encrypt。"
  exit 1
fi
sudo chmod 644 "$SSL_DIR/fullchain.pem"
sudo chmod 600 "$SSL_DIR/privkey.pem"

# 将 nginx 配置里的证书路径统一为阿里云目录（避免仍指向过期 api.* 证书）
sudo sed -i.bak-cert \
  -e "s|ssl_certificate .*fullchain.pem|ssl_certificate ${SSL_DIR}/fullchain.pem|g" \
  -e "s|ssl_certificate_key .*privkey.pem|ssl_certificate_key ${SSL_DIR}/privkey.pem|g" \
  "$NGINX_SITE"

# 微信 Cronet 对 nginx http2 常握手 reset；浏览器 Chrome 仍可能正常
sudo sed -i.bak-http2 -E 's/listen ([0-9]+) ssl http2/listen \1 ssl/g' "$NGINX_SITE" 2>/dev/null || true
sudo sed -i.bak-http2b -E 's/listen ([0-9]+) http2/listen \1/g' "$NGINX_SITE" 2>/dev/null || true

# 微信 / iOS 兼容：TLS1.2+ 常见套件（避免仅 TLS1.3 或异常 cipher 导致握手 reset）
if ! grep -q 'ssl_ciphers' "$NGINX_SITE"; then
  sudo sed -i.bak-cipher \
    '/ssl_protocols TLSv1.2 TLSv1.3;/a\
    ssl_ciphers ECDHE-ECDSA-AES128-GCM-SHA256:ECDHE-RSA-AES128-GCM-SHA256:ECDHE-ECDSA-AES256-GCM-SHA384:ECDHE-RSA-AES256-GCM-SHA384:ECDHE-RSA-AES128-SHA256:ECDHE-RSA-AES256-SHA384:AES128-GCM-SHA256:AES256-GCM-SHA384;\
    ssl_prefer_server_ciphers on;' \
    "$NGINX_SITE"
fi

echo "== 3) 校验并重载 Nginx =="
sudo nginx -t
sudo systemctl reload nginx

echo "== 4) 本机 SNI =="
echo | openssl s_client -connect "127.0.0.1:443" -servername "$DOMAIN" 2>/dev/null \
  | openssl x509 -noout -subject -dates 2>/dev/null || echo "WARN: 本机 SNI 失败"

echo "== 5) 公网 health（必须在 ECS 上也能通，不能只测 127.0.0.1） =="
if OUT="$(curl -sS -m 20 "$HEALTH" 2>&1)"; then
  echo "$OUT" | head -c 200
  echo
  echo "OK: 公网 HTTPS 已通。请手机 Safari 打开同一 URL，再测体验版小程序。"
else
  echo "$OUT"
  echo
  echo "仍失败。请检查："
  echo "  1) 轻量防火墙模板已绑定本实例，入站 443 对 0.0.0.0/0"
  echo "  2) dig +short ${DOMAIN} 必须等于本机公网 IP"
  echo "  3) 控制台勿与 Nginx 同时占用 443（关闭一键 HTTPS）"
  exit 1
fi
