#!/usr/bin/env bash
# 小程序私信 + 站内信：ECS 一体化修复（不依赖 Supabase 云控制台）
# 在 ECS 执行: cd ~/app && git pull && bash scripts/ecs-fix-mp-chat-ecs.sh
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"

echo "== 1) 生成 auth-api.env（本机 Postgres + SERVICE_ROLE，非云端 Supabase） =="
if [[ ! -f "$HOME/stack/auth-api.env" ]] || ! grep -q '^SUPABASE_SERVICE_ROLE_KEY=.' "$HOME/stack/auth-api.env" 2>/dev/null; then
  bash "$ROOT/scripts/ecs-run-auth-api.sh" || true
fi

echo "== 2) 应用私信相关 SQL（ECS Postgres） =="
for f in \
  20260528100000_mp_talent_chat.sql \
  20260530150000_mp_talent_chat_pr_avatar_column.sql \
  20260602100000_mp_talent_chat_ensure_from_talent.sql
do
  if [[ -f "$ROOT/supabase/migrations/$f" ]]; then
    bash "$ROOT/scripts/ecs-apply-supabase-migration.sh" "$f" || {
      echo "WARN: $f 可能已应用，继续…"
    }
  fi
done

if systemctl is-active --quiet meoo-postgrest 2>/dev/null; then
  echo "== 3) 重启 PostgREST =="
  sudo systemctl restart meoo-postgrest
fi

echo "== 4) 重启 auth-api + Nginx 探活 =="
bash "$ROOT/scripts/ecs-fix-erp-api-502.sh"

PORT="${AUTH_API_PORT:-3001}"
echo "== 5) 私信接口（须 ok 或非 supabase_admin_not_configured） =="
curl -sS -m 15 -X POST "http://127.0.0.1:${PORT}/api/meoo-ops-mp-talent-chat" \
  -H 'Content-Type: application/json' \
  -d '{"action":"sync_profile","participantKey":"ecs_probe_talent","deviceSecret":"ecs_probe_secret_16b","role":"talent","displayName":"probe"}' | head -c 240
echo
echo "OK: 完成后上传小程序体验版（仅 MERCHANT_API_BASE_URL，无云端 Supabase）。"
