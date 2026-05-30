#!/usr/bin/env bash
# 根域 API 切换后更新 GoTrue 环境（ECS 执行）
# 用法：bash ~/app/scripts/ecs-update-gotrue-root-domain.sh
#
# 商户前端默认：https://cs.mofangdianai.com（Vercel）
# API 根域：https://mofangdianai.com

set -euo pipefail

GOTRUE_ENV="${HOME}/stack/gotrue.env"
FE="${FRONTEND_ORIGIN:-https://cs.mofangdianai.com}"
API_ROOT="${API_ROOT:-https://mofangdianai.com}"

if [[ ! -f "${HOME}/stack/db-credentials.txt" ]]; then
  echo "缺少 ~/stack/db-credentials.txt"
  exit 1
fi

# shellcheck disable=SC1091
source "${HOME}/stack/db-credentials.txt"

sudo tee "$GOTRUE_ENV" >/dev/null <<EOF
GOTRUE_API_HOST=0.0.0.0
GOTRUE_API_PORT=9999
GOTRUE_DB_DRIVER=postgres
DATABASE_URL=postgres://postgres:${POSTGRES_PASSWORD}@127.0.0.1:5433/postgres?sslmode=disable&options=-csearch_path%3Dauth
GOTRUE_SITE_URL=${FE}
GOTRUE_URI_ALLOW_LIST=${FE}/*,https://mofangdianai.com/*
GOTRUE_JWT_SECRET=${JWT_SECRET}
GOTRUE_JWT_ADMIN_ROLES=service_role
GOTRUE_DISABLE_SIGNUP=false
API_EXTERNAL_URL=${API_ROOT}/auth/v1
EOF

sudo chmod 600 "$GOTRUE_ENV"
sudo systemctl restart meoo-gotrue
sudo systemctl status meoo-gotrue --no-pager | head -5

echo ""
echo "OK: GoTrue 已指向 ${API_ROOT}/auth/v1 ，站点 ${FE}"
