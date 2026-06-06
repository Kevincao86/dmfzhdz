#!/usr/bin/env bash
# 轻量 / 国内 ECS：将 git 远程固定为 Gitee（不拉 GitHub）
#
# 用法（admin，在 ~/app 执行一次）:
#   cd ~/app && bash scripts/ecs-setup-git-gitee-only.sh
#
# 私有仓库需令牌时:
#   GITEE_TOKEN=你的令牌 bash scripts/ecs-setup-git-gitee-only.sh

set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"

GITEE_HTTPS="https://gitee.com/linqierp/linqierp.git"
GITEE_SSH="git@gitee.com:linqierp/linqierp.git"

if [[ ! -d .git ]]; then
  echo "FATAL: $ROOT 不是 git 仓库"
  exit 1
fi

pick_gitee_url() {
  if [[ -n "${GITEE_TOKEN:-}" ]]; then
    echo "https://oauth2:${GITEE_TOKEN}@gitee.com/linqierp/linqierp.git"
    return
  fi
  if [[ -n "${GITEE_PAT:-}" ]]; then
    echo "https://oauth2:${GITEE_PAT}@gitee.com/linqierp/linqierp.git"
    return
  fi
  if [[ -f "$HOME/.ssh/id_ed25519" || -f "$HOME/.ssh/id_rsa" ]]; then
    echo "$GITEE_SSH"
    return
  fi
  echo "$GITEE_HTTPS"
}

GITEE_URL="$(pick_gitee_url)"

echo "== 调整前 remotes =="
git remote -v || true
echo ""

# origin 统一指向 Gitee（轻量日常只认 origin + gitee 两个名字，URL 均为 Gitee）
if git remote | grep -qx origin; then
  OLD="$(git remote get-url origin)"
  if [[ "$OLD" == *github.com* ]]; then
    echo "WARN: origin 原为 GitHub，改为 Gitee"
  fi
  git remote set-url origin "$GITEE_URL"
else
  git remote add origin "$GITEE_URL"
fi

if git remote | grep -qx gitee; then
  git remote set-url gitee "$GITEE_URL"
else
  git remote add gitee "$GITEE_URL"
fi

# 移除常见 GitHub 远程名（若存在）
for name in github github-origin origin-github; do
  if git remote | grep -qx "$name"; then
    echo "移除远程 $name（不再拉 GitHub）"
    git remote remove "$name"
  fi
done

BRANCH="${ECS_GIT_BRANCH:-main}"
git fetch gitee "$BRANCH" 2>/dev/null || git fetch origin "$BRANCH"

if git show-ref --verify --quiet "refs/heads/$BRANCH"; then
  git checkout "$BRANCH"
else
  git checkout -b "$BRANCH" "gitee/$BRANCH" 2>/dev/null || git checkout -b "$BRANCH" "origin/$BRANCH"
fi

git branch -u "gitee/$BRANCH" "$BRANCH" 2>/dev/null || git branch -u "origin/$BRANCH" "$BRANCH" 2>/dev/null || true

echo ""
echo "== 调整后 remotes =="
git remote -v
echo ""
echo "OK: 已固定为 Gitee。日常拉代码请执行: bash scripts/ecs-git-pull-gitee.sh"
