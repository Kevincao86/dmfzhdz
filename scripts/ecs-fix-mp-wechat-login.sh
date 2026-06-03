#!/usr/bin/env bash
# 根治微信小程序 ERR_CONNECTION_RESET（仅根域 mofangdianai.com，不用 api 子域）
# ECS（admin）: cd ~/app && bash scripts/ecs-fix-mp-wechat-login.sh

set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
DOMAIN="${1:-mofangdianai.com}"

echo "== 1) Nginx 根域（无 http2 / TLS1.2 / erp-api） =="
sudo cp "$ROOT/scripts/ecs-meoo-api.nginx.conf" /etc/nginx/sites-available/meoo-api
sudo ln -sf /etc/nginx/sites-available/meoo-api /etc/nginx/sites-enabled/meoo-api
sudo rm -f /etc/nginx/sites-enabled/default 2>/dev/null || true
sudo bash "$ROOT/scripts/ecs-fix-wechat-cronet-tls.sh" "$DOMAIN"

echo "== 2) 443 仅 Nginx 监听 =="
sudo ss -tlnp | grep ':443' || true

echo "== 3) auth-api + Supabase（登录/私信） =="
bash "$ROOT/scripts/ecs-fix-mp-chat-ecs.sh" || bash "$ROOT/scripts/ecs-fix-erp-api-502.sh"

echo "== 4) 公网探活（根域 ${DOMAIN}） =="
curl -sS -m 12 --http1.1 "https://${DOMAIN}/erp-api/meoo-erp-api-health" | head -c 140 || echo "FAIL health"
echo
CODE="probe_$(date +%s)"
URL="https://${DOMAIN}/erp-api/meoo-ops-mp-auth?action=wx_login&code=${CODE}&role=talent"
HTTP="$(curl -sS -o /tmp/mp-wx-login-probe.json -w "%{http_code}" -m 20 --http1.1 "$URL" || echo 000)"
echo "GET wx_login http=${HTTP} (400/503=路由通，invalid code 正常)"
head -c 200 /tmp/mp-wx-login-probe.json 2>/dev/null || true
echo

if [[ "$HTTP" == "000" ]]; then
  echo "FAIL: 公网 HTTPS 不通。检查安全组 443、证书 fullchain、轻量面板勿占 443。"
  exit 1
fi

echo "== 5) 微信后台（仅根域） =="
echo "  request 合法域名: https://${DOMAIN}"
echo "  downloadFile 合法域名: https://${DOMAIN}"
echo "  小程序 MERCHANT_API_BASE_URL=https://${DOMAIN}/erp-api"
echo "  体验版构建号: mp-20260603-root-get-login"
echo "OK"
