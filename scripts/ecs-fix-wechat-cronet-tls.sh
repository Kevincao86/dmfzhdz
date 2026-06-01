#!/usr/bin/env bash
# 浏览器/Safari 能开 JSON，微信仍 ERR_CONNECTION_RESET 时用（仅 Nginx TLS，不动商家 Web）
# ECS: sudo bash -c "$(curl -fsSL https://gitee.com/linqierp/linqierp/raw/main/scripts/ecs-fix-wechat-cronet-tls.sh)" 2>/dev/null \
#   || sudo bash ~/app/scripts/ecs-fix-wechat-cronet-tls.sh
set -euo pipefail

SITE="/etc/nginx/sites-available/meoo-api"
SSL="/etc/nginx/ssl/mofangdianai.com"

echo "== 1) 证书链（微信比 Chrome 更严，须 fullchain 含中间证书） =="
if [[ ! -f "${SSL}/fullchain.pem" ]]; then
  echo "缺少 ${SSL}/fullchain.pem"
  if [[ -f /tmp/mofangdianai.com.pem ]]; then
    sudo mkdir -p "$SSL"
    sudo cp /tmp/mofangdianai.com.pem "${SSL}/fullchain.pem"
    sudo cp /tmp/mofangdianai.com.key "${SSL}/privkey.pem"
    echo "已从 /tmp 复制证书"
  else
    exit 1
  fi
fi
echo | openssl s_client -connect 127.0.0.1:443 -servername mofangdianai.com 2>/dev/null \
  | openssl x509 -noout -subject -issuer -dates || true

echo "== 2) 关 http2、仅 TLS1.2、关 session tickets（微信 Cronet 兼容） =="
sudo cp "$SITE" "${SITE}.bak.cronet.$(date +%Y%m%d%H%M%S)"
sudo sed -i -E 's/listen ([0-9]+) ssl http2/listen \1 ssl/g' "$SITE"
sudo sed -i -E 's/listen ([0-9]+) http2/listen \1/g' "$SITE"
sudo sed -i 's/ssl_protocols.*/    ssl_protocols TLSv1.2;/' "$SITE"
sudo grep -q ssl_session_tickets "$SITE" || sudo sed -i '/ssl_protocols/a\    ssl_session_tickets off;' "$SITE"
sudo sed -i "s|ssl_certificate .*fullchain.pem|ssl_certificate ${SSL}/fullchain.pem|g" "$SITE"
sudo sed -i "s|ssl_certificate_key .*privkey.pem|ssl_certificate_key ${SSL}/privkey.pem|g" "$SITE"

echo "== 3) 重载 Nginx =="
sudo nginx -t
sudo systemctl reload nginx

echo "== 4) 探活 =="
curl -sS -m 15 "https://mofangdianai.com/erp-api/meoo-erp-api-health" | head -c 160
echo
curl -sS -o /dev/null -w "hall-registry: %{http_code} bytes=%{size_download}\n" -m 20 \
  "https://mofangdianai.com/erp-api/meoo-ops-mp-hall-registry" 2>/dev/null || \
  echo "hall-registry: 404（需 git pull 后 bash scripts/ecs-fix-erp-api-502.sh）"
echo "OK: 完成后执行 bash ~/app/scripts/ecs-fix-erp-api-502.sh 并上传小程序体验版。"
