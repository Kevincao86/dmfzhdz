#!/usr/bin/env bash
# ECS 紧急补丁：auth-api 增加 /api/mp-cronet-ping（git pull 不到最新时用）
# 用法: cd ~/app && bash scripts/ecs-hotfix-mp-cronet-ping.sh

set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
# shellcheck source=ecs-resolve-erp-path.sh
source "$ROOT/scripts/ecs-resolve-erp-path.sh"
ERP="$(ecs_resolve_erp_dir "$ROOT")"
F="$ERP/scripts/ecs-auth-api-server.ts"
PORT="${AUTH_API_PORT:-3001}"

if [[ ! -f "$F" ]]; then
  echo "FATAL: 缺少 $F"
  exit 1
fi

if grep -q "'/api/mp-cronet-ping'" "$F"; then
  echo "OK: 已有 mp-cronet-ping 路由"
else
  cp "$F" "${F}.bak.$(date +%Y%m%d%H%M%S)"
  python3 <<PY
from pathlib import Path
p = Path("$F")
text = p.read_text(encoding="utf-8")
block = """
  '/api/mp-cronet-ping': async (_req, res) => {
    res.statusCode = 200
    res.setHeader('Content-Type', 'application/json; charset=utf-8')
    res.setHeader('Access-Control-Allow-Origin', '*')
    res.end(
      JSON.stringify({
        ok: true,
        via: 'auth-api-hotfix',
        revision: ECS_AUTH_API_ROUTE_REVISION,
      }),
    )
  },
"""
needle = "  // tokenmix 依赖"
if needle not in text:
    raise SystemExit("未找到插入点 // tokenmix")
text = text.replace(needle, block + needle, 1)
text = text.replace(
    "export const ECS_AUTH_API_ROUTE_REVISION = '20260603-mp-wx-login-get'",
    "export const ECS_AUTH_API_ROUTE_REVISION = '20260604-mp-cronet-ping'",
)
if "20260604-mp-cronet-ping" not in text and "ECS_AUTH_API_ROUTE_REVISION" in text:
    import re
    text = re.sub(
        r"export const ECS_AUTH_API_ROUTE_REVISION = '[^']+'",
        "export const ECS_AUTH_API_ROUTE_REVISION = '20260604-mp-cronet-ping'",
        text,
        count=1,
    )
p.write_text(text, encoding="utf-8")
print("已写入 /api/mp-cronet-ping")
PY
fi

bash "$ROOT/scripts/ecs-install-auth-api-systemd.sh" 2>/dev/null || {
  sudo systemctl restart meoo-auth-api
  sleep 3
}

curl -sf "http://127.0.0.1:${PORT}/api/mp-cronet-ping" | head -c 200
echo
echo "公网: curl -sS https://mofangdianai.com/erp-api/mp-cronet-ping"
