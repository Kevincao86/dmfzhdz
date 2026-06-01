#!/usr/bin/env bash
# 一次性配置：让 Cursor Agent 能自动 git push 到 GitHub + Gitee（无需每次手动操作）
#
# 用法（在本机 Mac 终端执行一次）:
#   cd "/Volumes/大魔王的OS/Users/damowangOS/灵祺AI智能ERP_迁移/灵祺/项目"
#   bash scripts/setup-git-push-once.sh

set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
ENV_FILE="$ROOT/.cursor/git-push.local.env"
EXAMPLE="$ROOT/.cursor/git-push.local.env.example"

mkdir -p "$ROOT/.cursor"

if [[ ! -f "$EXAMPLE" ]]; then
  cat >"$EXAMPLE" <<'EOF'
# 复制为 git-push.local.env 并填入 Token（勿提交 git）
# GitHub: Settings → Developer settings → Personal access tokens → fine-grained 或 classic (repo)
GITHUB_TOKEN=

# Gitee: 设置 → 私人令牌 → 勾选 projects
GITEE_TOKEN=

# 可选：专用 SSH 私钥路径（不用 Token 时）
# GIT_SSH_KEY=$HOME/.ssh/id_ed25519_linqierp
EOF
fi

if [[ -f "$ENV_FILE" ]]; then
  echo "已存在 $ENV_FILE"
  echo "若需重配，请先删除该文件再运行本脚本"
  exit 0
fi

cp "$EXAMPLE" "$ENV_FILE"
chmod 600 "$ENV_FILE"

echo "已创建 $ENV_FILE"
echo ""
echo "请用编辑器打开并填入："
echo "  1) GITHUB_TOKEN  — GitHub PAT（需 repo 权限）"
echo "  2) GITEE_TOKEN   — Gitee 私人令牌"
echo ""
echo "保存后测试："
echo "  bash scripts/git-push-both.sh"
echo ""
echo "可选：在 GitHub 仓库 Settings → Secrets 添加 GITEE_PRIVATE_TOKEN，"
echo "      则 push 到 GitHub 后会由 Actions 自动镜像到 Gitee（见 .github/workflows/mirror-gitee.yml）"
