#!/usr/bin/env bash
# 运营管控台迁移 · 步骤 1：轻量 API 与 env 前置探活（不动 Vercel、不改 DNS）
#
# 在轻量（139.196.42.5）以 admin 执行:
#   cd ~/app && git pull && bash scripts/ecs-verify-ops-admin-pre-migrate.sh
#
# 全部 OK 后再进行步骤 2（新 ECS 准备 .env.production 与证书）

set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
PORT="${AUTH_API_PORT:-3001}"
ENV_FILE="${HOME}/stack/auth-api.env"
PUBLIC_BASE="${OPS_VERIFY_PUBLIC_BASE:-https://mofangdianai.com}"

fail=0

check_env_key() {
  local key="$1"
  local label="$2"
  if [[ -f "$ENV_FILE" ]] && grep -qE "^${key}=.+$" "$ENV_FILE"; then
    echo "OK: ${label}（${key} 已配置）"
  else
    echo "FAIL: 缺少 ${label} — 请在 ${ENV_FILE} 配置 ${key}"
    fail=1
  fi
}

echo "== 1) meoo-auth-api 本机监听 =="
if curl -sf -m 5 "http://127.0.0.1:${PORT}/api/meoo-auth-ping" >/dev/null; then
  echo "OK: http://127.0.0.1:${PORT}/api/meoo-auth-ping"
else
  echo "FAIL: :${PORT} 无响应。执行: bash scripts/ecs-ensure-auth-api.sh"
  fail=1
fi

echo ""
echo "== 2) 公网 /erp-api 健康 =="
HEALTH="$(curl -sS -m 15 "${PUBLIC_BASE}/erp-api/meoo-erp-api-health" 2>/dev/null || true)"
if echo "$HEALTH" | grep -q '"ok":true'; then
  echo "OK: ${PUBLIC_BASE}/erp-api/meoo-erp-api-health"
  echo "$HEALTH" | head -c 200
  echo ""
else
  echo "FAIL: ${PUBLIC_BASE}/erp-api/meoo-erp-api-health 不可用"
  echo "${HEALTH:-（无响应）}" | head -c 200
  echo ""
  fail=1
fi

echo ""
echo "== 3) 运营注册表 API =="
REG="$(curl -sS -m 20 "${PUBLIC_BASE}/erp-api/meoo-ops-sync-registry" 2>/dev/null | head -c 120 || true)"
if [[ -n "$REG" ]] && echo "$REG" | grep -qE 'tenants|recruitmentOrders|vendorKeys|"ok"'; then
  echo "OK: meoo-ops-sync-registry 有 JSON 响应"
else
  echo "WARN: meoo-ops-sync-registry 响应异常（可能表未初始化，继续迁移但 AI/注册表页需单独验收）"
  echo "${REG:-（无响应）}"
fi

echo ""
echo "== 4) auth-api.env 运营台必需项 =="
if [[ ! -f "$ENV_FILE" ]]; then
  echo "FAIL: 缺少 ${ENV_FILE}，执行: bash scripts/ecs-run-auth-api.sh"
  fail=1
else
  check_env_key "SUPABASE_SERVICE_ROLE_KEY" "Supabase service_role"
  check_env_key "MEOO_SUPPORT_OPS_HTTP_TOKEN" "在线客服 HTTP Token"
  if grep -qE '^MEOO_OPS_STAFF_SESSION_SECRET=.+$' "$ENV_FILE"; then
    echo "OK: 运营子账号会话密钥（MEOO_OPS_STAFF_SESSION_SECRET 已配置）"
  else
    echo "WARN: 未设 MEOO_OPS_STAFF_SESSION_SECRET（将回退 service_role 前缀，建议补随机长密钥）"
  fi
fi

echo ""
echo "== 5) 迁移脚本是否已入库 =="
for f in \
  scripts/ecs-deploy-ops-admin-web.sh \
  scripts/ecs-nginx-ops-admin.conf \
  商家管理后台/.env.production.example
do
  if [[ -f "$ROOT/$f" ]]; then
    echo "OK: $f"
  else
    echo "FAIL: 缺少 $ROOT/$f — 本机 git pull main 后再试"
    fail=1
  fi
done

echo ""
if [[ "$fail" -eq 0 ]]; then
  echo "步骤 1 通过。下一步：在新 ECS 准备 商家管理后台/.env.production 与 TLS，再执行 ecs-deploy-ops-admin-web.sh"
  exit 0
fi

echo "步骤 1 未通过，请先修复上述 FAIL 项后重跑本脚本。"
exit 1
