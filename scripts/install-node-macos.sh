#!/usr/bin/env bash
# 在 macOS「终端.app」中执行（不要在 Cursor Agent 沙箱里跑）：一键安装 Node LTS 官方二进制到 ~/.local，并写入 ~/.zshrc PATH。
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(cd "${SCRIPT_DIR}/.." && pwd)"

NODE_VER="${NODE_VER:-22.15.0}"
ARCH="$(uname -m)"
case "$ARCH" in
  arm64) TARCH="arm64" ;;
  x86_64) TARCH="x64" ;;
  *) echo "不支持的架构: $ARCH" >&2; exit 1 ;;
esac

LOCAL_ROOT="${HOME}/.local"
PKG="node-v${NODE_VER}-darwin-${TARCH}"
TARBALL="/tmp/${PKG}.tar.gz"
URL="https://nodejs.org/dist/v${NODE_VER}/${PKG}.tar.gz"

echo "→ 下载 Node ${NODE_VER} (${TARCH}) …"
curl -fsSL --connect-timeout 30 --retry 3 --retry-delay 2 -o "$TARBALL" "$URL"

echo "→ 解压到 ${LOCAL_ROOT} …"
mkdir -p "$LOCAL_ROOT"
rm -rf "${LOCAL_ROOT}/${PKG}"
tar -xzf "$TARBALL" -C "$LOCAL_ROOT"
ln -sfn "${LOCAL_ROOT}/${PKG}" "${LOCAL_ROOT}/node-current"

ZMARK_BEGIN="# >>> 灵祺 Node (install-node-macos.sh) >>>"
ZMARK_END="# <<< 灵祺 Node <<<"
BLOCK="${ZMARK_BEGIN}
export PATH=\"\${HOME}/.local/node-current/bin:\${PATH}\"
${ZMARK_END}"

touch "${HOME}/.zshrc"
if grep -qF "$ZMARK_BEGIN" "${HOME}/.zshrc" 2>/dev/null; then
  echo "→ ~/.zshrc 中已存在 PATH 配置，跳过写入。"
else
  echo "" >> "${HOME}/.zshrc"
  echo "$BLOCK" >> "${HOME}/.zshrc"
  echo "→ 已追加 PATH 到 ~/.zshrc"
fi

echo ""
echo "安装完成。请执行其一："
echo "  source ~/.zshrc"
echo "  或关掉终端窗口再开一个新的"
echo ""
"${LOCAL_ROOT}/node-current/bin/node" -v
"${LOCAL_ROOT}/node-current/bin/npm" -v
echo ""
echo "然后可运行："
echo "  cd \"${PROJECT_ROOT}\" && npm run supabase:start"
