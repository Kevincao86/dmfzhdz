#!/usr/bin/env bash
# 在轻量 ECS（139.196.42.5）上执行：写入支付宝密钥 + auth-api.env 并重启 auth-api
#
# 默认 ALIPAY_PAY_PRODUCT=page（电脑网站支付 alipay.trade.page.pay）
#
# 前置（open.alipay.com → 开放平台 → 你的应用 → 开发设置）：
#   - APPID（ALIPAY_APP_ID）
#   - 应用私钥（RSA2）→ 上传到 ~/stack 或 /tmp（文件名含「应用私钥」）
#   - 支付宝公钥（在开放平台「接口加签方式」页下载，非应用公钥）→ 含 BEGIN PUBLIC KEY
#     若只有「支付宝公钥证书」，脚本会自动 openssl 提取公钥
#
# 用法（SSH admin@139.196.42.5）：
#   cd ~/app && bash scripts/ecs-git-pull-gitee.sh
#   ALIPAY_APP_ID=2021xxxxxxxxxx \
#   ALIPAY_PRIVATE_PEM=/tmp/应用私钥RSA2048.txt \
#   ALIPAY_PUBLIC_PEM=/tmp/支付宝公钥.txt \
#   bash scripts/ecs-setup-alipay-env.sh
set -euo pipefail

STACK="${STACK_DIR:-$HOME/stack}"
ENV="$STACK/auth-api.env"
PRIV_DST="$STACK/alipay-app-private.pem"
PUB_DST="$STACK/alipay-platform-public.pem"

die() { echo "FAIL: $*" >&2; exit 1; }

find_upload() {
  local pattern="$1"
  find /tmp "$HOME" -maxdepth 6 -type f -name "$pattern" 2>/dev/null | head -1
}

find_upload_in_key_dirs() {
  local pattern="$1"
  local d
  for d in "${ALIPAY_KEY_DIR:-}" /tmp/zlb /tmp/zfb; do
    [[ -n "$d" && -d "$d" ]] || continue
    local f
    f="$(find "$d" -maxdepth 2 -type f -name "$pattern" 2>/dev/null | head -1 || true)"
    [[ -n "$f" && -f "$f" ]] && { echo "$f"; return 0; }
  done
  return 1
}

is_alipay_private() {
  local f="$1"
  local base
  base="$(basename "$f" | tr 'A-Z' 'a-z')"
  [[ "$base" == *wechat* ]] && return 1
  [[ "$base" == *douyin* ]] && return 1
  [[ "$base" == *商户私钥* ]] && return 1
  [[ "$base" == *pub_key* ]] && return 1
  grep -qE 'BEGIN (RSA )?PRIVATE KEY' "$f" 2>/dev/null
}

is_alipay_public() {
  local f="$1"
  local base
  base="$(basename "$f" | tr 'A-Z' 'a-z')"
  [[ "$base" == *wechat* ]] && return 1
  [[ "$base" == *douyin* ]] && return 1
  [[ "$base" == *商户* ]] && return 1
  [[ "$base" == *商家* ]] && return 1
  [[ "$base" == *应用公钥* ]] && return 1
  [[ "$base" == *应用*证书* ]] && return 1
  grep -qE 'BEGIN (RSA )?PUBLIC KEY|BEGIN CERTIFICATE' "$f" 2>/dev/null
}

install_alipay_public_to_stack() {
  local src="$1"
  if grep -q 'BEGIN CERTIFICATE' "$src" 2>/dev/null; then
    openssl x509 -in "$src" -pubkey -noout > "$PUB_DST"
    echo "支付宝公钥证书已提取公钥: $src → $PUB_DST"
  elif grep -qE 'BEGIN (RSA )?PUBLIC KEY' "$src" 2>/dev/null; then
    cp -f "$src" "$PUB_DST"
    echo "支付宝公钥: $src → $PUB_DST"
  else
    die "无法识别支付宝公钥格式（需 BEGIN PUBLIC KEY 或支付宝公钥证书）: $src"
  fi
  grep -qE 'BEGIN (RSA )?PUBLIC KEY' "$PUB_DST" || die "提取后的支付宝公钥无效"
}

PRIV_SRC="${ALIPAY_PRIVATE_PEM:-}"
PUB_SRC="${ALIPAY_PUBLIC_PEM:-}"

[[ -n "$PRIV_SRC" && -f "$PRIV_SRC" ]] || PRIV_SRC="$(find_upload_in_key_dirs '*应用私钥*' || true)"
[[ -n "$PRIV_SRC" && -f "$PRIV_SRC" ]] || PRIV_SRC="$(find_upload '*应用私钥*' || true)"
[[ -n "$PRIV_SRC" && -f "$PRIV_SRC" ]] || PRIV_SRC="$(find_upload '*alipay*private*' || true)"
[[ -n "$PRIV_SRC" && -f "$PRIV_SRC" ]] || PRIV_SRC="$(find_upload 'app_private*.pem' || true)"
if [[ -z "$PRIV_SRC" || ! -f "$PRIV_SRC" ]] && [[ -f "$PRIV_DST" ]]; then
  PRIV_SRC="$PRIV_DST"
  echo "使用已有 $PRIV_DST"
fi

[[ -n "$PUB_SRC" && -f "$PUB_SRC" ]] || PUB_SRC="$(find_upload_in_key_dirs 'alipayPublicKey*' || true)"
[[ -n "$PUB_SRC" && -f "$PUB_SRC" ]] || PUB_SRC="$(find_upload_in_key_dirs '*支付宝公钥*' || true)"
[[ -n "$PUB_SRC" && -f "$PUB_SRC" ]] || PUB_SRC="$(find_upload_in_key_dirs '*支付宝*证书*' || true)"
[[ -n "$PUB_SRC" && -f "$PUB_SRC" ]] || PUB_SRC="$(find_upload '*支付宝公钥*' || true)"
[[ -n "$PUB_SRC" && -f "$PUB_SRC" ]] || PUB_SRC="$(find_upload '*支付宝*证书*' || true)"
[[ -n "$PUB_SRC" && -f "$PUB_SRC" ]] || PUB_SRC="$(find_upload '*alipay*public*' || true)"
if [[ -z "$PUB_SRC" || ! -f "$PUB_SRC" ]]; then
  while IFS= read -r f; do
    [[ -f "$f" ]] || continue
    [[ "$f" == "$PRIV_SRC" ]] && continue
    is_alipay_public "$f" && { PUB_SRC="$f"; break; }
  done < <(find /tmp "$HOME" -maxdepth 6 -type f \( -name '*.pem' -o -name '*.txt' -o -name '*公钥*' \) 2>/dev/null | sort -u)
fi
if [[ -n "$PUB_SRC" && -f "$PUB_SRC" ]] && [[ -f "$PUB_DST" ]] && [[ "$PUB_SRC" != "$PUB_DST" ]]; then
  :
elif [[ -f "$PUB_DST" ]] && [[ -z "$PUB_SRC" || ! -f "$PUB_SRC" ]]; then
  PUB_SRC="$PUB_DST"
  echo "使用已有 $PUB_DST"
fi

[[ -n "$PRIV_SRC" && -f "$PRIV_SRC" ]] || {
  echo "当前 /tmp 与 $HOME 下可能的密钥："
  find /tmp "$HOME" -maxdepth 4 -type f \( -name '*.pem' -o -name '*.txt' -o -name '*私钥*' -o -name '*公钥*' \) 2>/dev/null | head -20 || true
  die "找不到应用私钥。请指定 ALIPAY_PRIVATE_PEM=路径 或上传含 BEGIN PRIVATE KEY 的文件"
}
[[ -n "$PUB_SRC" && -f "$PUB_SRC" ]] || {
  for d in /tmp/zlb /tmp/zfb; do
    [[ -d "$d" ]] || continue
    if find "$d" -maxdepth 1 -name '*应用公钥*' 2>/dev/null | grep -q .; then
      if ! find "$d" -maxdepth 1 \( -name 'alipayPublicKey*' -o -name '*支付宝公钥*' \) 2>/dev/null | grep -q .; then
        die "$(cat <<EOF
$d 里只有「应用公钥」，不能用于服务端验签。

请 open.alipay.com → 应用 → 开发设置 → 接口加签方式 → 下载「支付宝公钥」到 $d/
然后：ALIPAY_APP_ID=2021006169682011 bash scripts/ecs-setup-alipay-env.sh
EOF
)"
      fi
    fi
  done
  die "找不到支付宝公钥。请指定 ALIPAY_PUBLIC_PEM=路径（open.alipay.com 下载的「支付宝公钥」或「支付宝公钥证书」）"
}

is_alipay_private "$PRIV_SRC" || die "私钥格式不对: $PRIV_SRC"
is_alipay_public "$PUB_SRC" || die "公钥格式不对: $PUB_SRC"

mkdir -p "$STACK"
cp -f "$PRIV_SRC" "$PRIV_DST"
echo "应用私钥: $PRIV_SRC → $PRIV_DST"
install_alipay_public_to_stack "$PUB_SRC"

if grep -q 'BEGIN RSA PRIVATE KEY' "$PRIV_DST" 2>/dev/null; then
  openssl pkcs8 -topk8 -nocrypt -inform PEM -outform PEM -in "$PRIV_DST" -out "$PRIV_DST.pkcs8.pem" 2>/dev/null || true
  if [[ -f "$PRIV_DST.pkcs8.pem" ]]; then
    mv -f "$PRIV_DST.pkcs8.pem" "$PRIV_DST"
    echo "私钥已转为 PKCS#8"
  fi
fi

APP_ID="${ALIPAY_APP_ID:-${ALIPAY_APPID:-}}"
NOTIFY_URL="${ALIPAY_NOTIFY_URL:-https://mofangdianai.com/erp-api/meoo-alipay-pay-notify}"
RETURN_URL="${ALIPAY_RETURN_URL:-https://dr.mofangdianai.com/profile/membership}"
PAY_PRODUCT="${ALIPAY_PAY_PRODUCT:-page}"

if [[ -z "$APP_ID" ]]; then
  read -r -p "请输入 ALIPAY_APP_ID（open.alipay.com 应用 APPID）: " APP_ID
fi
[[ -n "$APP_ID" ]] || die "缺少 ALIPAY_APP_ID"

export APP_ID NOTIFY_URL RETURN_URL PAY_PRODUCT STACK_DIR="$STACK"

python3 <<PY
from pathlib import Path
import os

stack = Path(os.environ["STACK_DIR"])
env_path = stack / "auth-api.env"
priv = stack / "alipay-app-private.pem"
pub = stack / "alipay-platform-public.pem"

keys_to_strip = {
    "ALIPAY_APP_ID", "ALIPAY_APPID", "ALIPAY_NOTIFY_URL", "ALIPAY_RETURN_URL", "ALIPAY_PAY_PRODUCT",
    "ALIPAY_PRIVATE_KEY", "ALIPAY_PRIVATE_KEY_PEM", "ALIPAY_APP_PRIVATE_KEY",
    "ALIPAY_PUBLIC_KEY", "ALIPAY_PUBLIC_KEY_PEM", "ALIPAY_PLATFORM_PUBLIC_KEY",
    "ALIPAY_PRIVATE_KEY_FILE", "ALIPAY_PUBLIC_KEY_FILE",
}
alipay_inline = {
    "ALIPAY_PRIVATE_KEY", "ALIPAY_PRIVATE_KEY_PEM", "ALIPAY_APP_PRIVATE_KEY",
    "ALIPAY_PUBLIC_KEY", "ALIPAY_PUBLIC_KEY_PEM", "ALIPAY_PLATFORM_PUBLIC_KEY",
}
text = env_path.read_text(encoding="utf-8") if env_path.exists() else ""
keep = []
skip_pem = False
for ln in text.splitlines():
    key = ln.split("=", 1)[0].strip() if "=" in ln else ""
    if any(ln.startswith(f"{k}=") for k in keys_to_strip):
        if key in alipay_inline and "BEGIN" in ln and "END PRIVATE KEY" not in ln and "END PUBLIC KEY" not in ln:
            skip_pem = True
        continue
    if skip_pem:
        if "END PRIVATE KEY" in ln or "END PUBLIC KEY" in ln:
            skip_pem = False
        continue
    if ln.strip():
        keep.append(ln)

lines = [
    f"ALIPAY_APP_ID={os.environ['APP_ID']}",
    f"ALIPAY_NOTIFY_URL={os.environ['NOTIFY_URL']}",
    f"ALIPAY_RETURN_URL={os.environ['RETURN_URL']}",
    f"ALIPAY_PAY_PRODUCT={os.environ['PAY_PRODUCT']}",
    f"ALIPAY_PRIVATE_KEY_FILE={priv}",
    f"ALIPAY_PUBLIC_KEY_FILE={pub}",
]
env_path.write_text("\n".join(keep + lines) + "\n", encoding="utf-8")
print("OK: 已写入", env_path)
PY

openssl pkey -in "$PRIV_DST" -noout && echo "应用私钥 openssl 校验 OK"
grep -qE 'BEGIN (RSA )?PUBLIC KEY' "$PUB_DST" && echo "支付宝公钥格式 OK"

if [[ -d "$HOME/app" ]]; then
  cd "$HOME/app" && bash scripts/ecs-deploy-auth-api.sh
else
  sudo systemctl restart meoo-auth-api
fi

sleep 2
curl -sS "http://127.0.0.1:3001/api/meoo-alipay-pay-notify?detail=1&probePay=1" || true
echo ""
echo "若 privateKeySignOk=true 且 payProbe.ok=true，支付宝配置完成。"
echo "默认 ALIPAY_PAY_PRODUCT=page（电脑网站支付 alipay.trade.page.pay）。"
echo "若签约当面付，可设 ALIPAY_PAY_PRODUCT=precreate。"
echo "公网探活: curl -sS 'https://mofangdianai.com/erp-api/meoo-alipay-pay-notify?detail=1&probePay=1'"
