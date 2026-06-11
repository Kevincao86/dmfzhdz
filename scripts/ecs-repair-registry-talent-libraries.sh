#!/usr/bin/env bash
# 诊断并尝试从 mpTalentMembers 恢复达人库/团队库/PR 库（若注册表被部分覆盖）
#
# 轻量 admin:
#   cd ~/app && git pull && bash scripts/ecs-repair-registry-talent-libraries.sh
#
# 本机远程:
#   ECS_HOST=admin@139.196.42.5 bash scripts/ecs-repair-registry-talent-libraries.sh --remote

set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
PORT="${AUTH_API_PORT:-3001}"
API="http://127.0.0.1:${PORT}"

load_auth_env() {
  for f in "$HOME/stack/auth-api.env" "$HOME/stack/.env"; do
    if [[ -f "$f" ]]; then
      set -a
      # shellcheck disable=SC1090
      source "$f"
      set +a
      return 0
    fi
  done
  return 1
}

run_repair() {
  load_auth_env || true
  local base key
  base="${MEOO_SUPABASE_ADMIN_URL:-${SUPABASE_URL:-http://127.0.0.1:8888}}"
  base="${base%/}"
  key="${SUPABASE_SERVICE_ROLE_KEY:-${SERVICE_ROLE_KEY:-}}"
  if [[ -z "$key" ]]; then
    echo "FAIL: 未找到 SUPABASE_SERVICE_ROLE_KEY"
    exit 1
  fi

  echo "=== 1) 注册表各库条目计数 ==="
  curl -sS -m 20 \
    "${base}/rest/v1/ops_registry_snapshot?id=eq.1&select=updated_at,registry" \
    -H "apikey: ${key}" \
    -H "Authorization: Bearer ${key}" \
    | python3 - <<'PY'
import json, sys
raw = sys.stdin.read()
rows = json.loads(raw or "[]")
if not rows:
    print("FAIL: ops_registry_snapshot 无数据")
    sys.exit(1)
reg = rows[0].get("registry") or {}
if not isinstance(reg, dict):
    print("FAIL: registry 不是对象")
    sys.exit(1)
keys = sorted(reg.keys())
print(f"updated_at={rows[0].get('updated_at')} top_level_keys={len(keys)}")
for name in (
    "mpRecruitmentOrders", "mpTalentMembers", "mpPrUsers",
    "talentLibraryEntries", "shootTeamLibraryEntries", "editTeamLibraryEntries",
    "tenants", "vendorKeys",
):
    v = reg.get(name)
    if isinstance(v, list):
        print(f"  {name}: {len(v)}")
    elif isinstance(v, dict):
        print(f"  {name}: dict keys={len(v)}")
    elif v is None:
        print(f"  {name}: —")
    else:
        print(f"  {name}: {type(v).__name__}")
if len(keys) <= 3 and not reg.get("mpTalentMembers") and not reg.get("mpPrUsers"):
    print("")
    print("⚠️  registry 疑似被「仅招募单切片」覆盖，达人/PR 库可能已丢失。")
    print("   若有数据库备份请立即恢复；否则只能依赖用户重新注册 + 扫描会员池。")
PY

  if ! curl -sf -m 3 "${API}/api/meoo-auth-ping" >/dev/null 2>&1; then
    echo ""
    echo "WARN: auth-api :${PORT} 未监听，跳过库内扫描同步"
    exit 0
  fi

  echo ""
  echo "=== 2) 全量恢复：mp_accounts + 订单 applicants → 达人/PR/团队库 ==="
  RECOVER_BODY="$(curl -sS -m 120 -X POST "${API}/api/meoo-ops-registry-recover-libraries" \
    -H "Content-Type: application/json" \
    -d '{}' || true)"
  echo "${RECOVER_BODY}" | head -c 600
  echo ""

  echo ""
  echo "=== 3) 补扫拍摄/剪辑团队库 ==="
  SYNC_BODY="$(curl -sS -m 60 -X POST "${API}/api/meoo-ops-supplier-team-library-sync" \
    -H "Content-Type: application/json" \
    -d '{"roles":["shoot","edit"]}' || true)"
  echo "${SYNC_BODY}" | head -c 400
  echo ""

  echo ""
  echo "=== 4) 再次计数（恢复后）==="
  curl -sS -m 20 \
    "${base}/rest/v1/ops_registry_snapshot?id=eq.1&select=registry" \
    -H "apikey: ${key}" \
    -H "Authorization: Bearer ${key}" \
    | python3 - <<'PY'
import json, sys
rows = json.loads(sys.stdin.read() or "[]")
reg = (rows[0] or {}).get("registry") or {}
for name in ("mpTalentMembers", "shootTeamLibraryEntries", "editTeamLibraryEntries", "talentLibraryEntries", "mpPrUsers"):
    v = reg.get(name)
    print(f"  {name}: {len(v) if isinstance(v, list) else '—'}")
PY

  echo ""
  echo "OK: 若 mpTalentMembers>0 但库仍为 0，请在运营台各库页点击「扫描会员池」。"
}

if [[ "${1:-}" == "--remote" ]]; then
  ECS_HOST="${ECS_HOST:-admin@139.196.42.5}"
  echo "远程执行 → $ECS_HOST"
  ssh "$ECS_HOST" 'bash -s' < "$ROOT/scripts/ecs-repair-registry-talent-libraries.sh"
else
  run_repair
fi
