#!/usr/bin/env bash
# 修复商家 Web 注册「创建租户失败，请联系管理员检查数据库权限」
# 常见原因：自建 PostgREST 未 GRANT service_role 写 tenants；或缺 membership_plan / edition 列
#
# 轻量 ECS（admin）:
#   cd ~/app && git pull && bash scripts/ecs-fix-register-tenant.sh

set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
# shellcheck source=ecs-resolve-admin-home.sh
source "$ROOT/scripts/ecs-resolve-admin-home.sh"

CREDS="${HOME}/stack/db-credentials.txt"
PG_PORT="${ECS_PG_PORT:-5433}"
PG_DB="${ECS_PG_DB:-postgres}"

if [[ ! -f "$CREDS" ]]; then
  echo "FAIL: 缺少 $CREDS（请用 admin 执行，勿 sudo）"
  exit 1
fi
# shellcheck disable=SC1090
source "$CREDS"
export PGPASSWORD="${POSTGRES_PASSWORD:-}"

psql_admin() {
  psql -h 127.0.0.1 -p "$PG_PORT" -U postgres -d "$PG_DB" "$@"
}

echo "== 1) 校验 tenants 表与关键列 =="
psql_admin -v ON_ERROR_STOP=1 -c "
SELECT column_name, data_type
FROM information_schema.columns
WHERE table_schema = 'public' AND table_name = 'tenants'
  AND column_name IN ('membership_plan', 'edition', 'trial_days', 'official_days')
ORDER BY column_name;
"

need_mig=0
for col in membership_plan edition; do
  if ! psql_admin -tAc "SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='tenants' AND column_name='$col'" | grep -q 1; then
    echo "WARN: tenants.$col 缺失，将应用迁移"
    need_mig=1
  fi
done

if [[ "$need_mig" == "1" ]]; then
  echo "== 2) 应用租户相关迁移 =="
  for mig in \
    20260519100000_tenant_membership_tokenmix.sql \
    20260520100000_tenant_default_free_no_trial.sql \
    20260601120000_tenant_partner_edition.sql; do
    if [[ -f "$ROOT/supabase/migrations/$mig" ]]; then
      echo "  -> $mig"
      psql_admin -v ON_ERROR_STOP=1 -f "$ROOT/supabase/migrations/$mig"
    fi
  done
else
  echo "== 2) 跳过迁移（列已存在）=="
fi

echo "== 3) GRANT service_role（PostgREST 写入 tenants / tenant_members）=="
if [[ -f "$ROOT/supabase/ecs_service_role_grants.sql" ]]; then
  psql_admin -v ON_ERROR_STOP=1 -f "$ROOT/supabase/ecs_service_role_grants.sql"
else
  echo "FAIL: 缺少 $ROOT/supabase/ecs_service_role_grants.sql"
  exit 1
fi

echo "== 4) 重启 PostgREST / auth-api =="
if systemctl list-unit-files meoo-postgrest.service &>/dev/null; then
  sudo systemctl restart meoo-postgrest
  sleep 2
fi
if systemctl list-unit-files meoo-auth-api.service &>/dev/null; then
  sudo systemctl restart meoo-auth-api
  sleep 3
fi

ENV_FILE="${HOME}/stack/auth-api.env"
if [[ -f "$ENV_FILE" ]]; then
  # shellcheck disable=SC1090
  source "$ENV_FILE"
fi
SRK="${SUPABASE_SERVICE_ROLE_KEY:-${SERVICE_ROLE_KEY:-}}"
BASE="${SUPABASE_URL:-https://mofangdianai.com}"
BASE="${BASE%/}"

if [[ -n "$SRK" ]]; then
  echo "== 5) 探活 PostgREST 写入 tenants（测试行将回滚）=="
  TEST_NAME="__register_probe_$(date +%s)__"
  HTTP_CODE="$(curl -sS -m 15 -o /tmp/meoo-tenant-probe.json -w '%{http_code}' \
    -X POST "${BASE}/rest/v1/tenants" \
    -H "apikey: ${SRK}" \
    -H "Authorization: Bearer ${SRK}" \
    -H "Content-Type: application/json" \
    -H "Prefer: return=representation" \
    -d "{\"name\":\"${TEST_NAME}\",\"trial_days\":0,\"official_days\":0,\"account_status\":\"normal\",\"membership_plan\":\"free\",\"edition\":\"merchant\"}" \
    || echo "000")"
  echo "HTTP ${HTTP_CODE}"
  head -c 300 /tmp/meoo-tenant-probe.json 2>/dev/null || true
  echo
  if [[ "$HTTP_CODE" == "201" ]] || [[ "$HTTP_CODE" == "200" ]]; then
    TID="$(python3 -c "import json; print(json.load(open('/tmp/meoo-tenant-probe.json'))[0]['id'])" 2>/dev/null || true)"
    if [[ -n "$TID" ]]; then
      curl -sS -m 10 -X DELETE "${BASE}/rest/v1/tenants?id=eq.${TID}" \
        -H "apikey: ${SRK}" -H "Authorization: Bearer ${SRK}" >/dev/null || true
      echo "OK: service_role 可写入 tenants，已删除探活行 ${TID}"
    else
      echo "OK: HTTP ${HTTP_CODE}（请人工确认响应）"
    fi
  else
    echo "FAIL: 仍无法 INSERT tenants。请检查 PostgREST 日志与 auth-api.env 中 SUPABASE_SERVICE_ROLE_KEY"
    exit 1
  fi
else
  echo "WARN: 未找到 SUPABASE_SERVICE_ROLE_KEY（$ENV_FILE），跳过 PostgREST 探活"
fi

echo ""
echo "完成。请在 cs.mofangdianai.com/login 重新注册。"
echo "若仍失败：sudo journalctl -u meoo-auth-api -n 50 --no-pager"
