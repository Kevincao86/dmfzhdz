#!/usr/bin/env bash
# 在仓库根目录「项目」下执行：一键压缩撮合小程序图片
set -euo pipefail
HERE="$(cd "$(dirname "$0")/.." && pwd)"
MP="$HERE/灵祺达人撮合小程序"
if [[ ! -d "$MP/scripts" ]]; then
  echo "找不到 $MP"
  echo "请确认在灵祺/项目 目录下执行: bash scripts/mp-miniprogram-media-fix.sh"
  exit 1
fi
bash "$MP/scripts/mp-compress-orbit-images.sh"
