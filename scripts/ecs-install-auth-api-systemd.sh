#!/usr/bin/env bash
# 在 ECS 上安装 Auth API 为 systemd 服务（开机自启、断线不挂）
# 用法：bash scripts/ecs-install-auth-api-systemd.sh

set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
# shellcheck source=ecs-resolve-admin-home.sh
source "$ROOT/scripts/ecs-resolve-admin-home.sh"
# shellcheck source=ecs-resolve-erp-path.sh
source "$ROOT/scripts/ecs-resolve-erp-path.sh"
ERP="$(ecs_resolve_erp_dir "$ROOT")"
SERVICE_NAME=meoo-auth-api
UNIT_SRC="$ROOT/scripts/ecs-meoo-auth-api.service"
UNIT_DST="/etc/systemd/system/${SERVICE_NAME}.service"

if [[ "$(id -un)" != "admin" ]]; then
  echo "请用 admin 用户执行（当前=$(id -un) HOME=$HOME）。勿 sudo bash 本脚本。"
  echo "  su - admin -c 'cd ~/app && bash scripts/ecs-install-auth-api-systemd.sh'"
  exit 1
fi

if [[ ! -f "$HOME/stack/auth-api.env" ]]; then
  echo "先运行: bash scripts/ecs-run-auth-api.sh 的前半段生成 ~/stack/auth-api.env"
  echo "或手动创建 auth-api.env 后重试"
  exit 1
fi

echo "merchant-erp 路径: $ERP"
if [[ ! -d "$ERP/node_modules" ]]; then
  (cd "$ERP" && npm ci)
fi

EXPECTED_REVISION="$(
  grep -E "ECS_AUTH_API_ROUTE_REVISION\s*=" "$ERP/scripts/ecs-auth-api-server.ts" \
    | head -1 \
    | sed -E "s/.*'([^']+)'.*/\1/"
)"
echo "磁盘代码 revision=${EXPECTED_REVISION:-unknown}"

sudo cp "$UNIT_SRC" "$UNIT_DST"
sudo sed -i "s|^WorkingDirectory=.*|WorkingDirectory=$ERP|" "$UNIT_DST"
sudo systemctl daemon-reload
sudo systemctl enable "$SERVICE_NAME"

echo "停止旧进程（含非 systemd 残留）…"
sudo systemctl stop "$SERVICE_NAME" 2>/dev/null || true
sudo pkill -f 'tsx.*ecs-auth-api-server' 2>/dev/null || true
sudo pkill -f ecs-auth-api-server 2>/dev/null || true
sleep 2
if sudo lsof -iTCP:3001 -sTCP:LISTEN -n -P 2>/dev/null | grep -q .; then
  echo "WARN: :3001 仍被占用，强制释放"
  sudo fuser -k 3001/tcp 2>/dev/null || true
  sleep 2
fi

sudo systemctl start "$SERVICE_NAME"

sleep 3
if curl -sf "http://127.0.0.1:3001/api/meoo-auth-ping" >/dev/null; then
  echo "OK: Auth API 已在 :3001 运行"
  curl -sS "http://127.0.0.1:3001/api/meoo-auth-ping" | head -c 200
  echo
  HEALTH="$(curl -sS "http://127.0.0.1:3001/api/meoo-erp-api-health")"
  echo "health: $HEALTH"
  if [[ -n "$EXPECTED_REVISION" ]] && ! echo "$HEALTH" | grep -q "$EXPECTED_REVISION"; then
    echo "FATAL: 运行中 revision 与磁盘不一致（期望 $EXPECTED_REVISION）"
    echo "  请执行: systemctl cat $SERVICE_NAME | grep -E 'WorkingDirectory|ExecStart'"
    echo "  以及:   sudo journalctl -u $SERVICE_NAME -n 40 --no-pager"
    sudo journalctl -u "$SERVICE_NAME" -n 25 --no-pager || true
    exit 1
  fi
else
  echo "启动后 ping 失败，查看日志: sudo journalctl -u $SERVICE_NAME -n 50 --no-pager"
  exit 1
fi

echo "常用命令:"
echo "  sudo systemctl status $SERVICE_NAME"
echo "  sudo journalctl -u $SERVICE_NAME -f"
