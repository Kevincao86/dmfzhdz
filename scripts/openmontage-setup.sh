#!/usr/bin/env bash
# 本机安装 / 更新 OpenMontage（AGPL，默认装到 tools/OpenMontage，已 gitignore）
# 用法（仓库根）:
#   bash scripts/openmontage-setup.sh
#   OPENMONTAGE_HOME=/path/to/OpenMontage bash scripts/openmontage-setup.sh

set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
HOME_DIR="${OPENMONTAGE_HOME:-"$ROOT/tools/OpenMontage"}"
REPO_URL="${OPENMONTAGE_REPO_URL:-https://github.com/calesthio/OpenMontage.git}"
ZIP_URL="${OPENMONTAGE_ZIP_URL:-https://codeload.github.com/calesthio/OpenMontage/zip/refs/heads/main}"

echo "==> OpenMontage home: $HOME_DIR"

need_cmd() {
  if ! command -v "$1" >/dev/null 2>&1; then
    echo "缺少依赖: $1" >&2
    exit 1
  fi
}

pick_python() {
  local c
  for c in "${OPENMONTAGE_PYTHON:-}" python3.12 python3.11 python3.10 python3; do
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
need_cmd node
need_cmd curl
need_cmd unzip

if ! command -v ffmpeg >/dev/null 2>&1; then
  echo "警告: 未检测到 ffmpeg。请先安装（macOS: brew install ffmpeg）后再出片。" >&2
fi

PY="$(pick_python || true)"
if [[ -z "${PY:-}" ]]; then
  echo "缺少 Python 3.10+（当前系统 python3 过旧）。请安装 python3.11+ 后重试。" >&2
  echo "  例如: brew install python@3.12   或确保 ~/.local/bin/python3.11 在 PATH" >&2
  exit 1
fi
echo "==> Python: $PY ($("$PY" -c 'import sys; print("%d.%d"%sys.version_info[:2])'))"

mkdir -p "$(dirname "$HOME_DIR")"

install_from_zip() {
  local tmp zipf parent
  parent="$(dirname "$HOME_DIR")"
  tmp="$(mktemp -d)"
  zipf="$tmp/openmontage.zip"
  echo "==> 下载 zipball: $ZIP_URL"
  curl -L --connect-timeout 30 --max-time 900 -o "$zipf" "$ZIP_URL"
  unzip -q "$zipf" -d "$tmp"
  # GitHub zip 解压为 OpenMontage-main
  local extracted
  extracted="$(find "$tmp" -maxdepth 1 -type d -name 'OpenMontage-*' | head -1)"
  if [[ -z "$extracted" || ! -f "$extracted/AGENT_GUIDE.md" ]]; then
    echo "zip 解压失败或缺少 AGENT_GUIDE.md" >&2
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
elif [[ -f "$HOME_DIR/AGENT_GUIDE.md" ]]; then
  echo "==> 已存在 OpenMontage 目录（非 git），跳过下载"
elif [[ -e "$HOME_DIR" ]]; then
  echo "路径已存在但不是可用的 OpenMontage: $HOME_DIR" >&2
  exit 1
else
  echo "==> 优先 git clone（超时则改 zip）"
  set +e
  git clone --depth 1 --filter=blob:none "$REPO_URL" "$HOME_DIR"
  clone_rc=$?
  set -e
  if [[ $clone_rc -ne 0 || ! -f "$HOME_DIR/AGENT_GUIDE.md" ]]; then
    echo "==> git clone 失败或不完整，改用 zipball"
    rm -rf "$HOME_DIR"
    install_from_zip
  fi
fi

cd "$HOME_DIR"

if [[ ! -f .env ]]; then
  if [[ -f .env.example ]]; then
    cp .env.example .env
    echo "==> 已创建 .env（来自 .env.example），可按需填 key"
  else
    touch .env
    echo "==> 已创建空 .env"
  fi
else
  echo "==> 保留已有 .env"
fi

run_make_setup() {
  if command -v make >/dev/null 2>&1 && [[ -f Makefile ]]; then
    local ver
    ver="$("$PY" -c 'import sys; print("%d.%d"%sys.version_info[:2])')"
    echo "==> make setup (PYTHON_VERSION=$ver BASE_PYTHON=$PY)"
    make setup "PYTHON_VERSION=$ver" "BASE_PYTHON=$PY"
    return 0
  fi
  return 1
}

run_manual_setup() {
  echo "==> 无 make 或 make setup 失败，走手动安装"
  "$PY" -m venv .venv
  # shellcheck disable=SC1091
  source .venv/bin/activate
  python -m pip install -U pip
  if [[ -f requirements.txt ]]; then
    python -m pip install -r requirements.txt
  fi
  if [[ -d remotion-composer ]]; then
    (cd remotion-composer && npm install)
  fi
  python -m pip install piper-tts || true
}

if ! run_make_setup; then
  run_manual_setup
fi

echo ""
echo "OK: OpenMontage 已就绪"
echo "  OPENMONTAGE_HOME=$HOME_DIR"
echo "  在 Cursor 说：用 OpenMontage 做一条 30 秒产品解说……"
echo "  许可: AGPL-3.0 — 仅本机制片，勿并入 ERP 发版"
