#!/usr/bin/env bash
# 探活招募大厅接口（只应返回 mpRecruitmentOrders 数组）
# ECS: bash ~/app/scripts/ecs-verify-mp-hall-registry.sh

set -euo pipefail

echo "=== :3001 直连 ==="
curl -sS -m 25 http://127.0.0.1:3001/api/meoo-ops-mp-hall-registry | head -c 400
echo ""

echo "=== Nginx /erp-api ==="
curl -sS -m 25 -H "Host: 139.196.42.5" http://127.0.0.1/erp-api/meoo-ops-mp-hall-registry | head -c 400
echo ""
echo "期望 JSON 含 mpRecruitmentOrders 数组；若 502：sudo systemctl restart meoo-auth-api"
