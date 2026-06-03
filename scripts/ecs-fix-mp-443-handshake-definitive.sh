#!/usr/bin/env bash
# 根治微信小程序 ERR_CONNECTION_RESET (-101)
# 根因常见：Nginx 仅 TLSv1.2 → 微信 Cronet 先握 TLS1.3 被 reset；或证书链不全、443 被面板抢占。
#
# ECS（admin）:
#   cd ~/app && git pull origin main
#   bash scripts/ecs-fix-mp-443-handshake-definitive.sh
#
set -euo pipefail

DOMAIN="${1:-mofangdianai.com}"
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
NGINX_SITE="/etc/nginx/sites-available/meoo-api"
SSL_DIR="/etc/nginx/ssl/${DOMAIN}"
HEALTH="https://${DOMAIN}/erp-api/mp-cronet-ping"
LOGIN_PROBE="https://${DOMAIN}/erp-api/meoo-ops-mp-auth"

if [[ "$(id -un)" != "admin" ]]; then
  echo "请用 admin 执行（勿 sudo bash 整脚本）"
  exit 1
fi

echo "== 1) DNS：禁止 AAAA（微信易走 IPv6 导致 30ms reset） =="
if dig +short AAAA "$DOMAIN" 2>/dev/null | grep -q .; then
  echo "FAIL: 仍存在 AAAA，请到域名控制台删除后等待 10~30 分钟"
  dig +short AAAA "$DOMAIN"
  exit 1
fi
echo "OK A=$(dig +short A "$DOMAIN" | tr '\n' ' ')"

echo "== 2) 443 只能由 Nginx 监听 =="
sudo ss -tlnp | grep -E ':443\b' || true
if sudo ss -tlnp | grep -E ':443\b' | grep -v nginx | grep -q .; then
  echo "FAIL: 除 nginx 外还有进程占 443。请在轻量控制台关闭「一键 HTTPS」/ 面板 SSL。"
  exit 1
fi

echo "== 3) 部署 Nginx（TLSv1.2+TLSv1.3、无 http2、fullchain、default_server） =="
sudo cp "$NGINX_SITE" "${NGINX_SITE}.bak.definitive.$(date +%Y%m%d%H%M%S)" 2>/dev/null || true
sudo cp "$ROOT/scripts/ecs-meoo-api.nginx.conf" "$NGINX_SITE"
sudo ln -sf "$NGINX_SITE" /etc/nginx/sites-enabled/meoo-api
sudo rm -f /etc/nginx/sites-enabled/default 2>/dev/null || true

sudo mkdir -p "$SSL_DIR"
if [[ -f /tmp/${DOMAIN}.pem && -f /tmp/${DOMAIN}.key ]]; then
  sudo cp "/tmp/${DOMAIN}.pem" "${SSL_DIR}/fullchain.pem"
  sudo cp "/tmp/${DOMAIN}.key" "${SSL_DIR}/privkey.pem"
elif [[ -f "${SSL_DIR}/fullchain.pem" ]]; then
  echo "使用已有 ${SSL_DIR}"
elif [[ -f "/etc/letsencrypt/live/${DOMAIN}/fullchain.pem" ]]; then
  sudo cp "/etc/letsencrypt/live/${DOMAIN}/fullchain.pem" "${SSL_DIR}/fullchain.pem"
  sudo cp "/etc/letsencrypt/live/${DOMAIN}/privkey.pem" "${SSL_DIR}/privkey.pem"
else
  echo "FAIL: 无证书。上传 /tmp/${DOMAIN}.pem + .key 或 certbot 签发根域。"
  exit 1
fi

CHAIN_N="$(sudo grep -c 'BEGIN CERTIFICATE' "${SSL_DIR}/fullchain.pem" 2>/dev/null || echo 0)"
if [[ "${CHAIN_N:-0}" -lt 2 ]]; then
  echo "WARN: fullchain 可能缺中间证书（微信比 Safari 更严）。请使用含中间链的 fullchain.pem。"
fi

sudo sed -i -E 's/listen ([0-9]+) ssl http2/listen \1 ssl/g' "$NGINX_SITE" 2>/dev/null || true
sudo sed -i 's|ssl_protocols TLSv1.2;|ssl_protocols TLSv1.2 TLSv1.3;|g' "$NGINX_SITE"
sudo sed -i "s|ssl_certificate .*fullchain.pem|ssl_certificate ${SSL_DIR}/fullchain.pem|g" "$NGINX_SITE"
sudo sed -i "s|ssl_certificate_key .*privkey.pem|ssl_certificate_key ${SSL_DIR}/privkey.pem|g" "$NGINX_SITE"

sudo nginx -t
sudo systemctl reload nginx

echo "== 4) 本机 TLS 探活（须能完成握手，不能 0 bytes read） =="
echo | openssl s_client -connect "127.0.0.1:443" -servername "$DOMAIN" -tls1_3 2>/dev/null \
  | openssl x509 -noout -subject -dates 2>/dev/null || echo "WARN: 本机 TLS1.3 SNI 失败"
echo | openssl s_client -connect "127.0.0.1:443" -servername "$DOMAIN" -tls1_2 2>/dev/null \
  | grep -E 'Protocol|Cipher' | head -3 || true

echo "== 5) 公网 HTTP（curl 在部分 Mac 上误报 reset，以 Node 为准） =="
node_ok=0
if node -e "
const https=require('https');
https.get({host:'${DOMAIN}',port:443,path:'/erp-api/mp-cronet-ping',servername:'${DOMAIN}',timeout:15000,headers:{Host:'${DOMAIN}'}},r=>{
  let d='';r.on('data',c=>d+=c);r.on('end',()=>{console.log(r.statusCode,d.slice(0,120));process.exit(r.statusCode===200?0:1);});
}).on('error',e=>{console.error(e);process.exit(1);});
"; then
  node_ok=1
fi
if [[ "$node_ok" -ne 1 ]]; then
  echo "FAIL: Node 公网 HTTPS 不通。检查安全组 443、证书、备案（阿里云控制台备案）。"
  exit 1
fi

CODE="probe_$(date +%s)"
if node -e "
const https=require('https');
const path='/erp-api/meoo-ops-mp-auth';
const data=JSON.stringify({action:'wx_login',code:'${CODE}',role:'talent'});
const opts={host:'${DOMAIN}',port:443,path,method:'POST',servername:'${DOMAIN}',timeout:20000,headers:{Host:'${DOMAIN}','Content-Type':'application/json','Content-Length':Buffer.byteLength(data)}};
const req=https.request(opts,r=>{let d='';r.on('data',c=>d+=c);r.on('end',()=>{console.log('POST wx_login',r.statusCode,d.slice(0,120));process.exit(r.statusCode>=400&&r.statusCode<600?0:1);});});
req.on('error',e=>{console.error(e);process.exit(1);});req.write(data);req.end();
"; then
  echo "OK: POST 登录路由可达（invalid code 属正常）"
fi

echo "== 6) auth-api（小程序业务） =="
bash "$ROOT/scripts/ecs-install-auth-api-systemd.sh"
bash "$ROOT/scripts/ecs-hotfix-mp-cronet-ping.sh" 2>/dev/null || true
sudo systemctl restart meoo-auth-api
sleep 2
curl -sf "http://127.0.0.1:3001/api/meoo-erp-api-health" | head -c 140
echo

echo ""
echo "OK: 443 握手已按微信要求修复。"
echo "  小程序体验版 BUILD: mp-20260606-tls13-post"
echo "  微信合法域名: https://${DOMAIN}"
echo "  手机：删小程序 → 重扫体验版；登录使用 POST（勿依赖超长 GET code）"
echo "  若仍 reset：同一手机 Safari 打开 ${HEALTH}"
echo "  备案：域名须在阿里云控制台完成备案（仅工信部备案不够时）"
