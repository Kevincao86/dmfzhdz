#!/usr/bin/env bash
# ECS 诊断：auth-api 磁盘代码 vs 运行中 revision vs systemd 工作目录
# 用法: bash scripts/ecs-verify-auth-api-path.sh

set -euo pipefail

ROOT="${HOME}/app"
SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
# shellcheck source=ecs-resolve-erp-path.sh
source "$SCRIPT_DIR/ecs-resolve-erp-path.sh"
ERP="$(ecs_resolve_erp_dir "$ROOT")"
PORT="${AUTH_API_PORT:-3001}"

echo "== 磁盘 =="
if [[ -d "$ROOT/.git" ]]; then
  (cd "$ROOT" && git log -1 --oneline)
else
  echo "WARN: $ROOT 不是 git 仓库"
fi
for alt in "$ROOT/web版/merchant-erp" "$ROOT/web/merchant-erp"; do
  if [[ -f "$alt/scripts/ecs-auth-api-server.ts" ]]; then
    rev="$(grep ECS_AUTH_API_ROUTE_REVISION "$alt/scripts/ecs-auth-api-server.ts" | head -1 | sed -E "s/.*'([^']+)'.*/\1/")"
    echo "磁盘 $alt → revision=${rev:-unknown}"
  fi
done
if [[ -f "$ERP/scripts/ecs-auth-api-server.ts" ]]; then
  echo "ecs_resolve 选用: $ERP"
else
  echo "FATAL: 缺少 $ERP/scripts/ecs-auth-api-server.ts"
  ls -la "$ROOT"/web* 2>/dev/null || true
fi

echo ""
echo "== systemd =="
if [[ -f /etc/systemd/system/meoo-auth-api.service ]]; then
  grep -E 'WorkingDirectory|ExecStart' /etc/systemd/system/meoo-auth-api.service
  WD="$(grep '^WorkingDirectory=' /etc/systemd/system/meoo-auth-api.service | cut -d= -f2-)"
  if [[ -n "$WD" && "$WD" != "$ERP" ]]; then
    echo "FATAL: WorkingDirectory=$WD 与 git 路径 $ERP 不一致 → 请执行:"
    echo "  cd ~/app && bash scripts/ecs-install-auth-api-systemd.sh"
  fi
else
  echo "未安装 meoo-auth-api.service"
fi

echo ""
echo "== 私信代码（须 PostgREST 直连，勿 createClient+Realtime） =="
CHAT_LIB="$ERP/src/lib/mpTalentChatSupabase.ts"
if [[ -f "$CHAT_LIB" ]]; then
  if grep -q 'PostgrestClient' "$CHAT_LIB" && ! grep -q 'createClient' "$CHAT_LIB"; then
    echo "OK: $CHAT_LIB 使用 PostgrestClient"
  else
    echo "FATAL: $CHAT_LIB 仍为旧版（会触发 Node20 WebSocket 报错）"
    echo "  请 git pull 后: bash scripts/ecs-install-auth-api-systemd.sh"
  fi
else
  echo "WARN: 缺少 $CHAT_LIB"
fi

echo ""
echo "== 运行中 =="
sudo lsof -iTCP:"$PORT" -sTCP:LISTEN -n -P 2>/dev/null || echo ":$PORT 无监听"
curl -sS "http://127.0.0.1:${PORT}/api/meoo-erp-api-health" 2>/dev/null || echo "health 不可用"
