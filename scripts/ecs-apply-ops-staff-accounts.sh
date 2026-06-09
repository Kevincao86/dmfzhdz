#!/usr/bin/env bash
# 运营管控台 ops_staff_accounts → 轻量 ECS Postgres（PostgREST + meoo-auth-api）
#
# 在轻量 ECS 上（推荐）：
#   cd ~/app && git pull gitee main && bash scripts/ecs-apply-ops-staff-accounts.sh
#
# 本机经 SSH（需能 ssh admin@139.196.42.5）：
#   ECS_HOST=admin@139.196.42.5 bash scripts/ecs-apply-ops-staff-accounts.sh --remote

set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
ECS_HOST="${ECS_HOST:-admin@139.196.42.5}"
MIGRATION="20260524120000_ops_staff_accounts.sql"
PG_PORT="${ECS_PG_PORT:-5433}"
PG_DB="${ECS_PG_DB:-postgres}"

run_apply() {
  local app_root="$1"
  local mig_path="$app_root/supabase/migrations/$MIGRATION"

  if [[ ! -f "$mig_path" ]]; then
    mig_path="$ROOT/supabase/migrations/$MIGRATION"
  fi
  if [[ ! -f "$mig_path" ]]; then
    echo "FATAL: 找不到 $MIGRATION"
    exit 1
  fi

  if [[ ! -f "$HOME/stack/db-credentials.txt" ]]; then
    echo "FATAL: 缺少 ~/stack/db-credentials.txt（请在轻量 ECS 上执行）"
    exit 1
  fi
  # shellcheck disable=SC1090
  source "$HOME/stack/db-credentials.txt"
  export PGPASSWORD="$POSTGRES_PASSWORD"

  echo "=== 1) 应用迁移 $MIGRATION ==="
  sudo -u postgres psql -h 127.0.0.1 -p "$PG_PORT" -d "$PG_DB" -v ON_ERROR_STOP=1 -f "$mig_path"

  local grants="$app_root/supabase/ecs_service_role_grants.sql"
  if [[ -f "$grants" ]]; then
    echo "=== 2) GRANT service_role（PostgREST 可读写）==="
    sudo -u postgres psql -h 127.0.0.1 -p "$PG_PORT" -d "$PG_DB" -v ON_ERROR_STOP=1 -f "$grants"
  fi

  echo "=== 3) 写入主账号 18768501283（默认密码 kaiyedaji888 的 SHA-256）==="
  sudo -u postgres psql -h 127.0.0.1 -p "$PG_PORT" -d "$PG_DB" -v ON_ERROR_STOP=1 <<'EOSQL'
DELETE FROM public.ops_staff_accounts
 WHERE phone = '18768581283' AND role = 'super_admin';

INSERT INTO public.ops_staff_accounts (
  id, phone, display_name, role, password_hash, permissions, status, created_at, updated_at
) VALUES (
  'ops_master',
  '18768501283',
  '超级管理员',
  'super_admin',
  '973e095059955e0c458333ac4bb54113de5c54011390d3ad2869ed1c9af493e0',
  '["customers","announcements","payment_orders","recruitment_orders","mp_recruitment_orders","talent_library","ai_models","support"]'::jsonb,
  'active',
  now(),
  now()
)
ON CONFLICT (id) DO UPDATE SET
  phone = EXCLUDED.phone,
  display_name = EXCLUDED.display_name,
  role = EXCLUDED.role,
  password_hash = EXCLUDED.password_hash,
  permissions = EXCLUDED.permissions,
  status = EXCLUDED.status,
  updated_at = now();
EOSQL

  echo "=== 4) 校验 ==="
  sudo -u postgres psql -h 127.0.0.1 -p "$PG_PORT" -d "$PG_DB" -c "
SELECT to_regclass('public.ops_staff_accounts') AS ops_staff_accounts;
SELECT id, phone, role, status FROM public.ops_staff_accounts ORDER BY created_at;
"

  if systemctl is-active --quiet meoo-postgrest 2>/dev/null; then
    echo "=== 5) 重启 PostgREST（刷新 schema cache）==="
    sudo systemctl restart meoo-postgrest
    sleep 2
  fi

  if systemctl list-unit-files meoo-auth-api.service &>/dev/null; then
    echo "=== 6) 重启 meoo-auth-api ==="
    sudo systemctl restart meoo-auth-api || true
    sleep 2
  fi

  echo "=== 7) 探活（可选）==="
  curl -sS -m 8 "https://mofangdianai.com/erp-api/meoo-erp-api-health" | head -c 400 || true
  echo
  echo "完成。请在 Vercel 运营台用 18768501283 登录，Network 中 POST /api/meoo-ops-staff-login 应返回 200 且含 sessionToken。"
}

if [[ "${1:-}" == "--remote" ]]; then
  echo "远程执行 → $ECS_HOST"
  ssh "$ECS_HOST" "cd ~/app && git pull gitee main && bash scripts/ecs-apply-ops-staff-accounts.sh"
  exit 0
fi

run_apply "${ECS_APP:-$HOME/app}"
