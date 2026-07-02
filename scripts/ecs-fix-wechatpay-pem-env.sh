#!/usr/bin/env bash
# 轻量一键修复：微信 PEM 改读 stack 文件（避免抖音 setup 误删 env 内联 PEM 后无法支付）
#
# 用法（SSH admin@139.196.42.5）：
#   cd ~/app && bash scripts/ecs-git-pull-gitee.sh && bash scripts/ecs-fix-wechatpay-pem-env.sh
#
# 前置：~/stack/wechat-private.pem 与 ~/stack/wechat-platform-public.pem 已存在
# （可用 scripts/ecs-upload-wechat-pay-certs-local.sh 从本机上传）
set -euo pipefail

STACK="${STACK_DIR:-$HOME/stack}"
ENV="$STACK/auth-api.env"
KEY="$STACK/wechat-private.pem"
PUB="$STACK/wechat-platform-public.pem"
CERT="$STACK/wechat-apiclient-cert.pem"

die() { echo "FAIL: $*" >&2; exit 1; }

[[ -f "$KEY" ]] || die "找不到 $KEY，请先上传 apiclient_key.pem 到 ~/stack/wechat-private.pem"
[[ -f "$PUB" ]] || die "找不到 $PUB，请先上传平台公钥到 ~/stack/wechat-platform-public.pem"

grep -qE 'BEGIN (RSA )?PRIVATE KEY' "$KEY" || die "wechat-private.pem 格式不对"
grep -qE 'BEGIN (RSA )?PUBLIC KEY' "$PUB" || die "wechat-platform-public.pem 格式不对"
openssl pkey -in "$KEY" -noout && echo "微信私钥 openssl 校验 OK"

python3 <<PY
from pathlib import Path
import os

stack = Path(os.environ.get("STACK_DIR", Path.home() / "stack"))
env_path = stack / "auth-api.env"
key = stack / "wechat-private.pem"
pub = stack / "wechat-platform-public.pem"

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
text = env_path.read_text(encoding="utf-8") if env_path.exists() else ""
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

lines = [
    f"WECHAT_PAY_PRIVATE_KEY_FILE={key}",
    f"WECHAT_PAY_PLATFORM_PUBLIC_KEY_FILE={pub}",
]
env_path.parent.mkdir(parents=True, exist_ok=True)
env_path.write_text("\n".join(keep + lines) + "\n", encoding="utf-8")
print("OK: 已写入", env_path)
PY

if [[ -f "$CERT" ]] && ! grep -q '^WECHAT_PAY_MERCHANT_SERIAL=.\+' "$ENV" 2>/dev/null; then
  SERIAL="$(openssl x509 -in "$CERT" -noout -serial 2>/dev/null | sed 's/serial=//' | tr 'a-f' 'A-F' || true)"
  if [[ -n "$SERIAL" ]]; then
    sed -i '/^WECHAT_PAY_MERCHANT_SERIAL=/d' "$ENV"
    echo "WECHAT_PAY_MERCHANT_SERIAL=$SERIAL" >> "$ENV"
    echo "已写入 WECHAT_PAY_MERCHANT_SERIAL=$SERIAL"
  fi
fi

echo "==> 重启 auth-api"
if [[ -d "$HOME/app" ]]; then
  cd "$HOME/app" && bash scripts/ecs-deploy-auth-api.sh
else
  sudo systemctl restart meoo-auth-api
fi

sleep 2
echo "==> 探活"
curl -sS "http://127.0.0.1:3001/api/meoo-wechat-pay-notify" || true
echo ""
