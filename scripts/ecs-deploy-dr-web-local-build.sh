#!/usr/bin/env bash
# 新 ECS（2G 内存）履约 DR 发版：本机构建 灵祺达人履约管理后台 dist → rsync → 远程 SKIP_BUILD
#
# DR 通过 @merchant 嵌入商家 CS 同源页面（AI 视觉工坊 / 数字人口播等），发版须带上最新 merchant-erp。
#
# 用法（本机，需能 SSH 新 ECS）:
#   bash scripts/ecs-deploy-dr-web-local-build.sh
#   CS_HOST=admin@8.160.173.236 bash scripts/ecs-deploy-dr-web-local-build.sh
#
# 仅上传已有 dist、不本机构建:
#   SKIP_LOCAL_BUILD=1 bash scripts/ecs-deploy-dr-web-local-build.sh

set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
FUL="$ROOT/灵祺达人履约管理后台"
ERP="$ROOT/web版/merchant-erp"
ENV_PROD="$FUL/.env.production"
CS_HOST="${CS_HOST:-admin@8.160.173.236}"
MEOO_API_UPSTREAM="${MEOO_API_UPSTREAM:-https://mofangdianai.com}"

if [[ "$(id -un)" == "root" ]]; then
  echo "请用普通用户在本机执行（非 ECS root）"
  exit 1
fi

echo "== 0) 本机构建履约 DR dist（含 @merchant = CS 源）=="
if [[ "${SKIP_LOCAL_BUILD:-0}" != "1" ]]; then
  if [[ ! -f "$ENV_PROD" ]]; then
    echo "缺少 $ENV_PROD，请从 .env.production.example 复制并填入密钥"
    exit 1
  fi
  if ! grep -qE '^VITE_SUPABASE_ANON_KEY=.+$' "$ENV_PROD"; then
    echo "请在 $ENV_PROD 填入 VITE_SUPABASE_ANON_KEY 后重跑"
    exit 1
  fi
  if [[ ! -d "$ERP/node_modules" ]]; then
    echo "安装商家版依赖（履约嵌入 @merchant 需要）..."
    (cd "$ERP" && npm ci)
  fi
  set -a
  # shellcheck disable=SC1090
  source "$ENV_PROD"
  set +a
  export VITE_APP_EDITION=merchant
  rm -rf "$FUL/dist"
  (cd "$FUL" && npm run build)
else
  echo "SKIP_LOCAL_BUILD=1，跳过本机 npm run build"
fi

if [[ ! -f "$FUL/dist/index.html" ]]; then
  echo "FAIL: 未找到 $FUL/dist/index.html"
  exit 1
fi
echo "OK: 本机 dist $(du -sh "$FUL/dist" | awk '{print $1}')"

echo "== 1) 上传 dist 到新 ECS（rsync）=="
ssh -o ConnectTimeout=25 -o StrictHostKeyChecking=accept-new "$CS_HOST" "mkdir -p ~/app/灵祺达人履约管理后台/dist"
rsync -az --delete \
  -e "ssh -o ConnectTimeout=25 -o StrictHostKeyChecking=accept-new" \
  "$FUL/dist/" \
  "$CS_HOST:~/app/灵祺达人履约管理后台/dist/"
echo "OK: dist 已同步到 $CS_HOST"

echo "== 2) 远程 SKIP_BUILD 部署（仅写配置 + reload nginx）=="
ssh -o ConnectTimeout=25 -o StrictHostKeyChecking=accept-new "$CS_HOST" bash -s <<REMOTE
set -euo pipefail
cd ~/app
if [[ -f scripts/ecs-git-pull-gitee.sh ]]; then
  bash scripts/ecs-git-pull-gitee.sh
fi
echo "HEAD: \$(git log -1 --oneline)"
SKIP_BUILD=1 SKIP_GIT_PULL=1 MEOO_API_UPSTREAM=${MEOO_API_UPSTREAM} \
  bash scripts/ecs-deploy-talent-fulfillment-web.sh
REMOTE

echo ""
echo "完成。验收: curl -sS -o /dev/null -w 'dr_http=%{http_code}\n' https://dr.mofangdianai.com/"
