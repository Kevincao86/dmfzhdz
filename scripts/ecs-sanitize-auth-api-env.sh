#!/usr/bin/env bash
# 清理 ~/stack/auth-api.env 中损坏的行（裸 PEM 片段会导致 systemd/bash 解析失败 → 502）
# 在轻量 admin 用户执行：cd ~/app && bash scripts/ecs-sanitize-auth-api-env.sh
set -euo pipefail

ENV="${STACK_DIR:-$HOME/stack}/auth-api.env"
[[ -f "$ENV" ]] || { echo "缺少 $ENV"; exit 1; }

BAK="${ENV}.bak.$(date +%Y%m%d%H%M%S)"
cp "$ENV" "$BAK"
TMP="${ENV}.sanitize.tmp"

awk '
  /^[[:space:]]*#/ { print; next }
  /^[A-Za-z_][A-Za-z0-9_]*=/ { print; next }
' "$BAK" >"$TMP"

BEFORE=$(wc -l <"$BAK" | tr -d ' ')
AFTER=$(wc -l <"$TMP" | tr -d ' ')
mv "$TMP" "$ENV"

echo "OK: 已清理 auth-api.env（$BEFORE → $AFTER 行），备份 $BAK"
echo "请执行: sudo systemctl restart meoo-auth-api"
