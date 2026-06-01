#!/usr/bin/env bash
# 推送 main 到 GitHub (origin) 与 Gitee (gitee)。
# 一次性配置见 scripts/setup-git-push-once.sh
#
# 用法（Agent 改完代码后）:
#   bash scripts/git-push-both.sh

set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"

ENV_FILE="$ROOT/.cursor/git-push.local.env"
if [[ -f "$ENV_FILE" ]]; then
  # shellcheck disable=SC1090
  source "$ENV_FILE"
fi

BRANCH="${GIT_PUSH_BRANCH:-main}"

if ! git rev-parse --git-dir >/dev/null 2>&1; then
  echo "FATAL: 不在 git 仓库内"
  exit 1
fi

if [[ -n "$(git status --porcelain)" ]]; then
  echo "WARN: 工作区有未提交改动，请先 commit"
  git status -sb
  exit 1
fi

echo "当前 HEAD:"
git log -1 --oneline

push_one() {
  local remote="$1"
  local url="$2"
  echo "==> push $remote ($BRANCH)"
  if [[ -n "$url" ]]; then
    git push "$url" "HEAD:refs/heads/$BRANCH"
  else
    git push "$remote" "$BRANCH"
  fi
}

push_ssh() {
  local remote="$1"
  if ((${#SSH_OPTS[@]})); then
    GIT_SSH_COMMAND="ssh ${SSH_OPTS[*]}" git push "$remote" "$BRANCH"
  else
    git push "$remote" "$BRANCH"
  fi
}

# HTTPS Token（优先，Agent 环境通常无 SSH agent）
ORIGIN_URL=""
GITEE_URL=""
if [[ -n "${GITHUB_TOKEN:-}" ]]; then
  ORIGIN_URL="https://x-access-token:${GITHUB_TOKEN}@github.com/Kevincao86/dmfzhdz.git"
elif [[ -n "${GITHUB_PAT:-}" ]]; then
  ORIGIN_URL="https://x-access-token:${GITHUB_PAT}@github.com/Kevincao86/dmfzhdz.git"
fi
if [[ -n "${GITEE_TOKEN:-}" ]]; then
  GITEE_URL="https://oauth2:${GITEE_TOKEN}@gitee.com/linqierp/linqierp.git"
elif [[ -n "${GITEE_PAT:-}" ]]; then
  GITEE_URL="https://oauth2:${GITEE_PAT}@gitee.com/linqierp/linqierp.git"
fi

SSH_OPTS=()
if [[ -n "${GIT_SSH_KEY:-}" && -f "$GIT_SSH_KEY" ]]; then
  SSH_OPTS=(-i "$GIT_SSH_KEY" -o IdentitiesOnly=yes -o StrictHostKeyChecking=accept-new)
fi

FAIL=0

if [[ -n "$ORIGIN_URL" ]]; then
  push_one origin "$ORIGIN_URL" || FAIL=1
else
  push_ssh origin || FAIL=1
fi

if [[ -n "$GITEE_URL" ]]; then
  push_one gitee "$GITEE_URL" || FAIL=1
else
  push_ssh gitee || FAIL=1
fi

if [[ "$FAIL" != "0" ]]; then
  echo ""
  echo "推送失败。若 Agent 报 Permission denied (publickey)，请执行一次:"
  echo "  bash scripts/setup-git-push-once.sh"
  exit 1
fi

echo "OK: 已推送到 origin 与 gitee ($BRANCH)"
