#!/usr/bin/env bash
# 灵祺达人履约管理后台：构建 dist + 安装 Nginx（替代 Vercel 履约项目）
#
# 机器：履约 Web 在 ECS（8.160.173.236）；API 在轻量（139.196.42.5 / mofangdianai.com）
#
# 正式域默认 dr.mofangdianai.com，见 docs/MIGRATE-VERCEL-TO-ECS-talent-fulfillment.md
#   DNS: dr → ECS 8.160.173.236
#   sudo bash scripts/ecs-setup-ssl-fulfillment-domain.sh dr.mofangdianai.com
#   MEOO_API_UPSTREAM=https://mofangdianai.com bash scripts/ecs-deploy-talent-fulfillment-web.sh
#
# 2G 内存构建失败时本机构建后上传：
#   SKIP_BUILD=1 bash scripts/ecs-deploy-talent-fulfillment-web.sh

set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
# shellcheck source=ecs-resolve-admin-home.sh
source "$ROOT/scripts/ecs-resolve-admin-home.sh"

FUL="$ROOT/灵祺达人履约管理后台"
ERP="$ROOT/web版/merchant-erp"
ENV_PROD="$FUL/.env.production"
ENV_EXAMPLE="$FUL/.env.production.example"
NGINX_TEMPLATE="$ROOT/scripts/ecs-nginx-talent-fulfillment.conf"
NGINX_SITE="/etc/nginx/sites-available/meoo-talent-fulfillment"

# 新 ECS 默认反代到轻量；仅在轻量本机构建+同机 auth-api 时用 http://127.0.0.1:3001
MEOO_API_UPSTREAM="${MEOO_API_UPSTREAM:-https://mofangdianai.com}"
FULFILLMENT_DOMAIN="${FULFILLMENT_DOMAIN:-dr.mofangdianai.com}"
# 兼容旧变量名
if [[ -n "${FULFILLMENT_PROD_DOMAIN:-}" ]]; then
  FULFILLMENT_DOMAIN="$FULFILLMENT_PROD_DOMAIN"
fi
FULFILLMENT_STAGING_DOMAIN="${FULFILLMENT_STAGING_DOMAIN:-}"

if [[ "$(id -un)" == "root" && "${HOME:-}" == "/root" ]]; then
  echo "请用 admin 执行，或: su - admin -c 'cd ~/app && bash scripts/ecs-deploy-talent-fulfillment-web.sh'"
  exit 1
fi

echo "== 0) 代码 =="
if [[ "${SKIP_BUILD:-0}" == "1" && "${SKIP_GIT_PULL:-0}" == "1" ]]; then
  echo "SKIP_GIT_PULL=1：跳过 git pull（保留已上传 dist，避免 reset 覆盖）"
elif [[ -f "$ROOT/scripts/ecs-git-pull-gitee.sh" ]]; then
  bash "$ROOT/scripts/ecs-git-pull-gitee.sh"
elif [[ -d "$ROOT/.git" ]]; then
  (cd "$ROOT" && git pull --ff-only) || (cd "$ROOT" && git pull)
fi

echo "== 1) 生产构建环境 =="
if [[ ! -f "$ENV_PROD" ]]; then
  if [[ -f "$ENV_EXAMPLE" ]]; then
    cp "$ENV_EXAMPLE" "$ENV_PROD"
    echo "已从 .env.production.example 生成 $ENV_PROD"
    echo "请填入 VITE_SUPABASE_ANON_KEY（与商家版/Vercel 相同）后重跑"
    exit 1
  fi
  echo "缺少 $ENV_PROD"
  exit 1
fi
if ! grep -qE '^VITE_SUPABASE_ANON_KEY=.+$' "$ENV_PROD"; then
  echo "请在 $ENV_PROD 填入 VITE_SUPABASE_ANON_KEY 后重跑"
  exit 1
fi

echo "== 2) npm build =="
if [[ "${SKIP_BUILD:-0}" != "1" ]]; then
  echo "安装商家版依赖（履约嵌入 @merchant 页面需要）..."
  (cd "$ERP" && npm ci)
  echo "安装履约后台依赖并构建..."
  set -a
  # shellcheck disable=SC1090
  source "$ENV_PROD"
  set +a
  rm -rf "$FUL/dist"
  (cd "$FUL" && npm ci && npm run build)
else
  echo "SKIP_BUILD=1，跳过 npm build"
fi

if [[ ! -f "$FUL/dist/index.html" ]]; then
  echo "FAIL: 未生成 $FUL/dist/index.html"
  exit 1
fi
echo "OK: dist 已生成 ($(du -sh "$FUL/dist" | awk '{print $1}'))"

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

SERVER_NAMES="$FULFILLMENT_DOMAIN"
if [[ -n "$FULFILLMENT_STAGING_DOMAIN" && "$FULFILLMENT_STAGING_DOMAIN" != "$FULFILLMENT_DOMAIN" ]]; then
  SERVER_NAMES="${FULFILLMENT_STAGING_DOMAIN} ${FULFILLMENT_DOMAIN}"
fi

SSL_DIR="${FULFILLMENT_SSL_DIR:-/etc/nginx/ssl/${FULFILLMENT_DOMAIN}}"
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
  echo "请先: sudo bash scripts/ecs-setup-ssl-fulfillment-domain.sh ${FULFILLMENT_DOMAIN}"
  exit 1
fi

TMP_NGINX="$(mktemp)"
sed \
  -e "s|__FULFILLMENT_DIST__|${FUL}/dist|g" \
  -e "s|__FULFILLMENT_SERVER_NAMES__|${SERVER_NAMES}|g" \
  -e "s|__FULFILLMENT_SERVER_NAMES_80__|${SERVER_NAMES}|g" \
  -e "s|__MEOO_API_PROXY__|${API_PROXY}|g" \
  -e "s|__MEOO_ERP_API_PROXY__|${ERP_PROXY}|g" \
  -e "s|__MEOO_API_PROXY_HOST__|${PROXY_HOST}|g" \
  -e "s|__SSL_CERT__|${SSL_CERT}|g" \
  -e "s|__SSL_KEY__|${SSL_KEY}|g" \
  -e "s|__SSL_DHPARAM__|${SSL_DHPARAM}|g" \
  "$NGINX_TEMPLATE" >"$TMP_NGINX"

sudo cp "$NGINX_SITE" "${NGINX_SITE}.bak.$(date +%Y%m%d%H%M%S)" 2>/dev/null || true
sudo cp "$TMP_NGINX" "$NGINX_SITE"
rm -f "$TMP_NGINX"
sudo ln -sf "$NGINX_SITE" /etc/nginx/sites-enabled/meoo-talent-fulfillment
# 证书已就绪后移除临时 ACME 站，避免 dr 在 80 端口 server_name 冲突
sudo rm -f /etc/nginx/sites-enabled/meoo-acme-"${FULFILLMENT_DOMAIN}" 2>/dev/null || true
# nginx (www-data) 须能穿越 /home/admin 并读 dist
sudo chmod o+x /home/admin /home/admin/app "$FUL" 2>/dev/null || true
sudo chmod -R a+rX "$FUL/dist"
sudo nginx -t
sudo systemctl reload nginx

echo "== 4) 探活 =="
for host in $SERVER_NAMES; do
  curl -sS -o /dev/null -w "OK: ${host} index HTTP %{http_code}\n" \
    "http://127.0.0.1/" -H "Host: ${host}" 2>/dev/null || true
done

echo ""
echo "完成。"
echo "  履约 Web: https://${FULFILLMENT_DOMAIN}"
if [[ -n "$FULFILLMENT_STAGING_DOMAIN" ]]; then
  echo "  验收子域: https://${FULFILLMENT_STAGING_DOMAIN}"
fi
echo "  API: curl -sS https://mofangdianai.com/erp-api/meoo-erp-api-health"
