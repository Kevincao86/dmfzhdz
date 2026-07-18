#!/usr/bin/env bash
# 新 ECS（2G 内存）服务商 fws 发版：本机构建 dist-partner → rsync → 远程 SKIP_BUILD
#
# 用法（本机）:
#   bash scripts/ecs-deploy-fws-web-local-build.sh
#   CS_HOST=admin@8.160.173.236 bash scripts/ecs-deploy-fws-web-local-build.sh
#
# 仅上传已有 dist-partner:
#   SKIP_LOCAL_BUILD=1 bash scripts/ecs-deploy-fws-web-local-build.sh

set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
ERP="$ROOT/web版/merchant-erp"
DIST="$ERP/dist-partner"
ENV_PROD="$ERP/.env.partner"
CS_HOST="${CS_HOST:-admin@8.160.173.236}"
MEOO_API_UPSTREAM="${MEOO_API_UPSTREAM:-https://mofangdianai.com}"
MEOO_LIGHT_IP="${MEOO_LIGHT_IP:-139.196.42.5}"

if [[ "$(id -un)" == "root" ]]; then
  echo "请用普通用户在本机执行（非 ECS root）"
  exit 1
fi

echo "== 0) 本机构建 merchant-erp dist-partner =="
if [[ "${SKIP_LOCAL_BUILD:-0}" != "1" ]]; then
  if [[ ! -f "$ENV_PROD" ]]; then
    echo "缺少 $ENV_PROD，请从 .env.partner.example 复制并填入 VITE_SUPABASE_ANON_KEY"
    exit 1
  fi
  if ! grep -qE '^VITE_APP_EDITION=partner' "$ENV_PROD"; then
    echo "请在 $ENV_PROD 设置 VITE_APP_EDITION=partner"
    exit 1
  fi
  set -a
  # shellcheck disable=SC1090
  source "$ENV_PROD"
  set +a
  (cd "$ERP" && npm run build:partner)
else
  echo "SKIP_LOCAL_BUILD=1，跳过本机 npm run build:partner"
fi

if [[ ! -f "$DIST/index.html" ]]; then
  echo "FAIL: 未找到 $DIST/index.html"
  exit 1
fi
echo "OK: 本机 dist-partner $(du -sh "$DIST" | awk '{print $1}')"

echo "== 1) 上传 dist-partner 到新 ECS（rsync）=="
ssh -o ConnectTimeout=25 -o StrictHostKeyChecking=accept-new "$CS_HOST" "mkdir -p ~/app/web版/merchant-erp/dist-partner"
rsync -az --delete \
  -e "ssh -o ConnectTimeout=25 -o StrictHostKeyChecking=accept-new" \
  "$DIST/" \
  "$CS_HOST:~/app/web版/merchant-erp/dist-partner/"
echo "OK: dist-partner 已同步到 $CS_HOST"

echo "== 2) 远程 SKIP_BUILD 部署（仅写配置 + reload nginx）=="
ssh -o ConnectTimeout=25 -o StrictHostKeyChecking=accept-new "$CS_HOST" bash -s <<REMOTE
set -euo pipefail
cd ~/app
if [[ -f scripts/ecs-git-pull-gitee.sh ]]; then
  bash scripts/ecs-git-pull-gitee.sh
fi
echo "HEAD: \$(git log -1 --oneline)"
SKIP_BUILD=1 MEOO_API_UPSTREAM=${MEOO_API_UPSTREAM} MEOO_LIGHT_IP=${MEOO_LIGHT_IP} \
  bash scripts/ecs-deploy-partner-fws-web.sh
REMOTE

echo ""
echo "完成。验收: curl -sS -o /dev/null -w 'fws_http=%{http_code}\n' https://fws.mofangdianai.com/"
