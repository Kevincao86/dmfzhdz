#!/usr/bin/env bash
# 检查浏览器 ERR_CERT_COMMON_NAME_INVALID：Nginx 实际使用的证书 vs 域名
# ECS: bash ~/app/scripts/ecs-check-ssl-cert.sh

set -euo pipefail

DOMAIN="${1:-mofangdianai.com}"

echo "== 1) Nginx 配置的证书路径 =="
sudo grep -rn "ssl_certificate" /etc/nginx/sites-enabled/ 2>/dev/null || true

echo ""
echo "== 2) 常见证书目录文件 =="
for d in /home/admin/ssl /etc/nginx/ssl "/etc/letsencrypt/live/${DOMAIN}" /etc/letsencrypt/live/api.mofangdianai.com; do
  if [[ -d "$d" ]]; then
    echo "--- $d ---"
    sudo ls -la "$d" 2>/dev/null || ls -la "$d"
  fi
done

echo ""
echo "== 3) 公网实际返回的证书（浏览器看到的） =="
echo | openssl s_client -connect "${DOMAIN}:443" -servername "$DOMAIN" 2>/dev/null \
  | openssl x509 -noout -subject -issuer -dates 2>/dev/null || echo "无法读取证书"

echo ""
echo "== 4) SAN（必须含 ${DOMAIN}） =="
echo | openssl s_client -connect "${DOMAIN}:443" -servername "$DOMAIN" 2>/dev/null \
  | openssl x509 -noout -text 2>/dev/null | grep -A1 "Subject Alternative Name" || echo "无 SAN 或读取失败"

echo ""
echo "若 SAN 只有 api.${DOMAIN}，请把 nginx 的 ssl_certificate 改为你上传的 ${DOMAIN} 证书路径后 reload。"
