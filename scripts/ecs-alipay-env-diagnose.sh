#!/usr/bin/env bash
# 只读诊断：支付宝 env / PEM 是否齐全（不输出密钥内容）
# 用法：bash scripts/ecs-alipay-env-diagnose.sh
set -euo pipefail

STACK="${STACK_DIR:-$HOME/stack}"
ENV="$STACK/auth-api.env"

echo "== 支付宝配置诊断（只读） =="
echo "stack: $STACK"
echo ""

check_file() {
  local label="$1" path="$2"
  if [[ -f "$path" ]]; then
    if openssl pkey -in "$path" -noout 2>/dev/null; then
      echo "OK  $label: $path（私钥可读）"
    elif grep -qE 'BEGIN (RSA )?PUBLIC KEY' "$path" 2>/dev/null; then
      echo "OK  $label: $path（公钥）"
    else
      echo "WARN $label: $path（存在但格式未识别）"
    fi
  else
    echo "MISS $label: $path"
  fi
}

check_file "应用私钥" "$STACK/alipay-app-private.pem"
check_file "支付宝公钥" "$STACK/alipay-platform-public.pem"

echo ""
if [[ -f "$ENV" ]]; then
  for k in ALIPAY_APP_ID ALIPAY_APPID ALIPAY_NOTIFY_URL ALIPAY_PRIVATE_KEY_FILE ALIPAY_PUBLIC_KEY_FILE; do
    if grep -q "^${k}=." "$ENV" 2>/dev/null; then
      v="$(grep "^${k}=" "$ENV" | head -1 | cut -d= -f2- | tr -d '"')"
      echo "OK  env $k=$v"
    else
      echo "MISS env $k"
    fi
  done
else
  echo "MISS auth-api.env: $ENV"
fi

echo ""
echo "探活（公网）："
curl -sS "https://mofangdianai.com/erp-api/meoo-alipay-pay-notify?detail=1" 2>/dev/null || echo "curl 失败"
echo ""
