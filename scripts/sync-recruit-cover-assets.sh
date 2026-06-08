#!/usr/bin/env bash
# 将封面同步到星选 Web public/recruit-covers（JPEG）；小程序走 CDN 不打包
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
SRC="${1:-$ROOT/.recruit-covers-staging}"
WEB="$ROOT/灵祺达人履约管理后台/public/recruit-covers"
MERCHANT_PUBLIC="$ROOT/web版/merchant-erp/public/recruit-covers"
MP_PLAT="$ROOT/灵祺达人撮合小程序/packages/recruit-covers-platforms"
MP_TAGS1="$ROOT/灵祺达人撮合小程序/packages/recruit-covers-tags-1"
MP_TAGS2="$ROOT/灵祺达人撮合小程序/packages/recruit-covers-tags-2"
TAGS1_SLUGS="meishi muying jiaju shenghuo meizhuang jiankang yundong jiaoyu sheying lvyou wenhua xingqu shuma"
ASSETS="${CURSOR_ASSETS:-$HOME/.cursor/projects/Volumes-OS-Data-Users-damowangOS-AI-ERP/assets}"

if [[ ! -d "$SRC" ]]; then
  echo "用法: bash scripts/sync-recruit-cover-assets.sh [源目录]"
  exit 1
fi

mkdir -p "$SRC/platforms" "$SRC/tags" "$WEB/platforms" "$WEB/tags" "$MERCHANT_PUBLIC/platforms" "$MERCHANT_PUBLIC/tags"
mkdir -p "$MP_PLAT/platforms" "$MP_TAGS1/tags" "$MP_TAGS2/tags"

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

python3 - "$SRC" "$WEB" "$MERCHANT_PUBLIC" "$MP_PLAT" "$MP_TAGS1" "$MP_TAGS2" "$TAGS1_SLUGS" <<'PY'
import sys
from pathlib import Path
from PIL import Image

src, web, merchant, mp_plat, mp_tags1, mp_tags2, tags1_raw = sys.argv[1:8]
src, web, merchant = Path(src), Path(web), Path(merchant)
mp_plat, mp_tags1, mp_tags2 = Path(mp_plat), Path(mp_tags1), Path(mp_tags2)
tags1 = set(tags1_raw.split())
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

def mp_dest(sub: str, stem: str) -> Path:
    if sub == "platforms":
        return mp_plat / sub / f"{stem}.jpg"
    slug = stem.split("-")[0]
    root = mp_tags1 if slug in tags1 else mp_tags2
    return root / sub / f"{stem}.jpg"

count = 0
for sub in ("platforms", "tags"):
    src_dir = src / sub
    if not src_dir.is_dir():
        continue
    for f in sorted(src_dir.glob("*.png")):
        stem = f.stem
        for root in (web, merchant):
            old_png = root / sub / f"{stem}.png"
            if old_png.is_file():
                old_png.unlink()
            process_one(f, root / sub / f"{stem}.jpg")
        process_one(f, mp_dest(sub, stem))
        count += 1
print(f"processed {count} images -> JPEG q={JPEG_QUALITY}")
PY

python3 "$ROOT/scripts/generate-recruit-cover-library.py" --manifest-only
node -e "require('$ROOT/灵祺达人撮合小程序/utils/recruitCoverLibrary.js'); console.log('manifest ok')"

echo "OK: web platforms=$(ls "$WEB/platforms"/*.jpg 2>/dev/null | wc -l | tr -d ' ') tags=$(ls "$WEB/tags"/*.jpg 2>/dev/null | wc -l | tr -d ' ') merchant=$(ls "$MERCHANT_PUBLIC/platforms"/*.jpg 2>/dev/null | wc -l | tr -d ' ') mp_plat=$(ls "$MP_PLAT/platforms"/*.jpg 2>/dev/null | wc -l | tr -d ' ') mp_tags1=$(ls "$MP_TAGS1/tags"/*.jpg 2>/dev/null | wc -l | tr -d ' ') mp_tags2=$(ls "$MP_TAGS2/tags"/*.jpg 2>/dev/null | wc -l | tr -d ' ')"
