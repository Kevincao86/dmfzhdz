#!/usr/bin/env bash
# 不依赖 npm；在项目根执行: bash scripts/node-env-hint.sh
set +e
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]:-$0}")/.." && pwd)"
cd "$ROOT" || exit 1
echo ""
echo "=== merchant-erp 环境诊断（墨典）==="
echo "项目目录: $ROOT"
echo ""

echo "当前 shell 中的命令:"
echo "  node: $(command -v node 2>/dev/null || echo '未找到')"
echo "  npm:  $(command -v npm 2>/dev/null || echo '未找到')"
echo ""

echo "常见安装位置探测:"
for candidate in \
  /opt/homebrew/bin/npm \
  /opt/homebrew/bin/node \
  /usr/local/bin/npm \
  /usr/local/bin/node \
  "$HOME/.volta/bin/npm" \
  "$HOME/.fnm/fnm" \
  "$HOME/.nvm/nvm.sh"
do
  if [[ -e "$candidate" ]]; then
    echo "  存在: $candidate"
  fi
done
echo ""

echo "若上面 npm 为「未找到」，请任选其一："
echo "  1) 安装 Node.js LTS（含 npm）: https://nodejs.org/zh-cn/download/"
echo "  2) Apple 芯片 + 已用 Homebrew 装 node，在本终端先执行:"
echo "       export PATH=\"/opt/homebrew/bin:\$PATH\""
echo "  3) 使用 nvm 时，在本终端先执行:"
echo "       source \"\$HOME/.nvm/nvm.sh\""
echo ""
echo "装好后在本目录执行: npm install && npm run dev"
echo ""
