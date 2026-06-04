#!/usr/bin/env bash
# 清理报名截止已满 7 天的招募群二维码（写入 ops_registry_snapshot）
#
# 前置：本机已 git pull 含本脚本的 main，且 meoo-auth-api 已重启（含 /api/meoo-ops-mp-group-qr-purge）
#
# 用法（ECS admin）:
#   cd ~/app && bash scripts/ecs-cron-mp-group-qr-purge.sh
#
# crontab 示例（每天 03:15）:
#   15 3 * * * cd /home/admin/app && bash scripts/ecs-cron-mp-group-qr-purge.sh >> /home/admin/logs/mp-group-qr-purge.log 2>&1

set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"

SELF="$ROOT/scripts/ecs-cron-mp-group-qr-purge.sh"
if [[ ! -f "$SELF" ]]; then
  echo "FATAL: 找不到 $SELF"
  echo "  请先在本机 push 最新 main，再在 ECS 执行:"
  echo "    cd ~/app && bash scripts/ecs-git-pull-main.sh"
  exit 1
fi

# shellcheck source=ecs-resolve-erp-path.sh
source "$ROOT/scripts/ecs-resolve-erp-path.sh"
ERP="$(ecs_resolve_erp_dir "$ROOT")"
PORT="${AUTH_API_PORT:-3001}"
HEALTH_URL="http://127.0.0.1:${PORT}/api/meoo-erp-api-health"
PURGE_URL="http://127.0.0.1:${PORT}/api/meoo-ops-mp-group-qr-purge"
EXPECTED_REVISION="20260606-mp-group-qr-purge"

echo "[$(date -Iseconds)] mp group-qr purge"
echo "ROOT=$ROOT"
echo "ERP=$ERP"

if [[ ! -f "$ERP/api/meoo-ops-mp-group-qr-purge.ts" ]]; then
  echo "FATAL: 磁盘代码缺少群码清理 API（$ERP/api/meoo-ops-mp-group-qr-purge.ts）"
  echo "  执行: cd ~/app && bash scripts/ecs-git-pull-main.sh"
  exit 1
fi

HEALTH="$(curl -sf -m 8 "$HEALTH_URL" 2>/dev/null || true)"
if [[ -z "$HEALTH" ]]; then
  echo "FATAL: Auth API 未响应 $HEALTH_URL"
  echo "  执行: cd ~/app && bash scripts/ecs-deploy-auth-api.sh"
  exit 1
fi
echo "health=$HEALTH"

if ! echo "$HEALTH" | grep -q "$EXPECTED_REVISION"; then
  echo "WARN: 运行中 revision 不是 $EXPECTED_REVISION（可能仍是旧进程）"
  echo "  执行: cd ~/app && bash scripts/ecs-deploy-auth-api.sh"
  echo "  或:   bash scripts/ecs-assert-auth-api-revision.sh"
fi

echo "POST $PURGE_URL"
RESP="$(curl -sf -m 120 -X POST -H 'Content-Type: application/json' -d '{}' "$PURGE_URL" || true)"
if [[ -z "$RESP" ]]; then
  echo "FATAL: 调用 purge 失败（404 多为未重启 auth-api）"
  echo "  本机探测: curl -sS -X POST -d '{}' $PURGE_URL"
  exit 1
fi
echo "$RESP" | head -c 2000
echo
if ! echo "$RESP" | grep -q '"ok":true'; then
  echo "FATAL: purge 返回非 ok"
  exit 1
fi
echo "OK"
