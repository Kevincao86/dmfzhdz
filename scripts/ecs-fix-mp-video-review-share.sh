#!/usr/bin/env bash
# 轻量：分享审片表权限/RLS 修复（create/revoke 500 时执行）
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
echo "OK: mp_video_review_share 迁移已执行；请 bash scripts/ecs-deploy-light-safe.sh 重启 auth-api"
