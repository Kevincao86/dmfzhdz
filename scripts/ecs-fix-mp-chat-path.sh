#!/usr/bin/env bash
# 私信 WebSocket 报错多为 systemd 指向 web/merchant-erp，而 git 代码在 web版/merchant-erp
# 用法（ECS admin）: cd ~/app && git pull && bash scripts/ecs-fix-mp-chat-path.sh

set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
# shellcheck source=ecs-resolve-erp-path.sh
source "$ROOT/scripts/ecs-resolve-erp-path.sh"
ERP="$(ecs_resolve_erp_dir "$ROOT")"

echo "== 1) 拉代码 =="
if [[ -d "$ROOT/.git" ]]; then
  (cd "$ROOT" && git pull --ff-only) || (cd "$ROOT" && git pull)
  (cd "$ROOT" && git log -1 --oneline)
fi

CHAT="$ERP/src/lib/mpTalentChatSupabase.ts"
if [[ ! -f "$CHAT" ]]; then
  echo "FATAL: 缺少 $CHAT"
  exit 1
fi
if ! grep -q 'PostgrestClient' "$CHAT"; then
  echo "FATAL: 仍未包含 PostgREST 直连版私信代码，请确认 origin/main 已含 fix(ecs): 私信改 PostgREST"
  exit 1
fi
echo "OK: PostgREST 私信代码在 $ERP"

echo "== 2) 对齐 systemd WorkingDirectory =="
bash "$ROOT/scripts/ecs-install-auth-api-systemd.sh"

echo "== 3) 探活 =="
PORT="${AUTH_API_PORT:-3001}"
sleep 3
HEALTH="$(curl -sS "http://127.0.0.1:${PORT}/api/meoo-erp-api-health")"
echo "$HEALTH" | head -c 220
echo
if ! echo "$HEALTH" | grep -q '20260603-mp-chat-postgrest'; then
  echo "WARN: revision 仍不是 20260603-mp-chat-postgrest，请贴: systemctl cat meoo-auth-api | grep WorkingDirectory"
  exit 1
fi

curl -sS -X POST "http://127.0.0.1:${PORT}/api/meoo-ops-mp-talent-chat" \
  -H 'Content-Type: application/json' \
  -d '{"action":"sync_profile","participantKey":"ecs_probe_talent","deviceSecret":"ecs_probe_secret_16b","role":"talent","displayName":"probe"}'
echo
echo "OK: 若上行为 ok:true，私信已恢复。"
