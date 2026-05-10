#!/bin/bash
# 双击本文件：用 macOS 终端在项目根执行 npm run dev（同时起 Web ERP + 商家管理后台）
cd "$(dirname "$0")"
export PATH="$HOME/.local/node-current/bin:$PATH"
exec npm run dev
