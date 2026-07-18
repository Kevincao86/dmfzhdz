#!/usr/bin/env bash
# 新 ECS（2G 内存）推荐发版：本机构建 dist → rsync 上传 → 远程 SKIP_BUILD 只刷 Nginx
#
# 避免在 ECS 上 npm ci + vite build 触发 OOM / SSH 会话被系统杀掉。
# dist 体积通常仅几十 MB，不是崩溃主因；主因是构建期内存峰值。
#
# 用法（本机，需能 SSH 新 ECS）:
#   bash scripts/ecs-deploy-cs-web-local-build.sh
#   CS_HOST=admin@8.160.173.236 bash scripts/ecs-deploy-cs-web-local-build.sh
#
# 仅上传已有 dist、不本机构建:
#   SKIP_LOCAL_BUILD=1 bash scripts/ecs-deploy-cs-web-local-build.sh

set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
ERP="$ROOT/web版/merchant-erp"
ENV_PROD="$ERP/.env.production"
CS_HOST="${CS_HOST:-admin@8.160.173.236}"
MEOO_API_UPSTREAM="${MEOO_API_UPSTREAM:-https://mofangdianai.com}"
MEOO_LIGHT_IP="${MEOO_LIGHT_IP:-139.196.42.5}"

if [[ "$(id -un)" == "root" ]]; then
  echo "请用普通用户在本机执行（非 ECS root）"
  exit 1
fi

echo "== 0) 本机构建 merchant-erp dist =="
if [[ "${SKIP_LOCAL_BUILD:-0}" != "1" ]]; then
  if [[ ! -f "$ENV_PROD" ]]; then
    echo "缺少 $ENV_PROD，请从 .env.production.example 复制并填入 VITE_SUPABASE_ANON_KEY"
    exit 1
  fi
  set -a
  # shellcheck disable=SC1090
  source "$ENV_PROD"
  set +a
  (cd "$ERP" && npm run build)
else
  echo "SKIP_LOCAL_BUILD=1，跳过本机 npm run build"
fi

if [[ ! -f "$ERP/dist/index.html" ]]; then
  echo "FAIL: 未找到 $ERP/dist/index.html"
  exit 1
fi
echo "OK: 本机 dist $(du -sh "$ERP/dist" | awk '{print $1}')"

echo "== 1) 上传 dist 到新 ECS（rsync）=="
ssh -o ConnectTimeout=25 -o StrictHostKeyChecking=accept-new "$CS_HOST" "mkdir -p ~/app/web版/merchant-erp/dist"
rsync -az --delete \
  -e "ssh -o ConnectTimeout=25 -o StrictHostKeyChecking=accept-new" \
  "$ERP/dist/" \
  "$CS_HOST:~/app/web版/merchant-erp/dist/"
echo "OK: dist 已同步到 $CS_HOST"

echo "== 2) 远程 SKIP_BUILD 部署（仅写配置 + reload nginx）=="
ssh -o ConnectTimeout=25 -o StrictHostKeyChecking=accept-new "$CS_HOST" bash -s <<REMOTE
set -euo pipefail
cd ~/app
if [[ -f scripts/ecs-git-pull-gitee.sh ]]; then
  bash scripts/ecs-git-pull-gitee.sh
fi
echo "HEAD: \$(git log -1 --oneline)"
SKIP_BUILD=1 MEOO_API_UPSTREAM=${MEOO_API_UPSTREAM} MEOO_LIGHT_IP=${MEOO_LIGHT_IP} \
  bash scripts/ecs-deploy-merchant-cs-web.sh
REMOTE

echo ""
echo "完成。验收: curl -sS -o /dev/null -w 'cs_http=%{http_code}\n' https://cs.mofangdianai.com/"
