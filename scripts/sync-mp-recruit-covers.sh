#!/usr/bin/env bash
# 小程序专用封面分包（高压缩 JPEG，与星选 Web public/recruit-covers 分离）
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
SRC="${1:-$ROOT/灵祺达人履约管理后台/public/recruit-covers}"
OUT="$ROOT/灵祺达人撮合小程序/packages/recruit-covers-mp"

if [[ ! -d "$SRC/platforms" ]]; then
  echo "用法: bash scripts/sync-mp-recruit-covers.sh [web/public/recruit-covers 目录]"
  exit 1
fi

python3 - "$SRC" "$OUT" <<'PY'
import sys
from pathlib import Path
from PIL import Image

src_root, out_root = Path(sys.argv[1]), Path(sys.argv[2])
TARGET = (500, 400)
JPEG_QUALITY = 48

def process_one(src_file: Path, dest_file: Path) -> int:
    dest_file.parent.mkdir(parents=True, exist_ok=True)
    img = Image.open(src_file).convert("RGB")
    w, h = img.size
    tw, th = TARGET
    scale = max(tw / w, th / h)
    nw, nh = max(1, int(w * scale)), max(1, int(h * scale))
    img = img.resize((nw, nh), Image.Resampling.LANCZOS)
    left = (nw - tw) // 2
    top = (nh - th) // 2
    img = img.crop((left, top, left + tw, top + th))
    img.save(dest_file, "JPEG", quality=JPEG_QUALITY, optimize=True, progressive=True)
    return dest_file.stat().st_size

total = 0
count = 0
for sub in ("platforms", "tags"):
    src_dir = src_root / sub
    if not src_dir.is_dir():
        continue
    for f in sorted(src_dir.glob("*.jpg")) + sorted(src_dir.glob("*.png")):
        if f.suffix.lower() == ".png":
            dest = out_root / sub / f"{f.stem}.jpg"
        else:
            dest = out_root / sub / f.name
        total += process_one(f, dest)
        count += 1
print(f"OK: mp covers {count} files, {total/1024:.0f}KB (q={JPEG_QUALITY}, {TARGET[0]}x{TARGET[1]})")
PY

node "$ROOT/scripts/generate-mp-cover-asset-registry.js"

if [[ "${UPLOAD_OSS:-}" == "1" ]]; then
  node "$ROOT/scripts/upload-mp-recruit-covers-oss.js"
fi

node -e "require('$ROOT/灵祺达人撮合小程序/utils/recruitCoverLibrary.js'); console.log('manifest ok')"
