#!/usr/bin/env bash
# 诊断外网 HTTPS 握手失败（手机微信 ERR_CONNECTION_RESET / curl error 35）
# ECS: bash ~/app/scripts/ecs-diagnose-https.sh

set -euo pipefail

DOMAIN="${1:-mofangdianai.com}"
HEALTH="https://${DOMAIN}/erp-api/meoo-erp-api-health"

echo "== DNS =="
dig +short "$DOMAIN" A || true
dig +short "$DOMAIN" AAAA || true

echo "== 本机 Nginx 443（SNI） =="
if command -v openssl >/dev/null; then
  echo | openssl s_client -connect "127.0.0.1:443" -servername "$DOMAIN" 2>/dev/null \
    | openssl x509 -noout -subject -issuer -dates 2>/dev/null || echo "WARN: 本机 443 无有效证书"
fi

echo "== Nginx 证书路径 =="
sudo grep -E 'ssl_certificate|listen 443' /etc/nginx/sites-enabled/* 2>/dev/null | head -20 || true

echo "== 公网 health（从 ECS 发出） =="
curl -sS -m 15 "$HEALTH" | head -c 200 || echo "FAIL: 公网 curl 失败"
echo

echo "== 提示 =="
echo "1) ssl_certificate 必须用 fullchain.pem，不能只用 cert.pem"
echo "2) 轻量控制台勿与自建 Nginx 重复占用 443"
echo "3) 若有错误 AAAA 记录，请在 DNS 删除 IPv6 或修好 IPv6"
echo "4) 手机 Safari 打不开 ${HEALTH} 时，先修 HTTPS 再测小程序"
