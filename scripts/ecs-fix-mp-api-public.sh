#!/usr/bin/env bash
# 小程序公网 API 一键修复：Nginx 443（微信 Cronet）+ auth-api 502 + 公网 health
# ECS Workbench:
#   cd ~/app && git pull && sudo bash scripts/ecs-fix-mp-api-public.sh

set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
DOMAIN="${1:-mofangdianai.com}"
HEALTH="https://${DOMAIN}/erp-api/meoo-erp-api-health"
HALL="https://${DOMAIN}/erp-api/meoo-ops-mp-hall-registry"

echo "== A) Nginx / TLS（微信 Cronet，勿 http2） =="
sudo bash "$ROOT/scripts/ecs-fix-wechat-https-443.sh" "$DOMAIN"

echo "== B) auth-api systemd / 502 =="
bash "$ROOT/scripts/ecs-fix-erp-api-502.sh"

echo "== C) 本机 erp-api =="
curl -sf "http://127.0.0.1:3001/api/meoo-erp-api-health" | head -c 160
echo

echo "== D) 公网 HTTPS（curl 可能因 LibreSSL/ALPN 误报 reset，以 Node 为准） =="
if curl -sS -m 20 --http1.1 "$HEALTH" 2>/dev/null | grep -q '"ok":true'; then
  echo "OK curl: $HEALTH"
else
  echo "WARN: curl 公网探活失败（常见）。用 Node 复测："
  node -e "
const https=require('https');
const ip='139.196.42.5';
https.get({host:ip,port:443,path:'/erp-api/meoo-erp-api-health',servername:'${DOMAIN}',rejectUnauthorized:false,headers:{Host:'${DOMAIN}'}},r=>{let d='';r.on('data',c=>d+=c);r.on('end',()=>{console.log('node',r.statusCode,d.slice(0,120));process.exit(r.statusCode===200?0:1);});}).on('error',e=>{console.error(e);process.exit(1);});
" || true
fi

echo "== E) 大厅 registry 抽样 =="
curl -sS -m 25 --http1.1 "$HALL" 2>/dev/null | head -c 200 || true
echo

echo "== F) DNS 建议（可选，减轻微信对根域 reset） =="
echo "  在域名控制台添加 A 记录: api.${DOMAIN} -> 与本机相同公网 IP"
echo "  微信 request 合法域名添加: https://api.${DOMAIN}"
echo "  小程序 config.release: MERCHANT_API_BASE_URL=https://api.${DOMAIN}/erp-api"

echo "完成。Vercel 环境变量建议: MEOO_ERP_API_HOST_IP=$(dig +short ${DOMAIN} 2>/dev/null | head -1 || echo 139.196.42.5)"
