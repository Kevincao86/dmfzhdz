#!/usr/bin/env bash
# 根治微信小程序 ERR_CONNECTION_RESET + 登录/私信 503
# ECS（admin）: cd ~/app && bash scripts/ecs-fix-mp-wechat-login.sh

set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"

echo "== 1) Nginx（无 http2 / TLS1.2 / api 子域 + 根域 erp-api） =="
sudo cp "$ROOT/scripts/ecs-meoo-api.nginx.conf" /etc/nginx/sites-available/meoo-api
sudo ln -sf /etc/nginx/sites-available/meoo-api /etc/nginx/sites-enabled/meoo-api
sudo rm -f /etc/nginx/sites-enabled/default 2>/dev/null || true
sudo bash "$ROOT/scripts/ecs-fix-wechat-cronet-tls.sh"

echo "== 2) auth-api + Supabase（登录/私信依赖 SUPABASE_*） =="
bash "$ROOT/scripts/ecs-fix-mp-chat-ecs.sh" || bash "$ROOT/scripts/ecs-fix-erp-api-502.sh"

echo "== 3) 公网探活（api 子域优先） =="
for HOST in api.mofangdianai.com mofangdianai.com; do
  echo "--- $HOST ---"
  curl -sS -m 12 --http1.1 "https://${HOST}/erp-api/meoo-erp-api-health" | head -c 120 || echo "FAIL health"
  echo
  CODE="probe_$(date +%s)"
  URL="https://${HOST}/erp-api/meoo-ops-mp-auth?action=wx_login&code=${CODE}&role=talent"
  HTTP="$(curl -sS -o /tmp/mp-wx-login-probe.json -w "%{http_code}" -m 20 --http1.1 "$URL" || echo 000)"
  echo "GET wx_login http=${HTTP}"
  head -c 200 /tmp/mp-wx-login-probe.json 2>/dev/null || true
  echo
done

echo "== 4) 微信后台检查清单 =="
echo "  request 合法域名: https://api.mofangdianai.com 与 https://mofangdianai.com"
echo "  downloadFile 合法域名: 同上（登录 GET 不再走 download，但大厅等可能用到）"
echo "  DNS: api.mofangdianai.com A 记录 → 与本机公网 IP 相同"
echo "  小程序 config.release: MERCHANT_API_BASE_URL=https://api.mofangdianai.com/erp-api"
echo "  体验版构建号: mp-20260603-api-cronet"
echo "OK"
