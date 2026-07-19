#!/usr/bin/env bash
# 履约/星选 Web（dr）发版门禁：dist 主 bundle 必须含「我的推广」入口
# 用法: bash scripts/check-dr-affiliate-menu.sh
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
FUL="$ROOT/灵祺达人履约管理后台"
INDEX="$FUL/dist/index.html"
SRC="$FUL/src/pages/ProfilePage.tsx"

if [[ ! -f "$SRC" ]] || ! grep -q "我的推广" "$SRC"; then
  echo "FAIL: 源码 ProfilePage.tsx 缺少「我的推广」"
  exit 1
fi
if ! grep -q "affiliate/portal" "$SRC"; then
  echo "FAIL: 源码 ProfilePage.tsx 缺少 /affiliate/portal"
  exit 1
fi

if [[ ! -f "$INDEX" ]]; then
  echo "FAIL: 缺少 $INDEX（请先 npm run build）"
  exit 1
fi

BUNDLE_REL="$(grep -oE 'assets/index-[^"]+\.js' "$INDEX" | head -1 || true)"
if [[ -z "$BUNDLE_REL" ]]; then
  echo "FAIL: index.html 未引用 assets/index-*.js"
  exit 1
fi
BUNDLE="$FUL/dist/$BUNDLE_REL"
if [[ ! -f "$BUNDLE" ]]; then
  echo "FAIL: 缺少主 bundle $BUNDLE"
  exit 1
fi

if ! grep -q "我的推广" "$BUNDLE"; then
  echo "FAIL: $BUNDLE_REL 不含「我的推广」——禁止发版，请用当前源码重新 build"
  exit 2
fi
if ! grep -q "affiliate/portal" "$BUNDLE"; then
  echo "FAIL: $BUNDLE_REL 不含 affiliate/portal"
  exit 2
fi

echo "OK: DR dist 含「我的推广」($BUNDLE_REL)"
