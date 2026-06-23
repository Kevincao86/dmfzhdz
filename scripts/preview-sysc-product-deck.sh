#!/usr/bin/env bash
# 本机预览 sysc 产品介绍动态演示站
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
DECK="$ROOT/docs/灵祺商家ERP"
PORT="${SYSC_DECK_PREVIEW_PORT:-8765}"

if [[ ! -f "$DECK/index.html" ]]; then
  echo "FAIL: 缺少 $DECK/index.html"
  exit 1
fi

if lsof -i ":${PORT}" -sTCP:LISTEN >/dev/null 2>&1; then
  echo "WARN: 端口 ${PORT} 已被占用，尝试释放…"
  lsof -ti ":${PORT}" | xargs kill 2>/dev/null || true
  sleep 0.5
fi

echo "本地预览: http://127.0.0.1:${PORT}/"
echo "  动态翻页演示（默认）"
echo "  长页滚动: http://127.0.0.1:${PORT}/?scroll=1"
echo "  快捷键: ← → / 空格翻页 · O 目录 · F 全屏"
echo "Ctrl+C 停止"
cd "$DECK"
exec python3 -m http.server "$PORT"
