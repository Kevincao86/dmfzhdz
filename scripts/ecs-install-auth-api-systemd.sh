#!/usr/bin/env bash
# 在 ECS 上安装 Auth API 为 systemd 服务（开机自启、断线不挂）
# 用法：bash scripts/ecs-install-auth-api-systemd.sh

set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
SERVICE_NAME=meoo-auth-api
UNIT_SRC="$ROOT/scripts/ecs-meoo-auth-api.service"
UNIT_DST="/etc/systemd/system/${SERVICE_NAME}.service"

if [[ "$(id -un)" != "admin" ]]; then
  echo "请用 admin 用户执行（或调整 service 里的 User/路径）"
  exit 1
fi

if [[ ! -f "$HOME/stack/auth-api.env" ]]; then
  echo "先运行: bash scripts/ecs-run-auth-api.sh 的前半段生成 ~/stack/auth-api.env"
  echo "或手动创建 auth-api.env 后重试"
  exit 1
fi

ERP="$ROOT/web版/merchant-erp"
if [[ ! -d "$ERP/node_modules" ]]; then
  (cd "$ERP" && npm ci)
fi

sudo cp "$UNIT_SRC" "$UNIT_DST"
sudo systemctl daemon-reload
sudo systemctl enable "$SERVICE_NAME"
sudo systemctl restart "$SERVICE_NAME"

sleep 2
if curl -sf "http://127.0.0.1:3001/api/meoo-auth-ping" >/dev/null; then
  echo "OK: Auth API 已在 :3001 运行"
  curl -sS "http://127.0.0.1:3001/api/meoo-auth-ping" | head -c 200
  echo
else
  echo "启动后 ping 失败，查看日志: sudo journalctl -u $SERVICE_NAME -n 50 --no-pager"
  exit 1
fi

echo "常用命令:"
echo "  sudo systemctl status $SERVICE_NAME"
echo "  sudo journalctl -u $SERVICE_NAME -f"
