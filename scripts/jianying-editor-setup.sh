#!/usr/bin/env bash
# 本机安装 / 更新 jianying-editor-skill（默认 tools/jianying-editor-skill，已 gitignore）
# 用法（仓库根）:
#   bash scripts/jianying-editor-setup.sh
#   JIANYING_SKILL_HOME=/path bash scripts/jianying-editor-setup.sh

set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
HOME_DIR="${JIANYING_SKILL_HOME:-"$ROOT/tools/jianying-editor-skill"}"
REPO_URL="${JIANYING_REPO_URL:-https://github.com/luoluoluo22/jianying-editor-skill.git}"
ZIP_URL="${JIANYING_ZIP_URL:-https://codeload.github.com/luoluoluo22/jianying-editor-skill/zip/refs/heads/main}"

echo "==> Jianying skill home: $HOME_DIR"

need_cmd() {
  if ! command -v "$1" >/dev/null 2>&1; then
    echo "缺少依赖: $1" >&2
    exit 1
  fi
}

pick_python() {
  local c
  for c in "${JIANYING_PYTHON:-}" python3.12 python3.11 python3.10 python3; do
    [[ -z "$c" ]] && continue
    if command -v "$c" >/dev/null 2>&1; then
      if "$c" -c 'import sys; raise SystemExit(0 if sys.version_info[:2] >= (3, 10) else 1)' 2>/dev/null; then
        echo "$c"
        return 0
      fi
    fi
  done
  return 1
}

need_cmd git
need_cmd curl
need_cmd unzip

if ! command -v ffmpeg >/dev/null 2>&1; then
  echo "警告: 未检测到 ffmpeg。部分素材探测/转码会失败；macOS: brew install ffmpeg" >&2
fi

PY="$(pick_python || true)"
if [[ -z "${PY:-}" ]]; then
  echo "缺少 Python 3.10+。请安装后重试（如: brew install python@3.12）。" >&2
  exit 1
fi
echo "==> Python: $PY ($("$PY" -c 'import sys; print("%d.%d"%sys.version_info[:2])'))"

mkdir -p "$(dirname "$HOME_DIR")"
mkdir -p "$ROOT/tools/jianying-jobs"

install_from_zip() {
  local tmp zipf extracted
  tmp="$(mktemp -d)"
  zipf="$tmp/jianying-editor-skill.zip"
  echo "==> 下载 zipball: $ZIP_URL"
  curl -L --connect-timeout 30 --max-time 900 -o "$zipf" "$ZIP_URL"
  unzip -q "$zipf" -d "$tmp"
  extracted="$(find "$tmp" -maxdepth 1 -type d -name 'jianying-editor-skill-*' | head -1)"
  if [[ -z "$extracted" || ! -f "$extracted/SKILL.md" ]]; then
    echo "zip 解压失败或缺少 SKILL.md" >&2
    rm -rf "$tmp"
    exit 1
  fi
  rm -rf "$HOME_DIR"
  mv "$extracted" "$HOME_DIR"
  rm -rf "$tmp"
  echo "==> zip 安装完成"
}

if [[ -d "$HOME_DIR/.git" ]]; then
  echo "==> 已存在 git 仓库，尝试 fast-forward 更新"
  git -C "$HOME_DIR" pull --ff-only || {
    echo "pull 失败（可能有本地改动）。跳过更新，继续 setup。" >&2
  }
elif [[ -f "$HOME_DIR/SKILL.md" ]]; then
  echo "==> 已存在 skill 目录（非 git），跳过下载"
elif [[ -e "$HOME_DIR" ]]; then
  echo "路径已存在但不是可用的 jianying-editor-skill: $HOME_DIR" >&2
  exit 1
else
  echo "==> 优先 git clone（失败则改 zip）"
  set +e
  git clone --depth 1 "$REPO_URL" "$HOME_DIR"
  clone_rc=$?
  set -e
  if [[ $clone_rc -ne 0 || ! -f "$HOME_DIR/SKILL.md" ]]; then
    echo "==> git clone 失败或不完整，改用 zipball"
    rm -rf "$HOME_DIR"
    install_from_zip
  fi
fi

cd "$HOME_DIR"

echo "==> 创建/复用 venv"
"$PY" -m venv .venv
# shellcheck disable=SC1091
source .venv/bin/activate
python -m pip install -U pip

REQ_FILE="$HOME_DIR/requirements.txt"
if [[ ! -f "$REQ_FILE" ]]; then
  echo "缺少 requirements.txt: $REQ_FILE" >&2
  exit 1
fi

# uiautomation 仅 Windows；macOS/Linux 跳过以免 pip 失败
if [[ "$(uname -s)" == "Darwin" ]] || [[ "$(uname -s)" == "Linux" ]]; then
  echo "==> 非 Windows：安装依赖时跳过 uiautomation"
  TMP_REQ="$(mktemp)"
  grep -v -E '^uiautomation(==|>=|~=|$)' "$REQ_FILE" > "$TMP_REQ" || true
  python -m pip install -r "$TMP_REQ"
  rm -f "$TMP_REQ"
else
  python -m pip install -r "$REQ_FILE"
fi

if [[ "${JIANYING_SKIP_PLAYWRIGHT:-}" != "1" ]]; then
  echo "==> playwright install chromium（Web-to-Video；可设 JIANYING_SKIP_PLAYWRIGHT=1 跳过）"
  python -m playwright install chromium || {
    echo "警告: playwright chromium 安装失败，Web-to-Video 暂不可用。" >&2
  }
else
  echo "==> 跳过 playwright（JIANYING_SKIP_PLAYWRIGHT=1）"
fi

DRAFT_MAC="$HOME/Movies/JianyingPro/User Data/Projects/com.lveditor.draft"
echo ""
echo "OK: jianying-editor-skill 已就绪"
echo "  JIANYING_SKILL_HOME=$HOME_DIR"
echo "  JY_SKILL_ROOT=$HOME_DIR   # 跑作业脚本前请 export"
echo "  作业脚本目录: $ROOT/tools/jianying-jobs"
if [[ -d "$DRAFT_MAC" ]]; then
  echo "  本机草稿目录: $DRAFT_MAC"
else
  echo "  未找到默认草稿目录，使用前请告知 AI 实际路径"
fi
echo "  在 Cursor 说：用剪映随便剪一个测试草稿……"
echo "  macOS：只生成草稿，请在剪映里手动导出"
