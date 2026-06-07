#!/usr/bin/env bash
# 数字人口播 / 短视频多段合并依赖 ffmpeg（云端 concat-urls）
# 轻量 ECS: cd ~/app && bash scripts/ecs-install-ffmpeg.sh

set -euo pipefail

if command -v ffmpeg >/dev/null 2>&1; then
  echo "OK: ffmpeg 已安装 — $(ffmpeg -version 2>/dev/null | head -1)"
  exit 0
fi

echo "安装 ffmpeg…"
if command -v apt-get >/dev/null 2>&1; then
  sudo apt-get update -qq
  sudo DEBIAN_FRONTEND=noninteractive apt-get install -y ffmpeg
elif command -v yum >/dev/null 2>&1; then
  sudo yum install -y ffmpeg || sudo yum install -y epel-release && sudo yum install -y ffmpeg
else
  echo "FAIL: 未识别包管理器，请手动安装 ffmpeg 并确保在 PATH 中"
  exit 1
fi

if ! command -v ffmpeg >/dev/null 2>&1; then
  echo "FAIL: 安装后仍找不到 ffmpeg"
  exit 1
fi

echo "OK: $(ffmpeg -version 2>/dev/null | head -1)"
