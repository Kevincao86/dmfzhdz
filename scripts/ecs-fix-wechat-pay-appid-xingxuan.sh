#!/usr/bin/env bash
# 修复微信支付 appid 与 mch_id 不匹配（星选 Native 扫码须用 MP 小程序 AppID）
#
# 轻量：bash ~/app/scripts/ecs-fix-wechat-pay-appid-xingxuan.sh --local
# 本机：bash scripts/ecs-fix-wechat-pay-appid-xingxuan.sh --remote

set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
ENV_FILE="${AUTH_API_ENV:-$HOME/stack/auth-api.env}"
LIGHT_HOST="${LIGHT_HOST:-admin@139.196.42.5}"
DEFAULT_XINGXUAN_APPID="${XINGXUAN_MP_APPID:-wxd3da81937eb72241}"

fix_env_file() {
  local env_file="$1"
  local appid="$2"
  [[ -f "$env_file" ]] || { echo "FAIL: 缺少 $env_file"; exit 1; }
  cp "$env_file" "${env_file}.bak.$(date +%Y%m%d%H%M%S)"
  PAY_APPID="$appid" ENV_TARGET="$env_file" python3 - <<'PY'
from pathlib import Path
import os, re

p = Path(os.environ["ENV_TARGET"])
appid = os.environ["PAY_APPID"].strip()
text = p.read_text(encoding="utf-8")
mp = ""
m = re.search(r"^MP_WECHAT_APPID=(.+)$", text, re.M)
if m:
    mp = m.group(1).strip()
target = appid or mp
if not target:
    raise SystemExit("FAIL: 无 XINGXUAN_MP_APPID 且 env 内无 MP_WECHAT_APPID")
line = f"WECHAT_PAY_APP_ID={target}"
pat = re.compile(r"^WECHAT_PAY_APPID=.*$|^WECHAT_PAY_APP_ID=.*$", re.M)
text = pat.sub(line, text) if pat.search(text) else text.rstrip() + "\n" + line + "\n"
p.write_text(text, encoding="utf-8")
print(f"OK: WECHAT_PAY_APP_ID={target}")
PY
  grep -E '^WECHAT_PAY_APP_ID=|^MP_WECHAT_APPID=|^ERP_MP_WECHAT_APPID=' "$env_file" | sed 's/SECRET=.*/SECRET=***/'
}

restart_auth_api() {
  sudo systemctl restart meoo-auth-api
  sleep 3
  curl -sS -m 8 http://127.0.0.1:3001/erp-api/meoo-wechat-pay-notify | head -c 400 || true
  echo ""
}

if [[ "${1:-}" == "--local" ]]; then
  fix_env_file "$ENV_FILE" "$DEFAULT_XINGXUAN_APPID"
  restart_auth_api
  exit 0
fi

if [[ "${1:-}" == "--remote" ]] || [[ -z "${1:-}" ]]; then
  ssh -o ConnectTimeout=12 "$LIGHT_HOST" "XINGXUAN_MP_APPID='$DEFAULT_XINGXUAN_APPID' bash -s -- --local" <"$ROOT/scripts/ecs-fix-wechat-pay-appid-xingxuan.sh"
  exit 0
fi

echo "用法: $0 [--remote|--local]"
exit 1
