#!/usr/bin/env bash
# 轻量 auth-api.env 写入商家 ERP 小程序微信凭证（与达人撮合 MP_WECHAT_* 并存）
#
# 本机执行（Secret 勿提交 git）：
#   bash scripts/ecs-setup-erp-mp-wechat-env.sh \
#     --appid wxdf5f53fb6b14ace9 \
#     --secret '你的AppSecret'
#
# 已在轻量 SSH 内：
#   bash ~/app/scripts/ecs-setup-erp-mp-wechat-env.sh --appid ... --secret '...' --local
#
# ERP 小程序内微信支付须 AppID 一致时加：--sync-wechat-pay-appid

set -euo pipefail

APPID=""
SECRET=""
LOCAL=0
SYNC_PAY=0
ENV_FILE="${AUTH_API_ENV:-$HOME/stack/auth-api.env}"
LIGHT_HOST="${LIGHT_HOST:-admin@139.196.42.5}"

usage() {
  echo "用法: $0 --appid <ERP小程序AppID> --secret <AppSecret> [--local] [--sync-wechat-pay-appid]"
  exit 1
}

while [[ $# -gt 0 ]]; do
  case "$1" in
    --appid) APPID="${2:-}"; shift 2 ;;
    --secret) SECRET="${2:-}"; shift 2 ;;
    --local) LOCAL=1; shift ;;
    --sync-wechat-pay-appid) SYNC_PAY=1; shift ;;
    -h|--help) usage ;;
    *) echo "未知参数: $1"; usage ;;
  esac
done

[[ -n "$APPID" && -n "$SECRET" ]] || usage

write_erp_mp_env() {
  local env_file="$1"
  ERP_MP_WECHAT_APPID="$APPID" \
  ERP_MP_WECHAT_SECRET="$SECRET" \
  SYNC_PAY="$SYNC_PAY" \
  ENV_TARGET="$env_file" \
  python3 - <<'PY'
from pathlib import Path
import os, re

p = Path(os.environ["ENV_TARGET"])
text = p.read_text(encoding="utf-8")
pairs = {
    "ERP_MP_WECHAT_APPID": os.environ["ERP_MP_WECHAT_APPID"],
    "ERP_MP_WECHAT_SECRET": os.environ["ERP_MP_WECHAT_SECRET"],
}
if os.environ.get("SYNC_PAY") == "1":
    pairs["WECHAT_PAY_APP_ID"] = os.environ["ERP_MP_WECHAT_APPID"]
for key, val in pairs.items():
    line = f"{key}={val}"
    pat = re.compile(rf"^{re.escape(key)}=.*$", re.M)
    text = pat.sub(line, text) if pat.search(text) else text.rstrip() + "\n" + line + "\n"
p.write_text(text, encoding="utf-8")
PY
}

restart_and_health() {
  sudo systemctl restart meoo-auth-api
  sleep 3
  curl -sS -m 8 http://127.0.0.1:3001/erp-api/meoo-erp-api-health | head -c 200 || true
  echo ""
}

if [[ "$LOCAL" == 1 ]]; then
  [[ -f "$ENV_FILE" ]] || { echo "FAIL: 缺少 $ENV_FILE"; exit 1; }
  cp "$ENV_FILE" "${ENV_FILE}.bak.$(date +%Y%m%d%H%M%S)"
  write_erp_mp_env "$ENV_FILE"
  echo "OK: 已写入 $ENV_FILE (ERP_MP_WECHAT_APPID=$APPID)"
  grep -E '^ERP_MP_WECHAT_APPID=|^MP_WECHAT_APPID=|^WECHAT_PAY_APP_ID=' "$ENV_FILE" | sed 's/SECRET=.*/SECRET=***/'
  restart_and_health
  exit 0
fi

PAYLOAD_B64="$(
  APPID="$APPID" SECRET="$SECRET" SYNC_PAY="$SYNC_PAY" python3 - <<'PY'
import base64, json, os
print(base64.b64encode(json.dumps({
    "appid": os.environ["APPID"],
    "secret": os.environ["SECRET"],
    "sync_pay": os.environ.get("SYNC_PAY") == "1",
}, ensure_ascii=False).encode()).decode())
PY
)"

ssh -o ConnectTimeout=12 "$LIGHT_HOST" "PAYLOAD_B64='$PAYLOAD_B64' bash -s" <<'REMOTE'
set -euo pipefail
ENV_FILE="$HOME/stack/auth-api.env"
[[ -f "$ENV_FILE" ]] || { echo "FAIL: 缺少 $ENV_FILE"; exit 1; }
cp "$ENV_FILE" "${ENV_FILE}.bak.$(date +%Y%m%d%H%M%S)"
python3 - <<'PY'
from pathlib import Path
import base64, json, os, re
data = json.loads(base64.b64decode(os.environ["PAYLOAD_B64"]).decode())
p = Path(os.environ["HOME"]) / "stack" / "auth-api.env"
text = p.read_text(encoding="utf-8")
pairs = {
    "ERP_MP_WECHAT_APPID": data["appid"],
    "ERP_MP_WECHAT_SECRET": data["secret"],
}
if data.get("sync_pay"):
    pairs["WECHAT_PAY_APP_ID"] = data["appid"]
for key, val in pairs.items():
    line = f"{key}={val}"
    pat = re.compile(rf"^{re.escape(key)}=.*$", re.M)
    text = pat.sub(line, text) if pat.search(text) else text.rstrip() + "\n" + line + "\n"
p.write_text(text, encoding="utf-8")
print("OK: ERP_MP_WECHAT_APPID=" + data["appid"])
PY
grep -E '^ERP_MP_WECHAT_APPID=|^MP_WECHAT_APPID=|^WECHAT_PAY_APP_ID=' "$ENV_FILE" | sed 's/SECRET=.*/SECRET=***/'
sudo systemctl restart meoo-auth-api
sleep 3
curl -sS -m 8 http://127.0.0.1:3001/erp-api/meoo-erp-api-health | head -c 200 || true
echo ""
REMOTE
