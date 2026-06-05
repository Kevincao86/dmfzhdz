#!/usr/bin/env bash
# 诊断 ops_registry_snapshot 中 AI Key / 短视频 / 云剪绑定是否丢失（不输出明文密钥）
#
# ECS: cd ~/app && bash scripts/ecs-diagnose-ops-registry.sh
# 本机: ECS_HOST=admin@139.196.42.5 bash scripts/ecs-diagnose-ops-registry.sh --remote

set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
ECS_HOST="${ECS_HOST:-admin@139.196.42.5}"

load_auth_env() {
  for f in "$HOME/stack/auth-api.env" "$HOME/stack/.env"; do
    if [[ -f "$f" ]]; then
      # shellcheck disable=SC1090
      set -a
      source "$f"
      set +a
      return 0
    fi
  done
  return 1
}

run_diag() {
  load_auth_env || true
  local base key
  base="${SUPABASE_URL:-${VITE_SUPABASE_URL:-http://127.0.0.1:8888}}"
  base="${base%/}"
  key="${SUPABASE_SERVICE_ROLE_KEY:-${SERVICE_ROLE_KEY:-}}"
  if [[ -z "$key" ]]; then
    echo "FAIL: 未找到 SUPABASE_SERVICE_ROLE_KEY（检查 ~/stack/auth-api.env）"
    exit 1
  fi

  echo "=== ops_registry_snapshot 绑定健康检查 ==="
  local body
  body=$(curl -sS -m 15 \
    "${base}/rest/v1/ops_registry_snapshot?id=eq.1&select=id,updated_at,registry" \
    -H "apikey: ${key}" \
    -H "Authorization: Bearer ${key}" || true)

  python3 - "$body" <<'PY'
import json, sys, hashlib

raw = sys.argv[1] if len(sys.argv) > 1 else "[]"
try:
    rows = json.loads(raw or "[]")
except json.JSONDecodeError as e:
    print("FAIL: 无法解析 PostgREST 响应:", e)
    print(raw[:400])
    sys.exit(1)

if not rows:
    print("FAIL: ops_registry_snapshot 无 id=1 行（注册表从未初始化或已被删）")
    sys.exit(1)

row = rows[0]
reg = row.get("registry") or {}
if not isinstance(reg, dict):
    print("FAIL: registry 列不是 JSON 对象")
    sys.exit(1)

def fp(s: str) -> str:
    t = (s or "").strip()
    if not t:
        return "—"
    return hashlib.sha256(t.encode()).hexdigest()[:12]

vk = reg.get("vendorKeys") or {}
va = reg.get("videoAi") or {}
tenants = reg.get("tenants") or []

print(f"row.id={row.get('id')} updated_at={row.get('updated_at')}")
print(f"registry keys: {len(reg)} top-level fields")
print(f"tenants: {len(tenants)}")
print(f"vendorKeysUpdatedAt: {reg.get('vendorKeysUpdatedAt', '—')}")
print(f"videoAiUpdatedAt: {reg.get('videoAiUpdatedAt', '—')}")

if len(reg) <= 2 and not vk and not va:
    print("")
    print("⚠️  registry 几乎为空 — 若曾执行 ecs-fix-ops-registry-rls.sh 旧版（POST registry:{}），绑定数据可能已被清空")

vendors = ["doubao", "qwen", "kimi", "minimax", "openai", "claude", "deepseek"]
print("")
print("vendorKeys:")
for v in vendors:
    val = vk.get(v) if isinstance(vk, dict) else None
    configured = bool(str(val or "").strip())
    print(f"  {v}: {'configured' if configured else 'MISSING'} fp={fp(str(val or ''))}")

print("")
print("videoAi:")
for k in [
    "klingAccessKey", "klingSecretKey", "arkVideoApiKey",
    "iceAppId", "iceAccessKeyId", "iceOutputOssUrlPrefix",
]:
    val = va.get(k) if isinstance(va, dict) else None
    configured = bool(str(val or "").strip())
    print(f"  {k}: {'configured' if configured else 'MISSING'} fp={fp(str(val or ''))}")

missing_ai = sum(1 for v in vendors if not str((vk or {}).get(v) or "").strip())
missing_video = sum(
    1
    for k in ("klingAccessKey", "klingSecretKey", "iceAppId", "iceOutputOssUrlPrefix")
    if not str((va or {}).get(k) or "").strip()
)
print("")
if missing_ai >= len(vendors) - 1:
    print("结论: 厂商 Key 基本全丢 → 运营台「AI 模型」页需重新保存各厂商 Key")
if missing_video >= 3:
    print("结论: 短视频/云剪凭据缺失 → 运营台需重新保存可灵与 ICE/OSS 绑定")
if missing_ai < len(vendors) - 1 and missing_video < 3:
    print("结论: 注册表绑定看起来存在；若仍报错请检查 ECS auth-api 是否已部署并 merge 注册表")
PY

  echo ""
  echo "=== erp-api 探活（公网）==="
  curl -sS -m 12 "https://mofangdianai.com/erp-api/meoo-merchant-ai-video-config" 2>/dev/null | head -c 320 || echo "(公网 curl 失败，可在 ECS 上 curl http://127.0.0.1:3001/...)"
  echo ""
}

if [[ "${1:-}" == "--remote" ]]; then
  echo "远程执行 → $ECS_HOST"
  ssh "$ECS_HOST" 'bash -s' < "$ROOT/scripts/ecs-diagnose-ops-registry.sh"
else
  run_diag
fi
