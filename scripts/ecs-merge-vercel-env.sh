#!/usr/bin/env bash
# 将 Vercel 导出的 env 合并进 ECS auth-api.env（勿覆盖本机 Supabase URL）
# 用法:
#   scp .env.vercel.production admin@ECS:~/stack/vercel-export.production.env
#   bash scripts/ecs-merge-vercel-env.sh ~/stack/vercel-export.production.env

set -euo pipefail

SRC="${1:-$HOME/stack/vercel-export.production.env}"
DEST="${AUTH_API_ENV:-$HOME/stack/auth-api.env}"

if [[ ! -f "$SRC" ]]; then
  echo "缺少导出文件: $SRC"
  echo "本机先执行: vercel env pull .env.vercel.production --environment=production"
  exit 1
fi

if [[ ! -f "$DEST" ]]; then
  echo "缺少 $DEST，请先: bash scripts/ecs-run-auth-api.sh"
  exit 1
fi

BACKUP="${DEST}.bak.$(date +%Y%m%d%H%M%S)"
cp "$DEST" "$BACKUP"
echo "已备份 $BACKUP"

SKIP_KEYS='^(SUPABASE_URL|VITE_SUPABASE_URL)='
ADDED=0
while IFS= read -r line || [[ -n "$line" ]]; do
  [[ -z "$line" || "$line" =~ ^# ]] && continue
  [[ "$line" =~ ^VITE_ ]] && continue
  key="${line%%=*}"
  if [[ "$line" =~ $SKIP_KEYS ]]; then
    continue
  fi
  if grep -q "^${key}=" "$DEST" 2>/dev/null; then
    continue
  fi
  echo "$line" >>"$DEST"
  ADDED=$((ADDED + 1))
done <"$SRC"

echo "已追加 $ADDED 条服务端变量到 $DEST（跳过 VITE_* 与 SUPABASE_URL）"
echo "请执行: sudo systemctl restart meoo-auth-api"
