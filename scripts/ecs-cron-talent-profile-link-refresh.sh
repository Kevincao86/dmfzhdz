#!/usr/bin/env bash
# 每月 5 日起：批量解析达人平台主页链接，回写 mpTalentMembers + talentLibraryEntries
#
# 用法（轻量 ECS）:
#   cd ~/app && bash scripts/ecs-cron-talent-profile-link-refresh.sh
#
# crontab 示例（每月 5–7 日 03:30，断点续跑直到 completed）:
#   30 3 5-7 * * cd /home/admin/app && bash scripts/ecs-cron-talent-profile-link-refresh.sh >> /home/admin/logs/talent-profile-link-refresh.log 2>&1
#
# 运维手动（忽略日期 / 本月已完成）:
#   FORCE=1 bash scripts/ecs-cron-talent-profile-link-refresh.sh
# 只看不写库:
#   DRY_RUN=1 bash scripts/ecs-cron-talent-profile-link-refresh.sh

set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"

# shellcheck source=ecs-resolve-erp-path.sh
source "$ROOT/scripts/ecs-resolve-erp-path.sh"
ERP="$(ecs_resolve_erp_dir "$ROOT")"
PORT="${AUTH_API_PORT:-3001}"
HEALTH_URL="http://127.0.0.1:${PORT}/api/meoo-erp-api-health"
REFRESH_URL="http://127.0.0.1:${PORT}/api/meoo-ops-mp-talent-profile-link-refresh"

MAX_PARSES="${MAX_PARSES:-80}"
DELAY_MS="${DELAY_MS:-1200}"
FORCE="${FORCE:-0}"
DRY_RUN="${DRY_RUN:-0}"

echo "[$(date -Iseconds)] talent profile link monthly refresh"
echo "ROOT=$ROOT ERP=$ERP maxParses=$MAX_PARSES"

if [[ ! -f "$ERP/api/meoo-ops-mp-talent-profile-link-refresh.ts" ]]; then
  echo "FATAL: 磁盘代码缺少 API（$ERP/api/meoo-ops-mp-talent-profile-link-refresh.ts）"
  echo "  执行: cd ~/app && bash scripts/ecs-git-pull-gitee.sh"
  exit 1
fi

HEALTH="$(curl -sf -m 8 "$HEALTH_URL" 2>/dev/null || true)"
if [[ -z "$HEALTH" ]]; then
  echo "FATAL: Auth API 未响应 $HEALTH_URL"
  echo "  执行: cd ~/app && bash scripts/ecs-deploy-auth-api.sh"
  exit 1
fi
echo "health=$HEALTH"

PAYLOAD="$(python3 - <<PY
import json
print(json.dumps({
  "maxParses": int("${MAX_PARSES}"),
  "delayMs": int("${DELAY_MS}"),
  "force": ${FORCE} == 1,
  "dryRun": ${DRY_RUN} == 1,
}))
PY
)"

echo "POST $REFRESH_URL"
RESP="$(curl -sf -m 280 -X POST -H 'Content-Type: application/json' -d "$PAYLOAD" "$REFRESH_URL" || true)"
if [[ -z "$RESP" ]]; then
  echo "FATAL: 调用 refresh 失败（404 多为未重启 auth-api）"
  exit 1
fi
echo "$RESP" | head -c 4000
echo
if ! echo "$RESP" | grep -q '"ok":true'; then
  echo "FATAL: refresh 返回非 ok"
  exit 1
fi
if echo "$RESP" | grep -q '"skipped":true' && [[ "$FORCE" != "1" ]]; then
  echo "SKIP: $(echo "$RESP" | python3 -c "import sys,json; print(json.load(sys.stdin).get('skipReason',''))" 2>/dev/null || true)"
  exit 0
fi
echo "OK"
