#!/usr/bin/env bash
# 根治微信小程序 ERR_CONNECTION_RESET（仅根域 mofangdianai.com，不用 api 子域）
# ECS（admin）: cd ~/app && bash scripts/ecs-fix-mp-wechat-login.sh

set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
DOMAIN="${1:-mofangdianai.com}"

echo "== 1) 443 握手 + Nginx + auth-api =="
bash "$ROOT/scripts/ecs-fix-mp-443-handshake-definitive.sh" "$DOMAIN"

echo "== 2) 443 仅 Nginx 监听 =="
sudo ss -tlnp | grep ':443' || true

echo "== 3) auth-api + Supabase（登录/私信） =="
bash "$ROOT/scripts/ecs-fix-mp-chat-ecs.sh" || bash "$ROOT/scripts/ecs-fix-erp-api-502.sh"

echo "== 4) 公网探活（根域 ${DOMAIN}） =="
curl -sS -m 12 --http1.1 "https://${DOMAIN}/erp-api/meoo-erp-api-health" | head -c 140 || echo "FAIL health"
echo
CODE="probe_$(date +%s)"
HTTP="$(node -e "
const https=require('https');
const data=JSON.stringify({action:'wx_login',code:'${CODE}',role:'talent'});
const o={host:'${DOMAIN}',port:443,path:'/erp-api/meoo-ops-mp-auth',method:'POST',servername:'${DOMAIN}',timeout:20000,headers:{Host:'${DOMAIN}','Content-Type':'application/json','Content-Length':Buffer.byteLength(data)}};
const r=https.request(o,res=>process.exit(res.statusCode>=400&&res.statusCode<600?0:1));
r.on('error',()=>process.exit(1));r.write(data);r.end();
" && echo 400 || echo 000)"
echo "POST wx_login probe http=${HTTP} (4xx/5xx=路由通，invalid code 正常)"
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
echo "  体验版构建号: mp-20260606-tls13-post（登录 POST JSON，勿超长 GET）"
echo "  若仍 reset：删除域名 AAAA 记录；iPhone Safari 打开 https://${DOMAIN}/erp-api/mp-cronet-ping"
echo "OK"
