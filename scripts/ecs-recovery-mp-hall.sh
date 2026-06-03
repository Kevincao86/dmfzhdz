#!/usr/bin/env bash
# 招募大厅 + auth-api 一键恢复（ECS 仅 origin，勿 git pull gitee）
# admin: cd ~/app && bash scripts/ecs-recovery-mp-hall.sh

set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"

bash "$ROOT/scripts/ecs-git-pull-main.sh"
bash "$ROOT/scripts/ecs-ensure-auth-api.sh"
bash "$ROOT/scripts/ecs-verify-mp-hall-registry.sh"
