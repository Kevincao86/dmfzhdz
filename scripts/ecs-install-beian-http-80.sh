#!/usr/bin/env bash
# 方案 B：轻量开放 HTTP:80 + IP Host，供 Vercel supabaseAdminFetch 访问 /auth/v1、/rest/v1（不经 erp-api）
# 执行: cd ~/app && git pull && sudo bash scripts/ecs-install-beian-http-80.sh
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
SNIPPET="$ROOT/scripts/ecs-nginx-erp-api-80-ip.snippet"
SITE="/etc/nginx/sites-enabled/erp-api-80-ip.conf"
IP="${MEOO_ERP_API_HOST_IP:-139.196.42.5}"

if [[ ! -f "$SNIPPET" ]]; then
  echo "缺少 $SNIPPET"
  exit 1
fi

sudo mkdir -p /etc/nginx/snippets
sudo cp "$SNIPPET" /etc/nginx/snippets/erp-api-80-ip.conf
printf '%s\n' 'include snippets/erp-api-80-ip.conf;' | sudo tee "$SITE" >/dev/null

sudo nginx -t
sudo systemctl reload nginx

echo "== 本机探活 =="
curl -sf -H "Host: ${IP}" "http://127.0.0.1/erp-api/meoo-erp-api-health" | head -c 160
echo
curl -sf -H "Host: ${IP}" "http://127.0.0.1/auth/v1/health" | head -c 160
echo
echo "OK: 备案 HTTP:80 已启用。Vercel 需 MEOO_ERP_BEIAN_BYPASS=1 并 Redeploy。"
