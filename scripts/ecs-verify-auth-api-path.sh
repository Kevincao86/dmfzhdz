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
if [[ -f "$ERP/scripts/ecs-auth-api-server.ts" ]]; then
  grep ECS_AUTH_API_ROUTE_REVISION "$ERP/scripts/ecs-auth-api-server.ts" || true
else
  echo "FATAL: 缺少 $ERP/scripts/ecs-auth-api-server.ts"
  echo "若存在 ~/app/web/merchant-erp（无「版」），说明 systemd 工作目录与 git 仓库不一致"
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
echo "== 运行中 =="
sudo lsof -iTCP:"$PORT" -sTCP:LISTEN -n -P 2>/dev/null || echo ":$PORT 无监听"
curl -sS "http://127.0.0.1:${PORT}/api/meoo-erp-api-health" 2>/dev/null || echo "health 不可用"
