#!/usr/bin/env bash
# 根治微信小程序登录 ERR_CONNECTION_RESET：Nginx Cronet TLS + auth-api + GET wx_login 探活
# ECS（admin）: cd ~/app && bash scripts/ecs-fix-mp-wechat-login.sh

set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"

echo "== 1) 同步 Nginx（无 http2 / TLS1.2 / erp-api） =="
sudo cp "$ROOT/scripts/ecs-meoo-api.nginx.conf" /etc/nginx/sites-available/meoo-api
sudo ln -sf /etc/nginx/sites-available/meoo-api /etc/nginx/sites-enabled/meoo-api
sudo rm -f /etc/nginx/sites-enabled/default 2>/dev/null || true
sudo bash "$ROOT/scripts/ecs-fix-wechat-cronet-tls.sh"

echo "== 2) auth-api =="
bash "$ROOT/scripts/ecs-fix-erp-api-502.sh"

echo "== 3) GET wx_login 路由（勿用 POST，微信 Cronet 易 reset） =="
CODE="probe_$(date +%s)"
URL="https://mofangdianai.com/erp-api/meoo-ops-mp-auth?action=wx_login&code=${CODE}&role=talent"
HTTP="$(curl -sS -o /tmp/mp-wx-login-probe.json -w "%{http_code}" -m 20 --http1.1 "$URL" || echo 000)"
echo "GET wx_login http=${HTTP}"
head -c 200 /tmp/mp-wx-login-probe.json 2>/dev/null || true
echo

if [[ "$HTTP" == "000" ]]; then
  echo "FAIL: 公网 GET 仍失败。检查安全组 443、证书、勿双开面板 Nginx。"
  exit 1
fi

if [[ "$HTTP" != "200" && "$HTTP" != "400" && "$HTTP" != "503" ]]; then
  echo "WARN: 期望 200/400/503（400/503 表示路由已通，仅微信 code 无效）"
fi

echo "OK: 请在微信开发者工具上传体验版（mp-wx-login-get），真机删小程序后重扫。"
