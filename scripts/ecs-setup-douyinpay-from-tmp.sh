#!/usr/bin/env bash
# 抖音支付：在 /tmp（或 $HOME）自动发现 PEM / APIv3 密钥并写入 stack + auth-api.env
#
# 适用：Lighthouse 上传到 /tmp 的
#   - 商户私钥_*.pem
#   - 商家公钥证书*.pem / .crt
#   - 平台公钥*.pem / 平台证书*.pem（可选）
#   - APIv3 密钥 *.txt / *.key（32 位，一行）
#
# 用法（轻量 SSH）：
#   cd ~/app && bash scripts/ecs-git-pull-gitee.sh
#   DOUYINPAY_MCH_ID=6020260627413952 DOUYINPAY_APP_ID=awj7r3emov98djtg \
#     bash scripts/ecs-setup-douyinpay-from-tmp.sh
#
# 也可手动指定：
#   DOUYINPAY_PRIVATE_PEM=/tmp/商户私钥.pem DOUYINPAY_ENCRYPT_KEY_FILE=/tmp/apiv3.txt bash ...
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"

find_first_file() {
  local pattern="$1"
  find /tmp "$HOME" -maxdepth 6 -type f -name "$pattern" 2>/dev/null | head -1
}

is_douyin_platform_pem() {
  local f="$1"
  local base
  base="$(basename "$f" | tr 'A-Z' 'a-z')"
  [[ "$base" == *wechat* ]] && return 1
  [[ "$base" == *alipay* ]] && return 1
  [[ "$f" == *wechat-platform* ]] && return 1
  [[ "$f" == *wechat*platform* ]] && return 1
  [[ "$base" == *商户私钥* ]] && return 1
  [[ "$base" == *商家* ]] && return 1
  return 0
}

is_platform_key_material() {
  local f="$1"
  grep -qE 'BEGIN (RSA )?PUBLIC KEY|BEGIN CERTIFICATE' "$f" 2>/dev/null
}

is_douyin_merchant_cert() {
  local f="$1"
  local base
  base="$(basename "$f")"
  [[ "$base" == *商户私钥* ]] && return 1
  grep -q 'BEGIN CERTIFICATE' "$f" 2>/dev/null
}

find_pem_with_marker() {
  local marker="$1"
  local f
  while IFS= read -r f; do
    [[ -f "$f" ]] || continue
    grep -q "$marker" "$f" 2>/dev/null && { echo "$f"; return 0; }
  done < <(find /tmp "$HOME" -maxdepth 6 -type f \( -name '*.pem' -o -name '*.txt' -o -name '*.crt' -o -name '*私钥*' -o -name '*证书*' -o -name '*公钥*' \) 2>/dev/null | sort -u)
  return 1
}

read_encrypt_key_from_auth_env() {
  local env_file="${STACK_DIR:-$HOME/stack}/auth-api.env"
  [[ -f "$env_file" ]] || return 1
  local v
  v="$(grep '^DOUYINPAY_ENCRYPT_KEY=' "$env_file" 2>/dev/null | head -1 | cut -d= -f2- | tr -d '"')"
  v="$(echo "$v" | tr -d ' \n\r\t')"
  if [[ ${#v} -eq 32 && "$v" != *你的* ]]; then
    echo "OK: APIv3 密钥来自已有 auth-api.env" >&2
    echo "$v"
    return 0
  fi
  return 1
}

resolve_encrypt_key() {
  if [[ -n "${DOUYINPAY_ENCRYPT_KEY:-}" ]]; then
    echo "$DOUYINPAY_ENCRYPT_KEY"
    return 0
  fi
  read_encrypt_key_from_auth_env && return 0
  local f="${DOUYINPAY_ENCRYPT_KEY_FILE:-}"
  if [[ -z "$f" || ! -f "$f" ]]; then
    f="$(find_first_file '*APIv3*')"
  fi
  if [[ -z "$f" || ! -f "$f" ]]; then
    f="$(find_first_file '*api*v3*')"
  fi
  if [[ -z "$f" || ! -f "$f" ]]; then
    f="$(find_first_file '*ENCRYPT*')"
  fi
  if [[ -z "$f" || ! -f "$f" ]]; then
    f="$(find_first_file '*douyin*key*')"
  fi
  if [[ -z "$f" || ! -f "$f" ]]; then
    f="$(find_first_file '*抖音*')"
  fi
  if [[ -z "$f" || ! -f "$f" ]]; then
    return 1
  fi
  local key
  key="$(tr -d ' \n\r\t' < "$f")"
  if [[ ${#key} -eq 32 ]]; then
    echo "OK: APIv3 密钥来自 $f" >&2
    echo "$key"
    return 0
  fi
  echo "WARN: $f 内容长度 ${#key}，不是 32 位 APIv3 密钥" >&2
  return 1
}

echo "==> 扫描 /tmp 与 $HOME …"
echo "/tmp 下相关文件："
find /tmp -maxdepth 4 -type f 2>/dev/null | head -20 || true
echo ""

PRIV="${DOUYINPAY_PRIVATE_PEM:-}"
CERT="${DOUYINPAY_MERCHANT_CERT_PEM:-}"
PLAT="${DOUYINPAY_PLATFORM_PEM:-}"

[[ -n "$PRIV" && -f "$PRIV" ]] || PRIV="$(find_first_file '商户私钥*' || true)"
[[ -n "$PRIV" && -f "$PRIV" ]] || PRIV="$(find_pem_with_marker 'BEGIN PRIVATE KEY' || find_pem_with_marker 'BEGIN RSA PRIVATE KEY' || true)"

[[ -n "$CERT" && -f "$CERT" ]] || CERT="$(find_first_file '商家公钥证书*' || true)"
[[ -n "$CERT" && -f "$CERT" ]] || CERT="$(find_first_file '*证书*.pem' || true)"
if [[ -z "$CERT" || ! -f "$CERT" ]]; then
  while IFS= read -r f; do
    [[ -f "$f" ]] || continue
    is_douyin_merchant_cert "$f" && { CERT="$f"; break; }
  done < <(find /tmp -maxdepth 6 -type f \( -name '*.pem' -o -name '*.crt' -o -name '*证书*' \) 2>/dev/null | sort -u)
fi

[[ -n "$PLAT" && -f "$PLAT" ]] || PLAT="$(find_first_file '*平台证书*' || true)"
[[ -n "$PLAT" && -f "$PLAT" ]] || PLAT="$(find_first_file '*平台*公钥*' || true)"
[[ -n "$PLAT" && -f "$PLAT" ]] || PLAT="$(find_first_file '*douyin*platform*' || true)"
if [[ -z "$PLAT" || ! -f "$PLAT" ]]; then
  while IFS= read -r f; do
    [[ -f "$f" ]] || continue
    [[ "$f" == "$CERT" ]] && continue
    is_douyin_platform_pem "$f" || continue
    is_platform_key_material "$f" || continue
    [[ "$f" == /tmp/* || "$f" == "$HOME"/* ]] && { PLAT="$f"; break; }
  done < <(find /tmp "$HOME" -maxdepth 6 -type f \( -name '*.pem' -o -name '*.crt' -o -name '*公钥*' -o -name '*平台*' \) 2>/dev/null | sort -u)
fi
if [[ -n "$PLAT" && -f "$PLAT" ]] && ! is_douyin_platform_pem "$PLAT"; then
  echo "WARN: 忽略非抖音平台公钥 $PLAT（勿用微信/支付宝公钥）" >&2
  PLAT=""
fi
[[ -n "$PLAT" && -f "$PLAT" ]] || PLAT="$(find_first_file 'pub_key.pem' 2>/dev/null || true)"
if [[ -n "$PLAT" && -f "$PLAT" ]] && ! is_douyin_platform_pem "$PLAT"; then
  echo "WARN: 忽略非抖音平台公钥 $PLAT" >&2
  PLAT=""
fi
[[ -n "$PLAT" && -f "$PLAT" ]] || PLAT="$(find_first_file 'douyinpay-platform-public.pem' 2>/dev/null || true)"
if [[ -z "$PLAT" || ! -f "$PLAT" ]] && [[ -f "$HOME/stack/douyinpay-platform-public.pem" ]]; then
  PLAT="$HOME/stack/douyinpay-platform-public.pem"
fi

ENCRYPT_KEY="$(resolve_encrypt_key || true)"

echo "发现："
echo "  私钥: ${PRIV:-（未找到）}"
echo "  商家证书: ${CERT:-（未找到）}"
  echo "  平台公钥/证书: ${PLAT:-（可选，未找到）}"
echo "  APIv3: ${ENCRYPT_KEY:+已找到（32位）}${ENCRYPT_KEY:-（未找到）}"
echo ""

[[ -n "$PRIV" && -f "$PRIV" ]] || {
  echo "FAIL: /tmp 下未找到含 BEGIN PRIVATE KEY 的商户私钥"
  echo "请确认已上传到 /tmp，或：DOUYINPAY_PRIVATE_PEM=/tmp/xxx.pem bash $0"
  exit 1
}
[[ -n "$CERT" && -f "$CERT" ]] || {
  echo "FAIL: /tmp 下未找到商家公钥证书"
  echo "请：DOUYINPAY_MERCHANT_CERT_PEM=/tmp/xxx.pem bash $0"
  exit 1
}
[[ -n "$ENCRYPT_KEY" ]] || {
  echo "FAIL: 未找到 32 位 APIv3 密钥"
  echo ""
  echo "请任选一种："
  echo "  1) 命令行传入（推荐）："
  echo "     DOUYINPAY_ENCRYPT_KEY=<pay.douyinpay.com 账户中心 API 安全 里的32位密钥> \\"
  echo "     DOUYINPAY_MCH_ID=6020260627413952 DOUYINPAY_APP_ID=awj7r3emov98djtg bash $0"
  echo "  2) 上传 /tmp/apiv3.txt（仅一行 32 字符）后重跑"
  echo "  3) DOUYINPAY_ENCRYPT_KEY_FILE=/tmp/你的文件 bash $0"
  echo ""
  echo "说明：APIv3 密钥不是 PEM 文件，是商户平台里单独显示的 32 位字符串。"
  exit 1
}

export DOUYINPAY_PRIVATE_PEM="$PRIV"
export DOUYINPAY_MERCHANT_CERT_PEM="$CERT"
export DOUYINPAY_ENCRYPT_KEY="$ENCRYPT_KEY"
[[ -n "$PLAT" && -f "$PLAT" ]] && export DOUYINPAY_PLATFORM_PEM="$PLAT"

exec bash "$ROOT/scripts/ecs-setup-douyinpay-env.sh"
