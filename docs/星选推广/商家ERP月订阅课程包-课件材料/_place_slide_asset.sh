#!/usr/bin/env bash
# usage: _place_slide_asset.sh <lesson_dir> <slide_file> <asset_filename>
set -euo pipefail
lesson_dir="$1"
slide_file="$2"
asset_name="$3"
assets="/Users/damowang/.cursor/projects/Volumes-OS-Users-damowangOS-AI-ERP/assets"
dest="$lesson_dir/slides/$slide_file"
mkdir -p "$lesson_dir/slides"
if [[ -f "$assets/$asset_name" ]]; then
  cp "$assets/$asset_name" "$dest"
elif [[ -f "$assets/$slide_file" ]]; then
  cp "$assets/$slide_file" "$dest"
else
  # newest png matching
  f=$(ls -t "$assets"/*"$slide_file" "$assets/$asset_name" 2>/dev/null | head -1 || true)
  [[ -n "${f:-}" && -f "$f" ]] && cp "$f" "$dest" || { echo "missing $asset_name"; exit 1; }
fi
ls -la "$dest"
