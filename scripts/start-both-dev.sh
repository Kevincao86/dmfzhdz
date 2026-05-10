#!/usr/bin/env bash
# 在 macOS「终端.app」中运行（会尝试释放 5173/5174 再启动两个 Vite）。
set -euo pipefail
export PATH="${HOME}/.local/node-current/bin:${PATH}"
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
ERP="${ROOT}/web版/merchant-erp"
ADM="${ROOT}/商家管理后台"

echo "→ 尝试释放 5173 / 5174 …"
bash "${ROOT}/scripts/kill-dev-ports.sh" || true
sleep 1

still=""
for p in 5173 5174; do
  if lsof -nP -iTCP:"$p" -sTCP:LISTEN >/dev/null 2>&1; then
    still="${still} ${p}"
  fi
done
if [[ -n "${still}" ]]; then
  echo ""
  echo "错误：端口${still} 仍被占用，Cursor 或当前环境无法替你 kill。"
  echo "请在本机终端执行（把 PID 换成 lsof 看到的）："
  echo "  lsof -nP -iTCP:5173 -sTCP:LISTEN"
  echo "  lsof -nP -iTCP:5174 -sTCP:LISTEN"
  echo "  kill -9 <PID>"
  echo "然后重新运行： bash ${ROOT}/scripts/start-both-dev.sh"
  exit 1
fi

echo "→ 启动 Web ERP（5173）…"
(cd "${ERP}" && npm run dev) &
PID_ERP=$!

echo "→ 启动商家管理后台（5174）…"
(cd "${ADM}" && npm run dev) &
PID_ADM=$!

echo ""
echo "已后台启动：ERP PID=${PID_ERP}，管控台 PID=${PID_ADM}"
echo "  Web ERP：      http://127.0.0.1:5173/"
echo "  商家管理后台： http://127.0.0.1:5174/customers"
echo ""
echo "停止： kill ${PID_ERP} ${PID_ADM}"
echo "若浏览器打不开 127.0.0.1，可试 http://localhost:5174/customers"
wait
