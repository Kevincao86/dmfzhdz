#!/usr/bin/env bash
# 清理报名截止已满 7 天的招募群二维码（写入 ops_registry_snapshot）
# 用法（ECS）: cd ~/app && bash scripts/ecs-cron-mp-group-qr-purge.sh
# crontab 示例（每天 03:15）:
#   15 3 * * * cd /home/admin/app && bash scripts/ecs-cron-mp-group-qr-purge.sh >> /home/admin/logs/mp-group-qr-purge.log 2>&1

set -euo pipefail
PORT="${AUTH_API_PORT:-3001}"
URL="http://127.0.0.1:${PORT}/api/meoo-ops-mp-group-qr-purge"
echo "[$(date -Iseconds)] POST ${URL}"
curl -sf -X POST -H 'Content-Type: application/json' -d '{}' "${URL}" | head -c 2000
echo
