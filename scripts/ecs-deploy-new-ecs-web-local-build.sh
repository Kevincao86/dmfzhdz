#!/usr/bin/env bash
# 新ECS 前端一键：本机构建 cs + fws 并部署（禁止在新ECS 上 npm build）
#
#   bash scripts/ecs-deploy-new-ecs-web-local-build.sh

set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"

echo "======== 新ECS：本机构建部署 cs ========"
bash "$ROOT/scripts/ecs-deploy-cs-web-local-build.sh"
echo ""
echo "======== 新ECS：本机构建部署 fws ========"
bash "$ROOT/scripts/ecs-deploy-fws-web-local-build.sh"
echo ""
echo "OK: cs + fws 均已本机构建并部署到新ECS"
curl -sS -o /dev/null -w 'cs_http=%{http_code}\n' https://cs.mofangdianai.com/ || true
curl -sS -o /dev/null -w 'fws_http=%{http_code}\n' https://fws.mofangdianai.com/ || true
curl -sS "https://cs.mofangdianai.com/api/meoo-erp-client-config" | head -c 200 || true
echo
