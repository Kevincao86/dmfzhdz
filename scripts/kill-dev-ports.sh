#!/usr/bin/env bash
# 释放 ERP/管控台默认端口，避免旧进程仍监听 [::1] 导致 127.0.0.1 拒绝连接。
set -euo pipefail
for port in 5173 5174; do
  pids=$(lsof -nP -iTCP:"$port" -sTCP:LISTEN -t 2>/dev/null || true)
  if [[ -n "${pids}" ]]; then
    echo "端口 ${port} → 结束 PID: ${pids}"
    kill -9 ${pids} || true
  else
    echo "端口 ${port}：无监听"
  fi
done
echo "完成。请重新在两个终端分别运行 ERP / 商家管理后台的 npm run dev。"
echo "自检：lsof -nP -iTCP:5174 -sTCP:LISTEN  应出现 127.0.0.1:5174（勿仅为 [::1]）。"