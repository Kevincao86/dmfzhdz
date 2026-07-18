#!/usr/bin/env bash
# 商家 ERP：构建 dist + Nginx（cs.mofangdianai.com → 新 ECS，API 反代轻量）
#
# 机器：Web 在新 ECS（8.160.173.236）；API/DB 在轻量（139.196.42.5 / mofangdianai.com）
#
# 前置：
#   DNS cs → ECS 公网 IP
#   root: bash scripts/ecs-setup-ssl-fulfillment-domain.sh cs.mofangdianai.com
#         （或阿里云 DV 证书放到 /etc/nginx/ssl/cs.mofangdianai.com/）
#   web版/merchant-erp/.env.production（见 .env.production.example）
#
# 用法（admin）:
#   cd ~/app && git pull
#   MEOO_API_UPSTREAM=https://mofangdianai.com bash scripts/ecs-deploy-merchant-cs-web.sh
#
# 新ECS（2G）禁止在本机 npm build：务必本机构建后 SKIP_BUILD=1
#   bash scripts/ecs-deploy-cs-web-local-build.sh

set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
# shellcheck source=ecs-resolve-admin-home.sh
source "$ROOT/scripts/ecs-resolve-admin-home.sh"
# shellcheck source=ecs-refuse-remote-web-build.sh
source "$ROOT/scripts/ecs-refuse-remote-web-build.sh"

ERP="$ROOT/web版/merchant-erp"
ENV_PROD="$ERP/.env.production"
ENV_EXAMPLE="$ERP/.env.production.example"
NGINX_TEMPLATE="$ROOT/scripts/ecs-nginx-merchant-cs.conf"
NGINX_SITE="/etc/nginx/sites-available/meoo-merchant-cs"

MEOO_API_UPSTREAM="${MEOO_API_UPSTREAM:-https://mofangdianai.com}"
MEOO_LIGHT_IP="${MEOO_LIGHT_IP:-139.196.42.5}"
MERCHANT_DOMAIN="${MERCHANT_DOMAIN:-cs.mofangdianai.com}"

if [[ "$(id -un)" == "root" && "${HOME:-}" == "/root" ]]; then
  echo "请用 admin 执行，或: su - admin -c 'cd ~/app && bash scripts/ecs-deploy-merchant-cs-web.sh'"
  exit 1
fi

echo "== 0) 代码 =="
if [[ -f "$ROOT/scripts/ecs-git-pull-gitee.sh" ]]; then
  bash "$ROOT/scripts/ecs-git-pull-gitee.sh"
elif [[ -d "$ROOT/.git" ]]; then
  (cd "$ROOT" && git pull --ff-only) || (cd "$ROOT" && git pull)
fi

echo "== 1) 生产构建环境 =="
if [[ ! -f "$ENV_PROD" ]]; then
  if [[ -f "$ENV_EXAMPLE" ]]; then
    cp "$ENV_EXAMPLE" "$ENV_PROD"
    echo "已从 .env.production.example 生成 $ENV_PROD"
    echo "请填入 VITE_SUPABASE_ANON_KEY 后重跑"
    exit 1
  fi
  echo "缺少 $ENV_PROD"
  exit 1
fi
if ! grep -qE '^VITE_SUPABASE_ANON_KEY=.+$' "$ENV_PROD"; then
  echo "请在 $ENV_PROD 填入 VITE_SUPABASE_ANON_KEY 后重跑"
  exit 1
fi
if grep -qE '^VITE_SUPABASE_URL=https://mofangdianai.com' "$ENV_PROD"; then
  echo "NOTE: .env 仍为根域；meoo-client-config.js 将写入 https://${MERCHANT_DOMAIN}（浏览器同源）。"
fi

echo "== 2) npm build =="
ecs_refuse_remote_web_build_if_new_ecs
if [[ "${SKIP_BUILD:-0}" != "1" ]]; then
  set -a
  # shellcheck disable=SC1090
  source "$ENV_PROD"
  set +a
  (cd "$ERP" && npm ci && npm run build)
else
  echo "SKIP_BUILD=1，跳过 npm build"
fi

if [[ ! -f "$ERP/dist/index.html" ]]; then
  echo "FAIL: 未生成 $ERP/dist/index.html"
  exit 1
fi

echo "== 2b) 写入运行时登录配置 meoo-client-config.js =="
SUPABASE_URL="$(grep -E '^VITE_SUPABASE_URL=' "$ENV_PROD" | head -1 | cut -d= -f2- | tr -d '\r' | sed 's/^["'\'']//;s/["'\'']$//')"
SUPABASE_ANON="$(grep -E '^VITE_SUPABASE_ANON_KEY=' "$ENV_PROD" | head -1 | cut -d= -f2- | tr -d '\r' | sed 's/^["'\'']//;s/["'\'']$//')"
# 备案后浏览器 Supabase 走 cs 同源（Nginx 反代轻量）；勿写根域
if [[ -z "$SUPABASE_URL" ]] || [[ "$SUPABASE_URL" == "https://mofangdianai.com" ]] || [[ "$SUPABASE_URL" == "https://www.mofangdianai.com" ]]; then
  SUPABASE_URL="https://${MERCHANT_DOMAIN}"
fi
if [[ -z "$SUPABASE_ANON" ]]; then
  echo "FAIL: 无法从 $ENV_PROD 读取 VITE_SUPABASE_ANON_KEY"
  exit 1
fi
(
  cd "$ERP"
  node -e "
const fs = require('fs')
const cfg = { supabaseUrl: process.argv[1], supabaseAnonKey: process.argv[2] }
fs.writeFileSync(
  'dist/meoo-client-config.js',
  'window.__MEOO_CLIENT_CONFIG__=' + JSON.stringify(cfg) + ';\\n',
)
" "$SUPABASE_URL" "$SUPABASE_ANON"
)
echo "OK: dist/meoo-client-config.js"

echo "OK: dist 已生成 ($(du -sh "$ERP/dist" | awk '{print $1}'))"

echo "== 3) Nginx =="
if [[ ! -f "$NGINX_TEMPLATE" ]]; then
  echo "缺少 $NGINX_TEMPLATE"
  exit 1
fi

API_PROXY=""
ERP_PROXY=""
PROXY_HOST='$host'
case "$MEOO_API_UPSTREAM" in
  http://127.0.0.1:3001|http://127.0.0.1:3001/)
    API_PROXY="http://127.0.0.1:3001/api/"
    ERP_PROXY="http://127.0.0.1:3001/api/"
    ;;
  https://*|http://*)
    base="${MEOO_API_UPSTREAM%/}"
    API_PROXY="${base}/api/"
    ERP_PROXY="${base}/erp-api/"
    PROXY_HOST='mofangdianai.com'
    ;;
  *)
    echo "不支持的 MEOO_API_UPSTREAM: $MEOO_API_UPSTREAM"
    exit 1
    ;;
esac

SSL_DIR="${MERCHANT_SSL_DIR:-/etc/nginx/ssl/${MERCHANT_DOMAIN}}"
if [[ ! -f "${SSL_DIR}/fullchain.pem" ]]; then
  SSL_DIR="/etc/nginx/ssl/mofangdianai.com"
fi
SSL_CERT="${SSL_DIR}/fullchain.pem"
SSL_KEY="${SSL_DIR}/privkey.pem"
SSL_DHPARAM="/etc/letsencrypt/ssl-dhparams.pem"
if [[ ! -f "$SSL_DHPARAM" ]]; then
  SSL_DHPARAM="/dev/null"
fi
if [[ ! -f "$SSL_CERT" ]]; then
  echo "缺少 TLS 证书: ${SSL_CERT}"
  echo "请先: sudo bash scripts/ecs-setup-ssl-fulfillment-domain.sh ${MERCHANT_DOMAIN}"
  echo "或阿里云 DV 放到 /etc/nginx/ssl/${MERCHANT_DOMAIN}/"
  exit 1
fi

TMP_NGINX="$(mktemp)"
sed \
  -e "s|__MERCHANT_DIST__|${ERP}/dist|g" \
  -e "s|__MERCHANT_SERVER_NAMES__|${MERCHANT_DOMAIN}|g" \
  -e "s|__MERCHANT_SERVER_NAMES_80__|${MERCHANT_DOMAIN}|g" \
  -e "s|__MEOO_API_PROXY__|${API_PROXY}|g" \
  -e "s|__MEOO_ERP_API_PROXY__|${ERP_PROXY}|g" \
  -e "s|__MEOO_API_PROXY_HOST__|${PROXY_HOST}|g" \
  -e "s|__MEOO_LIGHT_IP__|${MEOO_LIGHT_IP}|g" \
  -e "s|__SSL_CERT__|${SSL_CERT}|g" \
  -e "s|__SSL_KEY__|${SSL_KEY}|g" \
  -e "s|__SSL_DHPARAM__|${SSL_DHPARAM}|g" \
  "$NGINX_TEMPLATE" >"$TMP_NGINX"

sudo cp "$NGINX_SITE" "${NGINX_SITE}.bak.$(date +%Y%m%d%H%M%S)" 2>/dev/null || true
sudo cp "$TMP_NGINX" "$NGINX_SITE"
rm -f "$TMP_NGINX"
sudo ln -sf "$NGINX_SITE" /etc/nginx/sites-enabled/meoo-merchant-cs
sudo rm -f /etc/nginx/sites-enabled/meoo-acme-"${MERCHANT_DOMAIN}" 2>/dev/null || true
sudo chmod o+x /home/admin /home/admin/app "$ERP" 2>/dev/null || true
sudo chmod -R a+rX "$ERP/dist"
sudo nginx -t
sudo systemctl reload nginx

echo "== 4) 探活 =="
curl -sS -o /dev/null -w "OK: ${MERCHANT_DOMAIN} index HTTP %{http_code}\n" \
  "http://127.0.0.1/" -H "Host: ${MERCHANT_DOMAIN}" 2>/dev/null || true
curl -sS -o /dev/null -w "OK: ${MERCHANT_DOMAIN} /api/meoo-auth-ping HTTP %{http_code}\n" \
  "http://127.0.0.1/api/meoo-auth-ping" -H "Host: ${MERCHANT_DOMAIN}" 2>/dev/null || true

echo ""
echo "完成。"
echo "  商家 Web: https://${MERCHANT_DOMAIN}"
echo "  API 轻量: curl -sS https://mofangdianai.com/erp-api/meoo-erp-api-health"
echo ""
echo "日常发版: cd ~/app && bash scripts/ecs-git-pull-gitee.sh && MEOO_API_UPSTREAM=https://mofangdianai.com bash scripts/ecs-deploy-merchant-cs-web.sh"
