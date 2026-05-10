#!/bin/bash
# 双击本文件可在 macOS「终端」中启动 ERP 开发服务（会尝试补全 Homebrew 常见 PATH）
cd "$(dirname "$0")" || exit 1
export PATH="/opt/homebrew/bin:/usr/local/bin:$PATH"

if ! command -v npm >/dev/null 2>&1; then
  echo ""
  echo "[错误] 未找到 npm。请先安装 Node.js（含 npm），或把 npm 所在目录加入 PATH。"
  echo "诊断命令（在终端里进入本目录后执行）:"
  echo "  bash scripts/node-env-hint.sh"
  echo ""
  read -r -p "按回车关闭…"
  exit 1
fi

echo "正在安装依赖（若已安装会较快）…"
npm install || { read -r -p "npm install 失败，按回车关闭…"; exit 1; }

echo "正在启动 Vite（http://localhost:5173 ，勿关本窗口）…"
exec npm run dev
