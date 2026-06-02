#!/usr/bin/env bash
# 小程序公网 API 一键修复：Nginx 443（微信 Cronet）+ auth-api 502 + 公网 health
# ECS Workbench（务必用 admin，勿 sudo 整脚本）:
#   cd ~/app && git pull
#   bash scripts/ecs-fix-mp-api-public.sh

set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
# shellcheck source=ecs-resolve-admin-home.sh
source "$ROOT/scripts/ecs-resolve-admin-home.sh"

DOMAIN="${1:-mofangdianai.com}"
HEALTH="https://${DOMAIN}/erp-api/meoo-erp-api-health"
HALL="https://${DOMAIN}/erp-api/meoo-ops-mp-hall-registry"
CREDS="$HOME/stack/db-credentials.txt"

if [[ "$(id -un)" != "admin" && "$(id -un)" != "root" ]]; then
  echo "请用 admin 登录 ECS 后执行: bash scripts/ecs-fix-mp-api-public.sh"
  exit 1
fi

if [[ "$(id -un)" == "root" && "${HOME:-}" == "/root" ]]; then
  echo "检测到 root 且 HOME=/root。请勿: sudo bash scripts/ecs-fix-mp-api-public.sh"
  echo "请改为: su - admin  或 Workbench 用 admin 执行:"
  echo "  cd ~/app && bash scripts/ecs-fix-mp-api-public.sh"
  exit 1
fi

echo "使用 HOME=$HOME"

if [[ ! -f "$CREDS" ]]; then
  echo "缺少 $CREDS — auth-api 无法生成 ~/stack/auth-api.env"
  echo "若 stack 在别的用户下，请: ls -la /home/admin/stack/"
  echo "恢复方式：从 ECS 备份找回 db-credentials.txt，或参考 scripts/supabase-cloud-to-ecs-migrate.sh 重建 stack。"
  exit 1
fi

echo "== A) Nginx / TLS（微信 Cronet，勿 http2） =="
sudo bash "$ROOT/scripts/ecs-fix-wechat-https-443.sh" "$DOMAIN"

echo "== B) auth-api systemd / 502（admin HOME，勿 sudo） =="
bash "$ROOT/scripts/ecs-fix-erp-api-502.sh"

echo "== C) 本机 erp-api =="
if ! curl -sf "http://127.0.0.1:3001/api/meoo-erp-api-health" | head -c 160; then
  echo
  echo "FAIL: :3001 无响应。执行:"
  echo "  bash scripts/ecs-run-auth-api.sh"
  echo "  sudo journalctl -u meoo-auth-api -n 50 --no-pager"
  exit 1
fi
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
