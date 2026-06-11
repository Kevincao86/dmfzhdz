#!/usr/bin/env bash
# 紧急：运营台达人库/PR库 0 条 — sync-registry 500（isIceMpOrder）+ 恢复库数据
# 轻量 admin 控制台粘贴执行:
#   cd ~/app && bash scripts/ecs-git-pull-gitee.sh && bash scripts/ecs-hotfix-sync-registry-read.sh

set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"

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
