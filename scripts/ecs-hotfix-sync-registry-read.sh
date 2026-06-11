#!/usr/bin/env bash
# ⚠️ 会写 ops_registry_snapshot（动库）— 须项目方人工确认 10 次后再跑
#
# 默认请用不写库的:
#   cd ~/app && bash scripts/ecs-deploy-light-safe.sh
#
# 仅当明确要「从 mp_accounts 重建注册表切片」时:
#   CONFIRM_REGISTRY_WRITE=YES cd ~/app && bash scripts/ecs-hotfix-sync-registry-read.sh

set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"

if [[ "${CONFIRM_REGISTRY_WRITE:-}" != "YES" ]]; then
  echo "FAIL: 本脚本会写入 ops_registry_snapshot（动库）。"
  echo "若只需部署 API，请执行: bash scripts/ecs-deploy-light-safe.sh"
  echo "若确需重建达人/PR 库切片，请设置: CONFIRM_REGISTRY_WRITE=YES"
  exit 1
fi

bash "$ROOT/scripts/ecs-deploy-auth-api.sh"
bash "$ROOT/scripts/ecs-repair-registry-talent-libraries.sh"

echo ""
echo "=== 验收 sync-registry ==="
curl -sS -m 30 "http://127.0.0.1:3001/api/meoo-ops-sync-registry" | python3 - <<'PY'
import json, sys
d = json.load(sys.stdin)
if d.get("ok") is False:
    print("FAIL:", d)
    sys.exit(1)
for k in ("mpTalentMembers", "talentLibraryEntries", "mpPrUsers"):
    v = d.get(k)
    print(f"  {k}: {len(v) if isinstance(v, list) else v}")
PY

echo ""
echo "OK: 刷新 admin.mofangdianai.com/talent-library 应能看到达人数据"
