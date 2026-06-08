#!/usr/bin/env bash
# 将封面 PNG 同步到小程序 assets 与履约 Web public，并压缩为 750×600
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
SRC="${1:-$ROOT/.recruit-covers-staging}"
MP="$ROOT/灵祺达人撮合小程序/assets/recruit-covers"
WEB="$ROOT/灵祺达人履约管理后台/public/recruit-covers"
ASSETS="${CURSOR_ASSETS:-$HOME/.cursor/projects/Volumes-OS-Data-Users-damowangOS-AI-ERP/assets}"

if [[ ! -d "$SRC" ]]; then
  echo "用法: bash scripts/sync-recruit-cover-assets.sh [源目录]"
  exit 1
fi

mkdir -p "$SRC/platforms" "$SRC/tags" "$MP/platforms" "$MP/tags" "$WEB/platforms" "$WEB/tags"

# 合并 cursor assets 里已生成的命名文件
if [[ -d "$ASSETS" ]]; then
  for f in "$ASSETS"/*.png; do
    [[ -f "$f" ]] || continue
    base="$(basename "$f")"
    case "$base" in
      douyin-*|xiaohongshu-*|dianping-*|kuaishou-*|channels-*)
        cp -f "$f" "$SRC/platforms/$base" 2>/dev/null || true
        ;;
      meishi-*|muying-*|jiaju-*|shenghuo-*|meizhuang-*|jiankang-*|yundong-*|jiaoyu-*|sheying-*|lvyou-*|wenhua-*|xingqu-*|shuma-*|yingshi-*|chongwu-*|qinggan-*|gaoxiao-*|yule-*|qiche-*|caijing-*|youxi-*|minsheng-*|tiyu-*|zhishi-*|qita-*)
        cp -f "$f" "$SRC/tags/$base" 2>/dev/null || true
        ;;
    esac
  done
fi

python3 - "$SRC" "$MP" "$WEB" <<'PY'
import sys
from pathlib import Path
from PIL import Image

src, mp, web = Path(sys.argv[1]), Path(sys.argv[2]), Path(sys.argv[3])
TARGET = (750, 600)
JPEG_QUALITY = 72

def process_one(src_file: Path, dest_file: Path) -> None:
    dest_file.parent.mkdir(parents=True, exist_ok=True)
    img = Image.open(src_file).convert("RGB")
    w, h = img.size
    scale = min(TARGET[0] / w, TARGET[1] / h)
    nw, nh = max(1, int(w * scale)), max(1, int(h * scale))
    img = img.resize((nw, nh), Image.Resampling.LANCZOS)
    canvas = Image.new("RGB", TARGET, (18, 18, 24))
    ox = (TARGET[0] - nw) // 2
    oy = (TARGET[1] - nh) // 2
    canvas.paste(img, (ox, oy))
    canvas.save(dest_file, "JPEG", quality=JPEG_QUALITY, optimize=True, progressive=True)

count = 0
for sub in ("platforms", "tags"):
    src_dir = src / sub
    if not src_dir.is_dir():
        continue
    for f in sorted(src_dir.glob("*.png")):
        stem = f.stem
        for root in (mp, web):
            old_png = root / sub / f"{stem}.png"
            if old_png.is_file():
                old_png.unlink()
        dest = mp / sub / f"{stem}.jpg"
        process_one(f, dest)
        process_one(f, web / sub / f"{stem}.jpg")
        count += 1
print(f"processed {count} images -> JPEG q={JPEG_QUALITY}")
PY

# 仅刷新 manifest，勿用 PIL 重绘覆盖 AI 图
python3 "$ROOT/scripts/generate-recruit-cover-library.py" --manifest-only
node -e "require('$ROOT/灵祺达人撮合小程序/utils/recruitCoverLibrary.js'); console.log('manifest ok')" 

echo "OK: mp platforms=$(ls "$MP/platforms"/*.jpg 2>/dev/null | wc -l | tr -d ' ') tags=$(ls "$MP/tags"/*.jpg 2>/dev/null | wc -l | tr -d ' ')"
