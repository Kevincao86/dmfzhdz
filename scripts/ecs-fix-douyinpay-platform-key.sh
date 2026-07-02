#!/usr/bin/env bash
# 仅配置抖音支付「平台公钥」（不影响私钥 / APIv3 / 商家证书）
#
# 平台公钥 ≠ 商家公钥证书；须从 pay.douyinpay.com → 账户中心 → API 安全 下载
#
# 用法（轻量 SSH）：
#   cd ~/app && bash scripts/ecs-git-pull-gitee.sh
#   DOUYINPAY_PLATFORM_PEM=/tmp/pub_key.pem bash scripts/ecs-fix-douyinpay-platform-key.sh
#
# 或上传到 /tmp 后自动发现（pub_key.pem / *平台*公钥*，排除微信/支付宝）：
#   bash scripts/ecs-fix-douyinpay-platform-key.sh
set -euo pipefail

STACK="${STACK_DIR:-$HOME/stack}"
ENV="$STACK/auth-api.env"
PLAT_DST="$STACK/douyinpay-platform-public.pem"

die() { echo "FAIL: $*" >&2; exit 1; }

is_douyin_platform_pem() {
  local f="$1"
  local base
  base="$(basename "$f" | tr 'A-Z' 'a-z')"
  [[ "$base" == *wechat* ]] && return 1
  [[ "$base" == *alipay* ]] && return 1
  [[ "$base" == *商户私钥* ]] && return 1
  [[ "$base" == *商家* ]] && return 1
  [[ "$f" == *wechat-platform* ]] && return 1
  return 0
}

is_platform_key_material() {
  local f="$1"
  grep -qE 'BEGIN (RSA )?PUBLIC KEY|BEGIN CERTIFICATE' "$f" 2>/dev/null
}

install_platform_to_stack() {
  local src="$1"
  mkdir -p "$STACK"
  if grep -q 'BEGIN CERTIFICATE' "$src" 2>/dev/null; then
    openssl x509 -in "$src" -pubkey -noout > "$PLAT_DST"
    echo "平台证书已提取公钥: $src → $PLAT_DST"
  elif grep -qE 'BEGIN (RSA )?PUBLIC KEY' "$src" 2>/dev/null; then
    cp -f "$src" "$PLAT_DST"
    echo "平台公钥: $src → $PLAT_DST"
  else
    die "无法识别平台密钥格式（需 BEGIN PUBLIC KEY 或 BEGIN CERTIFICATE）: $src"
  fi
  grep -qE 'BEGIN (RSA )?PUBLIC KEY' "$PLAT_DST" || die "提取后的平台公钥无效"
}

find_platform_pem() {
  local f
  if [[ -n "${DOUYINPAY_PLATFORM_PEM:-}" && -f "${DOUYINPAY_PLATFORM_PEM}" ]]; then
    echo "${DOUYINPAY_PLATFORM_PEM}"
    return 0
  fi
  for pattern in '*平台证书*' '*平台*证书*' '*平台*公钥*' '*douyin*platform*' 'pub_key.pem' 'douyin-platform*.pem'; do
    f="$(find /tmp "$HOME" -maxdepth 6 -type f -name "$pattern" 2>/dev/null | head -1 || true)"
    if [[ -n "$f" && -f "$f" ]] && is_douyin_platform_pem "$f"; then
      if is_platform_key_material "$f"; then
        echo "$f"
        return 0
      fi
    fi
  done
  while IFS= read -r f; do
    [[ -f "$f" ]] || continue
    is_douyin_platform_pem "$f" || continue
    is_platform_key_material "$f" || continue
    [[ "$f" == /tmp/* || "$f" == "$HOME"/* ]] && { echo "$f"; return 0; }
  done < <(find /tmp "$HOME" -maxdepth 6 -type f \( -name '*.pem' -o -name '*.crt' -o -name '*平台*' -o -name '*公钥*' \) 2>/dev/null | sort -u)
  return 1
}

PLAT_SRC="$(find_platform_pem || true)"
[[ -n "$PLAT_SRC" && -f "$PLAT_SRC" ]] || die "$(cat <<EOF
找不到抖音平台公钥/平台证书 PEM

请从 pay.douyinpay.com → 账户中心 → API 安全 下载「平台公钥」或「平台证书」
上传到 /tmp 后重跑，或指定：
  DOUYINPAY_PLATFORM_PEM=/tmp/平台证书xxx.pem bash $0

注意：勿用微信 wechat-platform-public.pem 或支付宝 alipay-platform-public.pem
EOF
)"

is_platform_key_material "$PLAT_SRC" || die "不是平台公钥/证书 PEM: $PLAT_SRC"

install_platform_to_stack "$PLAT_SRC"

python3 <<PY
from pathlib import Path
import os

stack = Path(os.environ.get("STACK_DIR", Path.home() / "stack"))
env_path = stack / "auth-api.env"
plat = stack / "douyinpay-platform-public.pem"

strip = (
    "DOUYINPAY_PLATFORM_PUBLIC_KEY=",
    "DOUYINPAY_PLATFORM_PUBLIC_KEY_FILE=",
)
text = env_path.read_text(encoding="utf-8") if env_path.exists() else ""
keep = []
skip = False
for ln in text.splitlines():
    if ln.startswith("DOUYINPAY_PLATFORM_PUBLIC_KEY="):
        if "BEGIN" in ln and "END PUBLIC KEY" not in ln:
            skip = True
        continue
    if any(ln.startswith(p) for p in strip):
        continue
    if skip:
        if "END PUBLIC KEY" in ln:
            skip = False
        continue
    if ln.strip():
        keep.append(ln)

line = f"DOUYINPAY_PLATFORM_PUBLIC_KEY_FILE={plat}"
if line not in keep:
    keep.append(line)
else:
    keep = [ln for ln in keep if not ln.startswith("DOUYINPAY_PLATFORM_PUBLIC_KEY_FILE=")] + [line]

env_path.parent.mkdir(parents=True, exist_ok=True)
env_path.write_text("\n".join(keep) + "\n", encoding="utf-8")
print("OK: 已写入", env_path)
print(" ", line)
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
