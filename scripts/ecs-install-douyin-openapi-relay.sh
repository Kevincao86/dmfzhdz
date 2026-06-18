#!/usr/bin/env bash
# 轻量 139.196.42.5：安装抖音 OpenAPI Nginx 中继（配合 DOUYIN_OPENAPI_BASE_URL=/douyin）
#
# 用法（admin@轻量）:
#   cd ~/app && bash scripts/ecs-install-douyin-openapi-relay.sh
#
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
SNIP_SRC="$ROOT/scripts/ecs-nginx-douyin-relay.snippet"
SNIP_DST="/etc/nginx/snippets/meoo-douyin-relay.conf"
MARKER="include snippets/meoo-douyin-relay.conf;"

if [[ "$(id -un)" == "root" && "${HOME:-}" == "/root" ]]; then
  echo "请用 admin 执行: cd ~/app && bash scripts/ecs-install-douyin-openapi-relay.sh"
  exit 1
fi

if [[ ! -f "$SNIP_SRC" ]]; then
  echo "缺少 $SNIP_SRC，请先 git pull"
  exit 1
fi

echo "== 1) 删除错误的 conf.d/location-only 配置（若存在） =="
sudo rm -f /etc/nginx/conf.d/meoo-douyin-relay.conf

echo "== 2) 安装 snippet =="
sudo cp "$SNIP_SRC" "$SNIP_DST"

patch_server_file() {
  local f="$1"
  [[ -f "$f" ]] || return 0
  if grep -qF "$MARKER" "$f" 2>/dev/null; then
    echo "  已包含: $f"
    return 0
  fi
  if ! grep -q 'server_name.*139\.196\.42\.5' "$f" 2>/dev/null; then
    return 0
  fi
  sudo cp "$f" "${f}.bak.$(date +%Y%m%d%H%M%S)"
  sudo awk -v m="$MARKER" '
    /^[[:space:]]*}[[:space:]]*$/ && !done {
      print "    " m
      done=1
    }
    { print }
  ' "$f" | sudo tee "${f}.new" >/dev/null
  sudo mv "${f}.new" "$f"
  echo "  已写入 include: $f"
}

echo "== 3) 注入 server 块 include =="
for f in \
  /etc/nginx/snippets/erp-api-80-ip.conf \
  /etc/nginx/sites-available/meoo-api \
  /etc/nginx/sites-enabled/meoo-api \
  /etc/nginx/sites-enabled/erp-api-80-ip.conf; do
  patch_server_file "$f"
done

echo "== 4) nginx -t && reload =="
sudo nginx -t
sudo systemctl reload nginx

echo "== 5) 探活 client_token（期望 JSON，非 HTML 404） =="
curl -sS -X POST "http://127.0.0.1/douyin/oauth/client_token/" \
  -H "Content-Type: application/json" \
  -d '{"client_key":"x","client_secret":"y","grant_type":"client_credential"}' | head -c 280
echo ""
echo "OK: 若上方为 JSON（含 error_code/description），中继已通。请回商家后台重新「确认绑定」。"
