#!/usr/bin/env bash
# ECS 一键拉代码并重启 meoo-auth-api（数字人口播链接解析等 /erp-api 路由）
# 在 ECS 上执行：cd ~/app && bash scripts/ecs-deploy-auth-api.sh

set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"

if [[ -f "$ROOT/scripts/ecs-git-pull-gitee.sh" ]]; then
  bash "$ROOT/scripts/ecs-git-pull-gitee.sh"
else
  bash "$ROOT/scripts/ecs-git-pull-main.sh"
fi
bash "$ROOT/scripts/ecs-fix-erp-api-502.sh"

echo ""
echo "完成。可在本机验证："
echo "  curl -sS https://mofangdianai.com/erp-api/meoo-erp-api-health | head -c 200"
