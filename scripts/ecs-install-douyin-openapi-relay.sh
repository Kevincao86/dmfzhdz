#!/usr/bin/env bash
# 轻量 139.196.42.5：安装抖音 OpenAPI Nginx 中继（配合 DOUYIN_OPENAPI_BASE_URL=/douyin）
#
# 用法（admin@轻量）:
#   cd ~/app && bash scripts/ecs-git-pull-gitee.sh && bash scripts/ecs-install-douyin-openapi-relay.sh
#
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
SNIP_SRC="$ROOT/scripts/ecs-nginx-erp-api-80-ip.snippet"
SNIP_DST="/etc/nginx/snippets/erp-api-80-ip.conf"
SITE="/etc/nginx/sites-enabled/erp-api-80-ip.conf"
IP="${MEOO_ERP_API_HOST_IP:-139.196.42.5}"

if [[ "$(id -un)" == "root" && "${HOME:-}" == "/root" ]]; then
  echo "请用 admin 执行: cd ~/app && bash scripts/ecs-install-douyin-openapi-relay.sh"
  exit 1
fi

if [[ ! -f "$SNIP_SRC" ]]; then
  echo "缺少 $SNIP_SRC，请先 git pull"
  exit 1
fi

if ! grep -q 'location /douyin/' "$SNIP_SRC"; then
  echo "snippet 缺少 location /douyin/，请 git pull 到最新"
  exit 1
fi

echo "== 1) 清理错误配置 =="
sudo rm -f /etc/nginx/conf.d/meoo-douyin-relay.conf
sudo rm -f /etc/nginx/snippets/meoo-douyin-relay.conf

echo "== 2) 覆盖 erp-api-80-ip（含 /douyin/ 反代） =="
sudo mkdir -p /etc/nginx/snippets
sudo cp "$SNIP_SRC" "$SNIP_DST"
printf '%s\n' 'include snippets/erp-api-80-ip.conf;' | sudo tee "$SITE" >/dev/null

echo "== 3) 移除旧脚本误插入的 include 行 =="
for f in \
  /etc/nginx/sites-available/meoo-api \
  /etc/nginx/sites-enabled/meoo-api \
  /etc/nginx/snippets/erp-api-80-ip.conf; do
  if [[ -f "$f" ]] && grep -q 'meoo-douyin-relay' "$f" 2>/dev/null; then
    sudo sed -i '/meoo-douyin-relay/d' "$f"
    echo "  已清理: $f"
  fi
done

echo "== 4) nginx -t && reload =="
sudo nginx -t
sudo systemctl reload nginx

echo "== 5) 探活 client_token（期望 JSON，非 HTML 404） =="
curl -sS -X POST "http://127.0.0.1/douyin/oauth/client_token/" \
  -H "Host: ${IP}" \
  -H "Content-Type: application/json" \
  -d '{"client_key":"x","client_secret":"y","grant_type":"client_credential"}' | head -c 280
echo ""
echo "OK: 若上方为 JSON（含 error_code/description），中继已通。请回商家后台重新「确认绑定」。"
