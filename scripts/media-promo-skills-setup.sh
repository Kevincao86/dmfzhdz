#!/usr/bin/env bash
# 安装「做图 / 宣传视频」相关上游 Skills 到 tools/（已 gitignore）
# 用法（仓库根）:
#   bash scripts/media-promo-skills-setup.sh
#
# 装完后 Cursor 薄包装在 .cursor/skills/：
#   seedance-product-video / seedance2-prompt / seedance2-creative / ai-image-prompts

set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
TOOLS="$ROOT/tools"
mkdir -p "$TOOLS"

need_cmd() {
  if ! command -v "$1" >/dev/null 2>&1; then
    echo "缺少依赖: $1" >&2
    exit 1
  fi
}

need_cmd curl
need_cmd unzip

install_zip() {
  local name="$1" zip_url="$2" marker="$3" dest="$4"
  local tmp zipf extracted

  if [[ -f "$dest/$marker" ]]; then
    echo "==> 已存在 $name，跳过下载（删目录可重装）: $dest"
    return 0
  fi

  echo "==> 安装 $name → $dest"
  tmp="$(mktemp -d)"
  zipf="$tmp/skill.zip"
  curl -L --connect-timeout 30 --max-time 600 -o "$zipf" "$zip_url" || {
    echo "下载失败: $zip_url" >&2
    rm -rf "$tmp"
    return 1
  }
  unzip -q "$zipf" -d "$tmp"
  extracted="$(find "$tmp" -maxdepth 1 -mindepth 1 -type d ! -name '.*' | head -1)"
  if [[ -z "$extracted" || ! -f "$extracted/$marker" ]]; then
    echo "解压失败或缺少 $marker: $name" >&2
    rm -rf "$tmp"
    return 1
  fi
  rm -rf "$dest"
  mv "$extracted" "$dest"
  rm -rf "$tmp"
  echo "    OK: $dest/$marker"
}

# 1) 产品宣传 15s Motion Graphics Prompt（即梦 Seedance）
install_zip \
  "Seedance-Product-Video" \
  "https://codeload.github.com/op7418/Seedance-Product-Video/zip/refs/heads/main" \
  "SKILL.md" \
  "$TOOLS/Seedance-Product-Video"

# 2) Seedance 2.0 通用提示词工程（高星）
install_zip \
  "seedance2-prompt (dexhunter)" \
  "https://codeload.github.com/dexhunter/seedance2-skill/zip/refs/heads/main" \
  "SKILL.md" \
  "$TOOLS/seedance2-prompt-skill"

# 3) Seedance2 创意词库 + API CLI
install_zip \
  "Seedance2-skill (creative)" \
  "https://codeload.github.com/zhanghaonan777/Seedance2-skill/zip/refs/heads/main" \
  "SKILL.md" \
  "$TOOLS/Seedance2-skill"

# 4) 做图 Prompt 库（体积较大，失败可重试）
install_zip \
  "ai-image-prompts-skill" \
  "https://codeload.github.com/YouMind-OpenLab/ai-image-prompts-skill/zip/refs/heads/main" \
  "SKILL.md" \
  "$TOOLS/ai-image-prompts-skill" || {
    echo "警告: ai-image-prompts-skill 下载失败（仓库较大）。可稍后重跑本脚本。" >&2
  }

echo ""
echo "OK: 宣传/做图 skills 上游已就绪（薄包装见 .cursor/skills/）"
echo "  tools/Seedance-Product-Video"
echo "  tools/seedance2-prompt-skill"
echo "  tools/Seedance2-skill"
echo "  tools/ai-image-prompts-skill  （若上面报警告则未装齐）"
echo "剪映 / OpenMontage 请分别跑："
echo "  bash scripts/jianying-editor-setup.sh"
echo "  bash scripts/openmontage-setup.sh"
