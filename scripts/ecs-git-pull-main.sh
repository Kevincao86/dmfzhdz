#!/usr/bin/env bash
# ECS 拉取最新代码（main 分支）
#
# 说明：ECS 克隆仓库通常只有 remote「origin」，没有「gitee」。
# Gitee 默认分支可能是 master，开发主分支是 main，须显式 checkout + pull origin main。
#
# 用法：bash ~/app/scripts/ecs-git-pull-main.sh

set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"

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
