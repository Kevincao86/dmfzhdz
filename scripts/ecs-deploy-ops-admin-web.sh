#!/usr/bin/env bash
# 运营管控台（商家管理后台）：构建 dist + Nginx（admin.mofangdianai.com → 新 ECS，API 反代轻量）
#
# 机器：Web 在新 ECS（8.160.173.236）；API/DB 在轻量（139.196.42.5 / mofangdianai.com）
#
# 前置：
#   bash scripts/ecs-verify-ops-admin-pre-migrate.sh（在轻量执行）
#   DNS admin → ECS 公网 IP（验收可用 hosts，切流前再改 DNS）
#   商家管理后台/.env.production（见 .env.production.example）
#
# 用法（admin，新 ECS）:
#   cd ~/app && git pull
#   MEOO_API_UPSTREAM=https://mofangdianai.com bash scripts/ecs-deploy-ops-admin-web.sh
#
# 2G OOM：本机 npm run build 后 scp dist，再 SKIP_BUILD=1 执行本脚本

set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
# shellcheck source=ecs-resolve-admin-home.sh
source "$ROOT/scripts/ecs-resolve-admin-home.sh"

OPS="$ROOT/商家管理后台"
ENV_PROD="$OPS/.env.production"
ENV_EXAMPLE="$OPS/.env.production.example"
NGINX_TEMPLATE="$ROOT/scripts/ecs-nginx-ops-admin.conf"
NGINX_SITE="/etc/nginx/sites-available/meoo-ops-admin"

MEOO_API_UPSTREAM="${MEOO_API_UPSTREAM:-https://mofangdianai.com}"
MEOO_LIGHT_IP="${MEOO_LIGHT_IP:-139.196.42.5}"
OPS_ADMIN_DOMAIN="${OPS_ADMIN_DOMAIN:-admin.mofangdianai.com}"
OPS_ADMIN_STAGING_DOMAIN="${OPS_ADMIN_STAGING_DOMAIN:-}"

if [[ "$(id -un)" == "root" && "${HOME:-}" == "/root" ]]; then
  echo "请用 admin 执行，或: su - admin -c 'cd ~/app && bash scripts/ecs-deploy-ops-admin-web.sh'"
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
    echo "请填入 VITE_MEEO_SUPPORT_OPS_HTTP_TOKEN（与轻量 auth-api.env 一致）后重跑"
    exit 1
  fi
  echo "缺少 $ENV_PROD"
  exit 1
fi
if ! grep -qE '^VITE_MEEO_SUPPORT_OPS_HTTP_TOKEN=.+$' "$ENV_PROD"; then
  echo "请在 $ENV_PROD 填入 VITE_MEEO_SUPPORT_OPS_HTTP_TOKEN（与轻量 ~/stack/auth-api.env 一致）后重跑"
  exit 1
fi

echo "== 2) npm build =="
if [[ "${SKIP_BUILD:-0}" != "1" ]]; then
  set -a
  # shellcheck disable=SC1090
  source "$ENV_PROD"
  set +a
  (cd "$OPS" && npm ci && npm run build)
else
  echo "SKIP_BUILD=1，跳过 npm build"
fi

if [[ ! -f "$OPS/dist/index.html" ]]; then
  echo "FAIL: 未生成 $OPS/dist/index.html"
  exit 1
fi
echo "OK: dist 已生成 ($(du -sh "$OPS/dist" | awk '{print $1}'))"

echo "== 3) Nginx =="
if [[ ! -f "$NGINX_TEMPLATE" ]]; then
  echo "缺少 $NGINX_TEMPLATE"
  exit 1
fi

SERVER_NAMES="$OPS_ADMIN_DOMAIN"
if [[ -n "$OPS_ADMIN_STAGING_DOMAIN" && "$OPS_ADMIN_STAGING_DOMAIN" != "$OPS_ADMIN_DOMAIN" ]]; then
  SERVER_NAMES="${OPS_ADMIN_STAGING_DOMAIN} ${OPS_ADMIN_DOMAIN}"
fi

SSL_DIR="${OPS_ADMIN_SSL_DIR:-/etc/nginx/ssl/${OPS_ADMIN_DOMAIN}}"
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
  echo "请先: sudo bash scripts/ecs-setup-ssl-fulfillment-domain.sh ${OPS_ADMIN_DOMAIN}"
  echo "或阿里云 DV 放到 /etc/nginx/ssl/${OPS_ADMIN_DOMAIN}/"
  exit 1
fi

TMP_NGINX="$(mktemp)"
sed \
  -e "s|__OPS_ADMIN_DIST__|${OPS}/dist|g" \
  -e "s|__OPS_ADMIN_SERVER_NAMES__|${SERVER_NAMES}|g" \
  -e "s|__OPS_ADMIN_SERVER_NAMES_80__|${SERVER_NAMES}|g" \
  -e "s|__MEOO_LIGHT_IP__|${MEOO_LIGHT_IP}|g" \
  -e "s|__SSL_CERT__|${SSL_CERT}|g" \
  -e "s|__SSL_KEY__|${SSL_KEY}|g" \
  -e "s|__SSL_DHPARAM__|${SSL_DHPARAM}|g" \
  "$NGINX_TEMPLATE" >"$TMP_NGINX"

sudo cp "$NGINX_SITE" "${NGINX_SITE}.bak.$(date +%Y%m%d%H%M%S)" 2>/dev/null || true
sudo cp "$TMP_NGINX" "$NGINX_SITE"
rm -f "$TMP_NGINX"
sudo ln -sf "$NGINX_SITE" /etc/nginx/sites-enabled/meoo-ops-admin
sudo rm -f /etc/nginx/sites-enabled/meoo-acme-"${OPS_ADMIN_DOMAIN}" 2>/dev/null || true
sudo chmod o+x /home/admin /home/admin/app "$OPS" 2>/dev/null || true
sudo chmod -R a+rX "$OPS/dist"
sudo nginx -t
sudo systemctl reload nginx

echo "== 4) 探活 =="
for host in $SERVER_NAMES; do
  curl -sS -o /dev/null -w "OK: ${host} index HTTP %{http_code}\n" \
    "http://127.0.0.1/" -H "Host: ${host}" 2>/dev/null || true
done

echo ""
echo "完成。"
echo "  运营 Web: https://${OPS_ADMIN_DOMAIN}"
if [[ -n "$OPS_ADMIN_STAGING_DOMAIN" ]]; then
  echo "  验收子域: https://${OPS_ADMIN_STAGING_DOMAIN}"
fi
echo "  API 轻量: curl -sS https://mofangdianai.com/erp-api/meoo-erp-api-health"
echo ""
echo "日常发版: cd ~/app && bash scripts/ecs-git-pull-gitee.sh && SKIP_BUILD=1 MEOO_API_UPSTREAM=https://mofangdianai.com bash scripts/ecs-deploy-ops-admin-web.sh"
