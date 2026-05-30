#!/usr/bin/env bash
# ECS 内部统一 Supabase 兼容入口（GoTrue + PostgREST），供本机 Auth API 使用
# 用法：sudo bash scripts/ecs-setup-internal-api-proxy.sh

set -euo pipefail

CONF="/etc/nginx/sites-available/meoo-internal-api"
if [[ ! -f /etc/nginx/sites-available/meoo-api ]]; then
  echo "未找到 meoo-api，请先完成 mofangdianai.com 的 Nginx 配置"
  exit 1
fi

sudo tee "$CONF" >/dev/null <<'EOF'
server {
    listen 127.0.0.1:8888;
    server_name localhost;

    location /auth/v1/ {
        proxy_pass http://127.0.0.1:9999/;
        proxy_set_header Host $host;
    }

    location /rest/v1/ {
        proxy_pass http://127.0.0.1:3000/;
        proxy_set_header Host $host;
    }
}
EOF

sudo ln -sf "$CONF" /etc/nginx/sites-enabled/meoo-internal-api
sudo nginx -t
sudo systemctl reload nginx
echo "OK: http://127.0.0.1:8888/auth/v1/health 与 /rest/v1/ 已可用"
