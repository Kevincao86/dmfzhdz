#!/usr/bin/env bash
# 一键部署根域 Nginx（mofangdianai.com）
# ECS: bash ~/app/scripts/ecs-apply-root-domain-nginx.sh

set -euo pipefail

SRC="${HOME}/app/scripts/ecs-meoo-api.nginx.conf"
DST="/etc/nginx/sites-available/meoo-api"

if [[ ! -f "$SRC" ]]; then
  echo "找不到 $SRC，请先 git pull"
  exit 1
fi

sudo cp "$DST" "${DST}.bak.$(date +%Y%m%d%H%M%S)" 2>/dev/null || true
sudo cp "$SRC" "$DST"
sudo ln -sf "$DST" /etc/nginx/sites-enabled/meoo-api

if [[ ! -f /etc/letsencrypt/live/mofangdianai.com/fullchain.pem ]]; then
  echo "尚未签发 mofangdianai.com 证书，执行："
  echo "  sudo certbot certonly --nginx -d mofangdianai.com"
  echo "若 api 子域也要 301，追加：-d api.mofangdianai.com"
  exit 1
fi

sudo nginx -t
sudo systemctl reload nginx

echo "验证："
curl -sS "https://mofangdianai.com/health" || true
echo ""
curl -sSI -X OPTIONS "https://mofangdianai.com/rest/v1/support_relay_messages" \
  -H "Origin: https://cs.mofangdianai.com" \
  -H "Access-Control-Request-Method: POST" \
  -H "Access-Control-Request-Headers: authorization,apikey,content-type" \
  | grep -i access-control || true
