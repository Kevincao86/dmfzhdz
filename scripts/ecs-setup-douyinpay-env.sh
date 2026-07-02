#!/usr/bin/env bash
# 在轻量 ECS（139.196.42.5）上执行：把已上传的抖音支付 PEM 写入 auth-api.env 并重启 auth-api
#
# 前置：已通过 Lighthouse 文件管理上传
#   - 商户私钥_*.pem / .txt
#   - 商家公钥证书*.pem / .crt
# 另需（抖音支付商户平台 → 账户中心 → API 安全）：
#   - 商户号 DOUYINPAY_MCH_ID
#   - APIv3 密钥 DOUYINPAY_ENCRYPT_KEY（32 位）
#   - 平台公钥（非商家公钥证书）→ 可选 DOUYINPAY_PLATFORM_PEM=路径
#
# 用法（SSH / Lighthouse 终端，admin 用户）：
#   cd ~/app && git pull
#   DOUYINPAY_MCH_ID=你的商户号 \
#   DOUYINPAY_ENCRYPT_KEY=你的32位APIv3密钥 \
#   bash scripts/ecs-setup-douyinpay-env.sh
#
# 若平台公钥也上传了（文件名含「平台」）会自动识别；或指定：
#   DOUYINPAY_PLATFORM_PEM=$HOME/平台公钥.pem bash scripts/ecs-setup-douyinpay-env.sh
set -euo pipefail

STACK="${STACK_DIR:-$HOME/stack}"
ENV="$STACK/auth-api.env"
PRIV_DST="$STACK/douyinpay-private.pem"
CERT_DST="$STACK/douyinpay-merchant-cert.pem"
PLAT_DST="$STACK/douyinpay-platform-public.pem"

die() { echo "FAIL: $*" >&2; exit 1; }

find_upload() {
  local pattern="$1"
  find "$HOME" /tmp -maxdepth 6 -type f -name "$pattern" 2>/dev/null | head -1
}

list_upload_hint() {
  echo "当前 $HOME 下可能的 PEM 文件（供排查）："
  find "$HOME" /tmp -maxdepth 4 -type f \( -name '*.pem' -o -name '*.crt' -o -name '*私钥*' -o -name '*证书*' \) 2>/dev/null | head -15 || true
}

PRIV_SRC="${DOUYINPAY_PRIVATE_PEM:-$(find_upload '商户私钥*')}"
if [[ -z "$PRIV_SRC" || ! -f "$PRIV_SRC" ]]; then
  PRIV_SRC="$(find_upload '*private*.pem' 2>/dev/null || true)"
fi
if [[ -z "$PRIV_SRC" || ! -f "$PRIV_SRC" ]] && [[ -f "$PRIV_DST" ]]; then
  PRIV_SRC="$PRIV_DST"
  echo "使用已有 $PRIV_DST"
fi
CERT_SRC="${DOUYINPAY_MERCHANT_CERT_PEM:-$(find_upload '商家公钥证书*')}"
PLAT_SRC="${DOUYINPAY_PLATFORM_PEM:-$(find_upload '*平台*公钥*')}"

[[ -n "$PRIV_SRC" && -f "$PRIV_SRC" ]] || {
  list_upload_hint
  die "找不到商户私钥文件。请指定 DOUYINPAY_PRIVATE_PEM=路径 或把文件放在 $HOME 下（文件名含 商户私钥）"
}
[[ -n "$CERT_SRC" && -f "$CERT_SRC" ]] || die "找不到商家公钥证书。请指定 DOUYINPAY_MERCHANT_CERT_PEM=路径"

mkdir -p "$STACK"
cp -f "$PRIV_SRC" "$PRIV_DST"
cp -f "$CERT_SRC" "$CERT_DST"
echo "私钥: $PRIV_SRC → $PRIV_DST"
echo "商户证书: $CERT_SRC → $CERT_DST"

grep -qE 'BEGIN (RSA )?PRIVATE KEY' "$PRIV_DST" || die "私钥格式不对（需 BEGIN PRIVATE KEY）"

if grep -q 'BEGIN RSA PRIVATE KEY' "$PRIV_DST" 2>/dev/null; then
  openssl pkcs8 -topk8 -nocrypt -inform PEM -outform PEM -in "$PRIV_DST" -out "$PRIV_DST.pkcs8.pem"
  mv -f "$PRIV_DST.pkcs8.pem" "$PRIV_DST"
  echo "私钥已转为 PKCS#8"
fi

SERIAL=""
if grep -q 'BEGIN CERTIFICATE' "$CERT_DST" 2>/dev/null; then
  SERIAL="$(openssl x509 -in "$CERT_DST" -noout -serial 2>/dev/null | sed 's/serial=0*//' | tr 'a-f' 'A-F' || true)"
fi
if [[ -z "$SERIAL" ]]; then
  base="$(basename "$CERT_SRC")"
  SERIAL="$(echo "$base" | grep -oE '[0-9A-Fa-f]{16,}' | head -1 | tr 'a-f' 'A-F' || true)"
fi
[[ -n "$SERIAL" ]] || die "无法从商家公钥证书提取序列号，请手动设置 DOUYINPAY_SERIAL_NO"

MCH_ID="${DOUYINPAY_MCH_ID:-}"
ENCRYPT_KEY="${DOUYINPAY_ENCRYPT_KEY:-}"
APP_ID="${DOUYINPAY_APP_ID:-}"
NOTIFY_URL="${DOUYINPAY_NOTIFY_URL:-https://mofangdianai.com/erp-api/meoo-douyin-pay-notify}"

if [[ -z "$MCH_ID" ]]; then
  read -r -p "请输入 DOUYINPAY_MCH_ID（商户号）: " MCH_ID
fi
if [[ -z "$ENCRYPT_KEY" ]]; then
  read -r -p "请输入 DOUYINPAY_ENCRYPT_KEY（APIv3 密钥，32 位）: " ENCRYPT_KEY
fi
[[ -n "$MCH_ID" ]] || die "缺少 DOUYINPAY_MCH_ID"
[[ -n "$ENCRYPT_KEY" ]] || die "缺少 DOUYINPAY_ENCRYPT_KEY"
if [[ "$ENCRYPT_KEY" == *你的* ]] || [[ ${#ENCRYPT_KEY} -ne 32 ]]; then
  die "DOUYINPAY_ENCRYPT_KEY 须为 pay.douyinpay.com → 账户中心 → API 安全 中的真实 32 位密钥（当前长度 ${#ENCRYPT_KEY}，勿填占位符）"
fi

if [[ -n "$PLAT_SRC" && -f "$PLAT_SRC" ]]; then
  cp -f "$PLAT_SRC" "$PLAT_DST"
  echo "平台公钥: $PLAT_SRC → $PLAT_DST"
elif [[ -f "$PLAT_DST" ]]; then
  echo "使用已有 $PLAT_DST"
else
  echo ""
  echo "WARN: 未找到「平台公钥」文件（与「商家公钥证书」不是同一个）。"
  echo "      请到 pay.douyinpay.com → 账户中心 → API 安全 → 下载平台公钥，"
  echo "      上传到轻量后重新运行，或："
  echo "      DOUYINPAY_PLATFORM_PEM=/path/to/平台公钥.pem bash scripts/ecs-setup-douyinpay-env.sh"
  echo ""
fi

export MCH_ID="$MCH_ID" SERIAL="$SERIAL" ENCRYPT_KEY="$ENCRYPT_KEY" APP_ID="$APP_ID" NOTIFY_URL="$NOTIFY_URL" STACK_DIR="$STACK"

python3 <<PY
from pathlib import Path
import os
import re

stack = Path(os.environ["STACK_DIR"] if "STACK_DIR" in os.environ else Path.home() / "stack")
env_path = stack / "auth-api.env"
priv = stack / "douyinpay-private.pem"
plat = stack / "douyinpay-platform-public.pem"

keys_to_strip = {
    "DOUYINPAY_MCH_ID", "DOUYINPAY_APP_ID", "DOUYINPAY_SERIAL_NO",
    "DOUYINPAY_ENCRYPT_KEY", "DOUYINPAY_NOTIFY_URL",
    "DOUYINPAY_PRIVATE_KEY", "DOUYINPAY_PLATFORM_PUBLIC_KEY",
    "DOUYINPAY_PRIVATE_KEY_FILE", "DOUYINPAY_PLATFORM_PUBLIC_KEY_FILE",
}
text = env_path.read_text(encoding="utf-8") if env_path.exists() else ""
keep: list[str] = []
skip_pem = False
for ln in text.splitlines():
    if any(ln.startswith(f"{k}=") for k in keys_to_strip):
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
    f"DOUYINPAY_MCH_ID={os.environ['MCH_ID']}",
    f"DOUYINPAY_SERIAL_NO={os.environ['SERIAL']}",
    f"DOUYINPAY_ENCRYPT_KEY={os.environ['ENCRYPT_KEY']}",
    f"DOUYINPAY_NOTIFY_URL={os.environ['NOTIFY_URL']}",
    f"DOUYINPAY_PRIVATE_KEY_FILE={priv}",
]
if os.environ.get("APP_ID"):
    lines.insert(1, f"DOUYINPAY_APP_ID={os.environ['APP_ID']}")
if plat.exists():
    lines.append(f"DOUYINPAY_PLATFORM_PUBLIC_KEY_FILE={plat}")

env_path.write_text("\n".join(keep + lines) + "\n", encoding="utf-8")
print("OK: 已写入", env_path)
PY

echo "DOUYINPAY_SERIAL_NO=$SERIAL"

openssl pkey -in "$PRIV_DST" -noout && echo "私钥 openssl 校验 OK"

if [[ -f "$PLAT_DST" ]]; then
  grep -qE 'BEGIN (RSA )?PUBLIC KEY|BEGIN CERTIFICATE' "$PLAT_DST" || die "平台公钥格式不对"
fi

if [[ -d "$HOME/app" ]]; then
  cd "$HOME/app" && bash scripts/ecs-deploy-auth-api.sh
else
  sudo systemctl restart meoo-auth-api
fi

sleep 2
curl -sS "http://127.0.0.1:3001/api/meoo-douyin-pay-notify?detail=1&probeNative=1" || true
echo ""
echo "若 privateKeySignOk=true 且 nativeProbe.ok=true，抖音 Native 配置完成。"
echo "若仍失败且 stack/douyinpay-private.pem 存在，可执行: bash scripts/ecs-fix-douyinpay-pem-env.sh"
echo "探活公网: curl -sS 'https://mofangdianai.com/erp-api/meoo-douyin-pay-notify?detail=1&probeNative=1'"
