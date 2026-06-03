#!/usr/bin/env bash
# 与云函数相同路径探活 wx_login（假 code 应 invalid code，不应 42501）
# ECS: bash ~/app/scripts/ecs-verify-mp-wx-login-path.sh

set -euo pipefail

echo "=== 1) 经 Nginx 80+IP（云函数同源）==="
curl -sS -m 15 -X POST -H "Host: 139.196.42.5" -H "Content-Type: application/json" \
  http://127.0.0.1/erp-api/meoo-ops-mp-auth \
  -d '{"action":"wx_login","code":"ecs_probe_not_real","role":"talent"}'
echo ""

echo "=== 2) 直连 meoo-auth-api :3001 ==="
curl -sS -m 15 -X POST -H "Content-Type: application/json" \
  http://127.0.0.1:3001/api/meoo-ops-mp-auth \
  -d '{"action":"wx_login","code":"ecs_probe_not_real","role":"talent"}'
echo ""

echo "期望含 invalid code；若含 row-level security 则 RLS 仍未修好。"
