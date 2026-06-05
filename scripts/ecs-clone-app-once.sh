#!/usr/bin/env bash
# 新 ECS / 轻量：首次克隆 linqierp（admin 用户 ~/app）
#
# 用法（在 ECS 上，root 或 admin）：
#   bash ecs-clone-app-once.sh
#
# 方式 A — Gitee 私人令牌（推荐，与 scripts/git-push-both.sh 相同令牌）：
#   GITEE_TOKEN=你的令牌 bash ecs-clone-app-once.sh
#
# 方式 B — 已配置 admin 的 ~/.ssh/id_ed25519 且 Gitee 已加 Deploy Key：
#   直接 bash ecs-clone-app-once.sh
#
# 方式 C — 交互输入（勿用 su -c 包一层）：
#   su - admin
#   git clone https://gitee.com/linqierp/linqierp.git ~/app

set -euo pipefail

APP_DIR="${ECS_APP_DIR:-/home/admin/app}"
REPO_SSH="git@gitee.com:linqierp/linqierp.git"
REPO_HTTPS="https://gitee.com/linqierp/linqierp.git"

run_as_admin() {
  if [[ "$(id -un)" == "admin" ]]; then
    "$@"
  else
    su - admin -c "$(printf '%q ' "$@")"
  fi
}

if [[ -d "$APP_DIR/.git" ]]; then
  echo "已有仓库 $APP_DIR，执行 pull..."
  run_as_admin bash -lc "cd '$APP_DIR' && git fetch origin main && git checkout main && git pull --ff-only origin main || git pull origin main"
  run_as_admin bash -lc "cd '$APP_DIR' && git log -1 --oneline"
  exit 0
fi

CLONE_URL=""
if [[ -n "${GITEE_TOKEN:-}" ]]; then
  CLONE_URL="https://oauth2:${GITEE_TOKEN}@gitee.com/linqierp/linqierp.git"
elif [[ -n "${GITEE_PAT:-}" ]]; then
  CLONE_URL="https://oauth2:${GITEE_PAT}@gitee.com/linqierp/linqierp.git"
elif run_as_admin test -f /home/admin/.ssh/id_ed25519 || run_as_admin test -f /home/admin/.ssh/id_rsa; then
  CLONE_URL="$REPO_SSH"
else
  echo "未配置 GITEE_TOKEN，且 admin 无 SSH 公钥。"
  echo ""
  echo "请任选一种："
  echo "  1) GITEE_TOKEN=xxx bash $0"
  echo "  2) su - admin  进入交互 shell 后: git clone $REPO_HTTPS ~/app"
  echo "  3) 在 admin 下生成 SSH 密钥并加到 Gitee → 仓库 → 管理 → 部署公钥"
  exit 1
fi

run_as_admin mkdir -p "$(dirname "$APP_DIR")"
run_as_admin git clone "$CLONE_URL" "$APP_DIR"
run_as_admin bash -lc "cd '$APP_DIR' && git checkout main 2>/dev/null || git checkout -b main origin/main"
run_as_admin bash -lc "cd '$APP_DIR' && git log -1 --oneline"
echo "OK: $APP_DIR"
