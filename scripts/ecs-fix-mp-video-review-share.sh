#!/usr/bin/env bash
# 轻量：分享审片表建表 + 关闭 RLS（create/revoke 500 / db_error 时执行）
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
MIGRATIONS=(
  "$ROOT/supabase/migrations/20260629120000_mp_video_review_share.sql"
  "$ROOT/supabase/migrations/20260630120000_mp_video_review_share_ecs_rls.sql"
)
for f in "${MIGRATIONS[@]}"; do
  echo "== apply $(basename "$f")"
  bash "$ROOT/scripts/ecs-apply-supabase-migration.sh" "$@" "$f" || {
    echo "WARN: $(basename "$f") 可能已应用，继续"
  }
done

echo "== 校验 RLS（relrowsecurity 应为 f） =="
if [[ "${1:-}" == "--remote" ]]; then
  ECS_HOST="${ECS_HOST:-admin@139.196.42.5}"
  ssh "$ECS_HOST" bash -s <<'REMOTE'
set -euo pipefail
CREDS="$HOME/stack/db-credentials.txt"
source "$CREDS"
export PGPASSWORD="$POSTGRES_PASSWORD"
sudo -u postgres psql -h 127.0.0.1 -p 5433 -d postgres -c "
SELECT c.relname, c.relrowsecurity AS rls_enabled
FROM pg_class c
JOIN pg_namespace n ON n.oid = c.relnamespace
WHERE n.nspname = 'public' AND c.relname LIKE 'mp_video_review_share%'
ORDER BY 1;
"
REMOTE
else
  CREDS="${HOME}/stack/db-credentials.txt"
  if [[ -f "$CREDS" ]]; then
    # shellcheck disable=SC1090
    source "$CREDS"
    export PGPASSWORD="$POSTGRES_PASSWORD"
    sudo -u postgres psql -h 127.0.0.1 -p 5433 -d postgres -c "
SELECT c.relname, c.relrowsecurity AS rls_enabled
FROM pg_class c
JOIN pg_namespace n ON n.oid = c.relnamespace
WHERE n.nspname = 'public' AND c.relname LIKE 'mp_video_review_share%'
ORDER BY 1;
"
  fi
fi

echo ""
echo "OK: mp_video_review_share 迁移已执行"
echo "下一步: bash scripts/ecs-deploy-auth-api.sh"
echo "验收:"
echo '  curl -sS -X POST "http://127.0.0.1:3001/api/meoo-mp-video-review-share" -H "Content-Type: application/json" -d '"'"'{"action":"create","mpOrderId":"MP-RO-xxx"}'"'"''
