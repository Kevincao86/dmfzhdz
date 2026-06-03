#!/usr/bin/env bash
# 确认 ECS 磁盘代码与运行中 auth-api revision 一致（admin 执行）
# 用法: cd ~/app && bash scripts/ecs-assert-auth-api-revision.sh

set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
# shellcheck source=ecs-resolve-erp-path.sh
source "$ROOT/scripts/ecs-resolve-erp-path.sh"
ERP="$(ecs_resolve_erp_dir "$ROOT")"
PORT="${AUTH_API_PORT:-3001}"
SERVER="$ERP/scripts/ecs-auth-api-server.ts"

if [[ ! -f "$SERVER" ]]; then
  echo "FATAL: 缺少 $SERVER"
  exit 1
fi

EXPECTED="$(grep -E "ECS_AUTH_API_ROUTE_REVISION\s*=" "$SERVER" | head -1 | sed -E "s/.*'([^']+)'.*/\1/")"
echo "磁盘期望 revision=$EXPECTED"
echo "ERP 路径=$ERP"

if ! grep -q "'/api/mp-cronet-ping'" "$SERVER"; then
  echo "FATAL: 磁盘代码无 /api/mp-cronet-ping，请 git pull origin main（本机需先 push）"
  exit 1
fi
echo "OK: 磁盘含 mp-cronet-ping 路由"

if [[ -f /etc/systemd/system/meoo-auth-api.service ]]; then
  WD="$(grep '^WorkingDirectory=' /etc/systemd/system/meoo-auth-api.service | cut -d= -f2-)"
  echo "systemd WorkingDirectory=$WD"
  if [[ "$WD" != "$ERP" ]]; then
    echo "FATAL: WorkingDirectory 与 git 路径不一致 → bash scripts/ecs-install-auth-api-systemd.sh"
    exit 1
  fi
fi

RUNNING="$(curl -sf "http://127.0.0.1:${PORT}/api/meoo-erp-api-health" 2>/dev/null || true)"
echo "运行中 health=$RUNNING"
if ! echo "$RUNNING" | grep -q "$EXPECTED"; then
  echo "FATAL: 运行中 revision 不是 $EXPECTED → sudo systemctl restart meoo-auth-api"
  exit 1
fi

PING="$(curl -sf "http://127.0.0.1:${PORT}/api/mp-cronet-ping" 2>/dev/null || true)"
echo "本机 ping=$PING"
if ! echo "$PING" | grep -q '"ok":true'; then
  echo "FATAL: 本机 /api/mp-cronet-ping 失败"
  exit 1
fi

echo "OK: ECS auth-api 代码与进程已对齐 $EXPECTED"
