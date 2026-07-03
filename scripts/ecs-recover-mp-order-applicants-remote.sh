#!/usr/bin/env bash
# 轻量远程：恢复指定招募单 applicants（动库）
# 本机: ORDER_ID=MP-RO-xxx bash scripts/ecs-recover-mp-order-applicants-remote.sh
# 先 DRY_RUN: ORDER_ID=MP-RO-xxx DRY_RUN=1 bash scripts/ecs-recover-mp-order-applicants-remote.sh

set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
ORDER_ID="${ORDER_ID:-}"
DRY_RUN="${DRY_RUN:-}"
ECS_HOST="${ECS_HOST:-admin@139.196.42.5}"

if [[ -z "$ORDER_ID" ]]; then
  echo "用法: ORDER_ID=MP-RO-xxx [DRY_RUN=1] bash scripts/ecs-recover-mp-order-applicants-remote.sh"
  exit 1
fi

echo "== 轻量部署前本机冒烟 =="
bash "$ROOT/scripts/ecs-pre-light-deploy-test.sh"

echo "== 远程拉代码 =="
ssh "$ECS_HOST" "cd ~/app && bash scripts/ecs-git-pull-gitee.sh"

echo "== 恢复订单报名 DRY_RUN=${DRY_RUN:-0} =="
ssh "$ECS_HOST" "cd ~/app && ORDER_ID='$ORDER_ID' DRY_RUN='$DRY_RUN' node scripts/ecs-recover-mp-order-applicants.mjs"

if [[ "$DRY_RUN" == "1" ]]; then
  echo "DRY_RUN 完成。确认无误后去掉 DRY_RUN=1 再执行一次，然后: bash scripts/ecs-deploy-light-safe.sh --remote"
  exit 0
fi

echo "== 重启 auth-api =="
ssh "$ECS_HOST" "cd ~/app && bash scripts/ecs-deploy-auth-api.sh"

echo "== 只读验收 =="
curl -sS "http://139.196.42.5/erp-api/meoo-erp-api-health" | head -c 200
echo ""
