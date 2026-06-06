#!/usr/bin/env bash
# 云剪 / 数字人口播 / 注册表 一键探活（在轻量或本机执行）
# 轻量先拉代码: bash ~/app/scripts/ecs-git-pull-gitee.sh
set -euo pipefail

BASE="${MEOO_DIAG_BASE:-https://mofangdianai.com}"
ERP="${BASE%/}/erp-api"

echo "== 探活基址: $ERP =="

curl -fsS -m 15 "${ERP}/meoo-auth-ping" | head -c 200 || echo "FAIL ping"
echo

curl -fsS -m 20 "${ERP}/meoo-ops-sync-registry" | head -c 120 || echo "FAIL registry"
echo

curl -fsS -m 20 "${ERP}/meoo-merchant-ai-video-config" | head -c 400 || echo "FAIL video-config"
echo

curl -fsS -m 25 "${ERP}/meoo-merchant-ai-video-ice-config" | head -c 600 || echo "FAIL ice-config"
echo

echo "== auth-api revision（404 响应内 revision 字段） =="
curl -fsS -m 10 "${ERP}/meoo-nonexistent-route" 2>/dev/null || true
echo

echo "完成。iceRamAuthorized=false 时请在 RAM 为 ICE AK 用户附加 AliyunICEFullAccess。"
