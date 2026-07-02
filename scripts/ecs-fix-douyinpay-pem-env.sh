#!/usr/bin/env bash
# 轻量一键修复：抖音支付私钥改读 PEM 文件，去掉 auth-api.env 内联 PEM（解决 DECODER unsupported）
#
# 前置：~/stack/douyinpay-private.pem 已存在且 openssl 可读
# 用法（SSH admin@139.196.42.5）：
#   cd ~/app && git pull && bash scripts/ecs-fix-douyinpay-pem-env.sh
set -euo pipefail

STACK="${STACK_DIR:-$HOME/stack}"
ENV="$STACK/auth-api.env"
PRIV="$STACK/douyinpay-private.pem"
PLAT="$STACK/douyinpay-platform-public.pem"
PRIV_PKCS8="$STACK/douyinpay-private.pkcs8.pem"

die() { echo "FAIL: $*" >&2; exit 1; }

[[ -f "$PRIV" ]] || die "找不到 $PRIV，请先运行 bash scripts/ecs-setup-douyinpay-env.sh 或上传商户私钥"

echo "==> 校验并转为 PKCS#8"
openssl pkey -in "$PRIV" -noout
if grep -q 'BEGIN RSA PRIVATE KEY' "$PRIV" 2>/dev/null; then
  openssl pkcs8 -topk8 -nocrypt -inform PEM -outform PEM -in "$PRIV" -out "$PRIV_PKCS8"
  cp -f "$PRIV_PKCS8" "$PRIV"
  echo "已转换 RSA PKCS#1 → PKCS#8"
fi
openssl pkey -in "$PRIV" -noout && echo "私钥 OK"

python3 <<PY
from pathlib import Path
import os

stack = Path(os.environ.get("STACK_DIR", Path.home() / "stack"))
env_path = stack / "auth-api.env"
priv = stack / "douyinpay-private.pem"
plat = stack / "douyinpay-platform-public.pem"

strip_prefixes = (
    "DOUYINPAY_PRIVATE_KEY=",
    "DOUYINPAY_PLATFORM_PUBLIC_KEY=",
    "DOUYINPAY_PRIVATE_KEY_FILE=",
    "DOUYINPAY_PLATFORM_PUBLIC_KEY_FILE=",
)
text = env_path.read_text(encoding="utf-8") if env_path.exists() else ""
keep = []
skip_pem = False
for ln in text.splitlines():
    if any(ln.startswith(p) for p in strip_prefixes):
        continue
    if "BEGIN PRIVATE KEY" in ln or "BEGIN PUBLIC KEY" in ln or "BEGIN CERTIFICATE" in ln:
        skip_pem = True
        continue
    if skip_pem:
        if "END PRIVATE KEY" in ln or "END PUBLIC KEY" in ln or "END CERTIFICATE" in ln:
            skip_pem = False
        continue
    if ln.strip():
        keep.append(ln)

lines = [
    f"DOUYINPAY_PRIVATE_KEY_FILE={priv}",
]
if plat.exists():
    lines.append(f"DOUYINPAY_PLATFORM_PUBLIC_KEY_FILE={plat}")

env_path.write_text("\n".join(keep + lines) + "\n", encoding="utf-8")
print("OK: 已写入", env_path)
print("  DOUYINPAY_PRIVATE_KEY_FILE=", priv)
if plat.exists():
    print("  DOUYINPAY_PLATFORM_PUBLIC_KEY_FILE=", plat)
PY

echo "==> 重启 auth-api"
if [[ -d "$HOME/app" ]]; then
  cd "$HOME/app" && bash scripts/ecs-deploy-auth-api.sh
else
  sudo systemctl restart meoo-auth-api
fi

sleep 2
echo "==> 探活"
curl -sS "http://127.0.0.1:3001/api/meoo-douyin-pay-notify?detail=1&probeNative=1" || true
echo ""
