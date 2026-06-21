#!/usr/bin/env bash
# 轻量部署前本机冒烟：确保 auth-api 能启动、不崩溃，再上传代码
#
# 用法:
#   bash scripts/ecs-pre-light-deploy-test.sh
#
# Agent 规则（写死）：任何部署轻量之前必须先跑本脚本且 exit 0

set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
# shellcheck source=ecs-resolve-erp-path.sh
source "$ROOT/scripts/ecs-resolve-erp-path.sh"
ERP="$(ecs_resolve_erp_dir "$ROOT")"
PORT="${AUTH_API_TEST_PORT:-39001}"

echo "== 轻量部署前本机测试 =="
echo "ERP=$ERP"

if [[ ! -f "$ERP/scripts/ecs-auth-api-server.ts" ]]; then
  echo "FATAL: 缺少 $ERP/scripts/ecs-auth-api-server.ts"
  exit 1
fi

if [[ ! -d "$ERP/node_modules" ]]; then
  echo "安装 merchant-erp 依赖..."
  (cd "$ERP" && npm ci)
fi

export MEOO_AUTH_API_SERVER=1
export AUTH_API_PORT="$PORT"
export SUPABASE_URL="${SUPABASE_URL:-http://127.0.0.1:8888}"
export MEOO_SUPABASE_ADMIN_URL="${MEOO_SUPABASE_ADMIN_URL:-http://127.0.0.1:8888}"
export SUPABASE_ANON_KEY="${SUPABASE_ANON_KEY:-local-smoke-anon-key}"
export SUPABASE_SERVICE_ROLE_KEY="${SUPABASE_SERVICE_ROLE_KEY:-local-smoke-service-key}"
export SUPABASE_JWT_SECRET="${SUPABASE_JWT_SECRET:-local-smoke-jwt-secret}"

LOG="$(mktemp /tmp/ecs-pre-light-test.XXXXXX.log)"
PID=""
cleanup() {
  if [[ -n "$PID" ]] && kill -0 "$PID" 2>/dev/null; then
    kill "$PID" 2>/dev/null || true
    wait "$PID" 2>/dev/null || true
  fi
  rm -f "$LOG"
}
trap cleanup EXIT

echo "启动 auth-api 冒烟 (127.0.0.1:${PORT})..."
(cd "$ERP" && npx --yes tsx scripts/ecs-auth-api-server.ts) >"$LOG" 2>&1 &
PID=$!

OK=0
for i in $(seq 1 30); do
  sleep 1
  if curl -sf -m 2 "http://127.0.0.1:${PORT}/api/meoo-erp-api-health" >/dev/null 2>&1; then
    OK=1
    break
  fi
  if ! kill -0 "$PID" 2>/dev/null; then
    echo "FATAL: auth-api 进程已退出（启动崩溃，轻量上会同样挂）"
    echo "--- 启动日志 ---"
    cat "$LOG"
    exit 1
  fi
done

if [[ "$OK" != "1" ]]; then
  echo "FATAL: 30s 内 /api/meoo-erp-api-health 不可用"
  echo "--- 启动日志 ---"
  cat "$LOG"
  exit 1
fi

HEALTH="$(curl -sS "http://127.0.0.1:${PORT}/api/meoo-erp-api-health")"
echo "health: $HEALTH"
if ! echo "$HEALTH" | grep -q '"ok":true'; then
  echo "FATAL: health 返回异常"
  exit 1
fi

REVISION="$(
  grep -E "ECS_AUTH_API_ROUTE_REVISION\s*=" "$ERP/scripts/ecs-auth-api-server.ts" \
    | head -1 \
    | sed -E "s/.*'([^']+)'.*/\1/"
)"
if [[ -n "$REVISION" ]] && ! echo "$HEALTH" | grep -q "$REVISION"; then
  echo "FATAL: 运行 revision 与磁盘不一致（期望 $REVISION）"
  exit 1
fi

ROUTES="$(echo "$HEALTH" | sed -n 's/.*"routes":\([0-9]*\).*/\1/p')"
echo ""
echo "OK: 轻量部署前本机测试通过（auth-api 可启动、health ok、revision=${REVISION:-unknown}、routes=${ROUTES:-?}）"
echo "通过后再执行: bash scripts/ecs-deploy-light-safe.sh"
