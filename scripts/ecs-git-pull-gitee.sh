#!/usr/bin/env bash
# 轻量 / 国内 ECS：只从 Gitee 拉 main（不访问 GitHub）
#
# 用法:
#   cd ~/app && bash scripts/ecs-git-pull-gitee.sh
#
# 首次若报无 gitee 远程或 origin 仍是 GitHub:
#   bash scripts/ecs-setup-git-gitee-only.sh
#
# 私有仓库 HTTPS 拉取失败时:
#   GITEE_TOKEN=你的令牌 bash scripts/ecs-git-pull-gitee.sh

set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"

GITEE_HTTPS="https://gitee.com/linqierp/linqierp.git"
GITEE_SSH="git@gitee.com:linqierp/linqierp.git"
BRANCH="${ECS_GIT_BRANCH:-main}"

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

ensure_gitee_remote() {
  local url
  url="$(pick_gitee_url)"

  if git remote | grep -qx gitee; then
    local cur
    cur="$(git remote get-url gitee)"
    if [[ "$cur" == *github.com* ]]; then
      git remote set-url gitee "$url"
    elif [[ -n "${GITEE_TOKEN:-}${GITEE_PAT:-}" && "$cur" != *oauth2* ]]; then
      git remote set-url gitee "$url"
    fi
    return 0
  fi

  local origin_url=""
  if git remote | grep -qx origin; then
    origin_url="$(git remote get-url origin)"
  fi

  if [[ "$origin_url" == *gitee.com* ]]; then
    git remote add gitee "$origin_url"
    return 0
  fi

  if [[ "$origin_url" == *github.com* ]]; then
    echo "WARN: origin 指向 GitHub，自动添加 gitee 远程（不修改 origin，拉取仅用 gitee）"
  fi

  git remote add gitee "$url"
}

ensure_gitee_remote

echo "== remotes =="
git remote -v
echo ""

echo "== fetch gitee ${BRANCH}（不拉 GitHub）=="
git fetch gitee "$BRANCH"

if git show-ref --verify --quiet "refs/heads/$BRANCH"; then
  git checkout "$BRANCH"
else
  git checkout -b "$BRANCH" "gitee/$BRANCH"
fi

git branch -u "gitee/$BRANCH" "$BRANCH" 2>/dev/null || true

# ECS 发版机常有本地 npm build 改动的 dist；默认 hard reset 到 gitee/main，避免 pull 冲突
if [[ "${ECS_GIT_RESET:-1}" == "1" ]]; then
  echo "== reset --hard gitee/$BRANCH（丢弃本地 dist 等改动，ECS_GIT_RESET=0 可关闭）=="
  git reset --hard "gitee/$BRANCH"
else
  echo "== pull gitee $BRANCH =="
  git pull --ff-only gitee "$BRANCH" || git pull gitee "$BRANCH"
fi

echo ""
echo "== HEAD =="
git log -1 --oneline
echo "OK（仅 Gitee）"
