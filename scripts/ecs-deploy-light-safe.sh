#!/usr/bin/env bash
# 轻量安全部署：仅 git pull + 重启 auth-api，不写数据库
#
# ECS admin:
#   cd ~/app && bash scripts/ecs-deploy-light-safe.sh
#
# 本机 SSH（需免密）:
#   ECS_HOST=admin@139.196.42.5 bash scripts/ecs-deploy-light-safe.sh --remote

set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"

run_deploy() {
  if [[ -f "$ROOT/scripts/ecs-git-pull-gitee.sh" ]]; then
    bash "$ROOT/scripts/ecs-git-pull-gitee.sh"
  else
    bash "$ROOT/scripts/ecs-git-pull-main.sh"
  fi
  bash "$ROOT/scripts/ecs-deploy-auth-api.sh"
  echo ""
  echo "OK: 仅部署完成（未写数据库）。只读验收:"
  echo '  curl -sS "http://127.0.0.1:3001/api/meoo-erp-api-health"'
}

if [[ "${1:-}" == "--remote" ]]; then
  echo "== 轻量部署前本机冒烟 =="
  bash "$ROOT/scripts/ecs-pre-light-deploy-test.sh"
  ECS_HOST="${ECS_HOST:-admin@139.196.42.5}"
  echo "远程执行 → $ECS_HOST"
  ssh "$ECS_HOST" 'bash -s' < "$ROOT/scripts/ecs-deploy-light-safe.sh"
else
  run_deploy
fi
