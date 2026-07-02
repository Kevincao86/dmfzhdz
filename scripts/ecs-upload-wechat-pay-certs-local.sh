#!/usr/bin/env bash
# 本机一键：上传微信支付 PEM 到轻量并写入 auth-api.env、重启 auth-api
#
# 用法（Mac 终端，需能 ssh admin@139.196.42.5）：
#   bash scripts/ecs-upload-wechat-pay-certs-local.sh
#
# 可选环境变量：
#   LIGHT_HOST=admin@139.196.42.5
#   WECHAT_KEY_PEM=$HOME/Downloads/1747475470_20260627_cert/apiclient_key.pem
#   WECHAT_PUB_PEM=$HOME/Downloads/pub_key.pem
#   WECHAT_CERT_PEM=$HOME/Downloads/1747475470_20260627_cert/apiclient_cert.pem
set -euo pipefail

LIGHT_HOST="${LIGHT_HOST:-admin@139.196.42.5}"
KEY_PEM="${WECHAT_KEY_PEM:-$HOME/Downloads/1747475470_20260627_cert/apiclient_key.pem}"
PUB_PEM="${WECHAT_PUB_PEM:-$HOME/Downloads/pub_key.pem}"
CERT_PEM="${WECHAT_CERT_PEM:-$HOME/Downloads/1747475470_20260627_cert/apiclient_cert.pem}"

die() { echo "FAIL: $*" >&2; exit 1; }

[[ -f "$KEY_PEM" ]] || die "找不到私钥: $KEY_PEM"
[[ -f "$PUB_PEM" ]] || die "找不到公钥: $PUB_PEM"
grep -q 'BEGIN PRIVATE KEY' "$KEY_PEM" || die "不是 apiclient_key.pem（需 BEGIN PRIVATE KEY）"
grep -q 'BEGIN PUBLIC KEY' "$PUB_PEM" || die "不是 pub_key.pem（需 BEGIN PUBLIC KEY）"

echo "==> 上传到 $LIGHT_HOST:~/stack/"
ssh "$LIGHT_HOST" 'mkdir -p ~/stack'
scp "$KEY_PEM" "$LIGHT_HOST:~/stack/wechat-private.pem"
scp "$PUB_PEM" "$LIGHT_HOST:~/stack/wechat-platform-public.pem"
if [[ -f "$CERT_PEM" ]]; then
  scp "$CERT_PEM" "$LIGHT_HOST:~/stack/wechat-apiclient-cert.pem"
fi

echo "==> 轻量：写入 env + 校验 + 重启 auth-api"
ssh "$LIGHT_HOST" bash -s <<'REMOTE'
set -euo pipefail
KEY="$HOME/stack/wechat-private.pem"
PUB="$HOME/stack/wechat-platform-public.pem"
ENV="$HOME/stack/auth-api.env"

openssl pkey -in "$KEY" -noout
echo "私钥文件 OK"

python3 <<'PY'
from pathlib import Path

key = Path.home() / "stack/wechat-private.pem"
pub = Path.home() / "stack/wechat-platform-public.pem"
lines_out = [
    f"WECHAT_PAY_PRIVATE_KEY_FILE={key}",
    f"WECHAT_PAY_PLATFORM_PUBLIC_KEY_FILE={pub}",
]
env = Path.home() / "stack/auth-api.env"
text = env.read_text(encoding="utf-8") if env.exists() else ""
strip_prefixes = (
    "WECHAT_PAY_PRIVATE_KEY=",
    "WECHAT_PAY_PRIVATE_KEY_PEM=",
    "WECHAT_PAY_PLATFORM_PUBLIC_KEY=",
    "WECHAT_PAY_PLATFORM_CERT_PEM=",
    "WECHAT_PAY_PRIVATE_KEY_FILE=",
    "WECHAT_PAY_PLATFORM_PUBLIC_KEY_FILE=",
)
wechat_inline = {
    "WECHAT_PAY_PRIVATE_KEY",
    "WECHAT_PAY_PRIVATE_KEY_PEM",
    "WECHAT_PAY_PLATFORM_PUBLIC_KEY",
    "WECHAT_PAY_PLATFORM_CERT_PEM",
}
keep = []
skip_pem = False
for ln in text.splitlines():
    key_name = ln.split("=", 1)[0].strip() if "=" in ln else ""
    if any(ln.startswith(p) for p in strip_prefixes):
        if key_name in wechat_inline and "BEGIN" in ln and "END PRIVATE KEY" not in ln and "END PUBLIC KEY" not in ln:
            skip_pem = True
        continue
    if skip_pem:
        if "END PRIVATE KEY" in ln or "END PUBLIC KEY" in ln:
            skip_pem = False
        continue
    if ln.strip():
        keep.append(ln)
env.write_text("\n".join(keep + lines_out) + "\n", encoding="utf-8")
print("auth-api.env 已更新 WECHAT_PAY_*_FILE 指向 stack PEM")
PY

# 若 env 缺商户证书序列号，从 apiclient_cert.pem 提取（大写 hex，无 0x 前缀）
CERT="$HOME/stack/wechat-apiclient-cert.pem"
if [[ -f "$CERT" ]] && ! grep -q '^WECHAT_PAY_MERCHANT_SERIAL=.\+' "$ENV" 2>/dev/null; then
  SERIAL="$(openssl x509 -in "$CERT" -noout -serial 2>/dev/null | sed 's/serial=//' | tr 'a-f' 'A-F')"
  if [[ -n "$SERIAL" ]]; then
    sed -i '/^WECHAT_PAY_MERCHANT_SERIAL=/d' "$ENV"
    echo "WECHAT_PAY_MERCHANT_SERIAL=$SERIAL" >> "$ENV"
    echo "已写入 WECHAT_PAY_MERCHANT_SERIAL=$SERIAL"
  fi
fi

cd ~/app && bash scripts/ecs-deploy-auth-api.sh

node --input-type=module -e "
import { createSign } from 'node:crypto';
import { readFileSync } from 'node:fs';
const pem = readFileSync(process.env.HOME + '/stack/wechat-private.pem', 'utf8');
createSign('RSA-SHA256').update('ping').sign(pem, 'base64');
console.log('Node 签名自检 OK');
"
REMOTE

echo ""
echo "OK: 证书已上传并生效。可用 prepay 接口验证（替换真实 sessionToken）："
echo "  export T=你的lingqi_mp_session_token"
echo "  curl -sS -X POST 'https://mofangdianai.com/erp-api/meoo-ops-mp-auth' -H 'Content-Type: application/json' -d \"{\\\"action\\\":\\\"membership_wechat_prepay\\\",\\\"sessionToken\\\":\\\"\$T\\\",\\\"planId\\\":\\\"pro\\\",\\\"workRole\\\":\\\"talent\\\",\\\"billing\\\":\\\"monthly\\\",\\\"payMode\\\":\\\"native\\\"}\""
