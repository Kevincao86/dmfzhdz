#!/usr/bin/env bash
# ECS 拉取最新代码（main 分支）
#
# 轻量 139.196.42.5 请用「只拉 Gitee」脚本（勿 git pull gitee / 勿拉 GitHub）:
#   bash ~/app/scripts/ecs-git-pull-gitee.sh
# 首次配置远程: bash ~/app/scripts/ecs-setup-git-gitee-only.sh
#
# 其它 ECS（仅 origin、origin 已是 Gitee 或 GitHub 镜像）:
#   bash ~/app/scripts/ecs-git-pull-main.sh
#
# 强制只拉 Gitee: ECS_GIT_PULL_GITEE_ONLY=1 bash ~/app/scripts/ecs-git-pull-main.sh

set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"

if [[ "${ECS_GIT_PULL_GITEE_ONLY:-}" == "1" ]]; then
  exec bash "$ROOT/scripts/ecs-git-pull-gitee.sh"
fi

if [[ ! -d .git ]]; then
  echo "FATAL: $ROOT 不是 git 仓库"
  exit 1
fi

echo "== remotes =="
git remote -v
echo ""

echo "== 当前分支 =="
git branch -vv || true
echo ""

REMOTE="${ECS_GIT_REMOTE:-origin}"
BRANCH="${ECS_GIT_BRANCH:-main}"

echo "== fetch $REMOTE =="
git fetch "$REMOTE" "$BRANCH"

if git show-ref --verify --quiet "refs/heads/$BRANCH"; then
  git checkout "$BRANCH"
else
  git checkout -b "$BRANCH" "$REMOTE/$BRANCH"
fi

git branch -u "$REMOTE/$BRANCH" "$BRANCH" 2>/dev/null || true

echo "== pull $REMOTE $BRANCH =="
git pull --ff-only "$REMOTE" "$BRANCH" || git pull "$REMOTE" "$BRANCH"

echo ""
echo "== HEAD =="
git log -1 --oneline
echo "OK"
