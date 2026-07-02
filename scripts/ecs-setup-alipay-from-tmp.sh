#!/usr/bin/env bash
# 支付宝：在 /tmp（或 $HOME）自动发现应用私钥 / 支付宝公钥并写入 stack + auth-api.env
# 默认电脑网站支付（ALIPAY_PAY_PRODUCT=page）
#
# 用法（轻量 SSH）：
#   cd ~/app && bash scripts/ecs-git-pull-gitee.sh
#   ALIPAY_APP_ID=2021xxxxxxxxxx bash scripts/ecs-setup-alipay-from-tmp.sh
#
# 也可手动指定：
#   ALIPAY_PRIVATE_PEM=/tmp/应用私钥.txt ALIPAY_PUBLIC_PEM=/tmp/支付宝公钥.txt bash ...
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"

read_app_id_from_auth_env() {
  local env_file="${STACK_DIR:-$HOME/stack}/auth-api.env"
  [[ -f "$env_file" ]] || return 1
  local v
  v="$(grep -E '^ALIPAY_APP_ID=|^ALIPAY_APPID=' "$env_file" 2>/dev/null | head -1 | cut -d= -f2- | tr -d '"')"
  v="$(echo "$v" | tr -d ' \n\r\t')"
  [[ -n "$v" ]] || return 1
  echo "OK: APPID 来自已有 auth-api.env" >&2
  echo "$v"
}

APP_ID="${ALIPAY_APP_ID:-${ALIPAY_APPID:-}}"
if [[ -z "$APP_ID" ]]; then
  APP_ID="$(read_app_id_from_auth_env || true)"
fi

echo "==> 扫描 /tmp 与 $HOME …"
echo "/tmp 下相关文件："
find /tmp -maxdepth 4 -type f 2>/dev/null | head -20 || true
echo ""

[[ -n "$APP_ID" ]] || {
  echo "FAIL: 未找到 ALIPAY_APP_ID"
  echo ""
  echo "请：open.alipay.com → 控制台 → 应用详情 → 复制 APPID"
  echo "  ALIPAY_APP_ID=你的APPID bash $0"
  exit 1
}

export ALIPAY_APP_ID="$APP_ID"
exec bash "$ROOT/scripts/ecs-setup-alipay-env.sh"
