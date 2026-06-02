#!/usr/bin/env bash
# 早上突然无法访问 mofangdianai.com/erp-api 时快速排查（不动商家 Vercel）
# ECS: cd ~/app && bash scripts/ecs-morning-check.sh
set -euo pipefail

echo "== 时间 =="
date

echo "== 443 监听 =="
sudo ss -tlnp | grep -E ':443|:3001\b' || true

echo "== 服务状态 =="
sudo systemctl is-active nginx 2>/dev/null || true
systemctl is-active meoo-auth-api 2>/dev/null || sudo systemctl is-active meoo-auth-api 2>/dev/null || echo "meoo-auth-api: unknown"

echo "== 本机 API =="
curl -sS -m 5 http://127.0.0.1:3001/api/meoo-erp-api-health | head -c 200 || echo "FAIL 127.0.0.1:3001"
echo

echo "== 本机 Nginx HTTPS =="
curl -sS -m 8 -k --resolve mofangdianai.com:443:127.0.0.1 \
  "https://mofangdianai.com/erp-api/meoo-erp-api-health" | head -c 200 || echo "FAIL local nginx SNI"
echo

echo "== 公网域名（与手机一致）==="
curl -sS -m 12 "https://mofangdianai.com/erp-api/meoo-erp-api-health" | head -c 200 || echo "FAIL public HTTPS"
echo

echo "== 证书到期 =="
echo | openssl s_client -connect 127.0.0.1:443 -servername mofangdianai.com 2>/dev/null \
  | openssl x509 -noout -dates 2>/dev/null || echo "WARN: 本机 SNI 无证书"

echo "== 最近 Nginx 错误 =="
sudo tail -n 15 /var/log/nginx/error.log 2>/dev/null || true

echo "== 若公网 FAIL、本机 SNI OK：查防火墙/轻量一键 HTTPS 是否抢 443 =="
echo "修复: sudo bash ~/app/scripts/ecs-fix-wechat-cronet-tls.sh && bash ~/app/scripts/ecs-fix-erp-api-502.sh"
