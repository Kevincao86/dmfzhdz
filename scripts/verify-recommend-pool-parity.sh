#!/usr/bin/env bash
# 核对轻量推荐池与商家管理后台达人库数量一致（只读）
set -euo pipefail
BASE="${ERP_API_BASE:-http://139.196.42.5/erp-api}"
FULL="$BASE/meoo-ops-sync-registry"
HALL="$BASE/meoo-ops-mp-hall-registry?includeRecommendPool=1"

python3 - "$FULL" "$HALL" <<'PY'
import json, sys, urllib.request

def get(url):
    with urllib.request.urlopen(url, timeout=25) as r:
        return json.loads(r.read().decode())

full, hall = get(sys.argv[1]), get(sys.argv[2])
checks = [
    ("talentLibraryEntries", "talentLibraryCount"),
    ("shootTeamLibraryEntries", "shootTeamLibraryCount"),
    ("editTeamLibraryEntries", "editTeamLibraryCount"),
    ("mpPrUsers", "mpPrUsersCount"),
]
failed = 0
for key, meta_key in checks:
    fc = len(full.get(key) or [])
    hc = len(hall.get(key) or [])
    mc = int((hall.get("_recommendPoolMeta") or {}).get(meta_key) or -1)
    ok = fc == hc and (mc < 0 or mc == hc)
    print(f"{key}: full={fc} hall={hc} meta={mc} {'OK' if ok else 'FAIL'}")
    if not ok:
        failed += 1
# follower parity sample
fl = full.get("talentLibraryEntries") or []
hl = {e["id"]: e for e in (hall.get("talentLibraryEntries") or [])}
bad = 0
for e in fl:
    h = hl.get(e.get("id"))
    if not h:
        bad += 1
        continue
    if int(e.get("followers") or 0) != int(h.get("followers") or 0):
        bad += 1
print(f"library_follower_mismatch={bad}")
if bad:
    failed += 1
sys.exit(1 if failed else 0)
PY

echo "OK: 轻量推荐池与商家后台注册表一致"
