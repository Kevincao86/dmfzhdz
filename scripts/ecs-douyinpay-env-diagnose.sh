#!/usr/bin/env bash
# 只读诊断：抖音支付 env / PEM 是否齐全（不输出密钥内容）
# 用法：bash scripts/ecs-douyinpay-env-diagnose.sh
set -euo pipefail

STACK="${STACK_DIR:-$HOME/stack}"
ENV="$STACK/auth-api.env"

echo "== 抖音支付配置诊断（只读） =="
echo "stack: $STACK"
echo ""

check_file() {
  local label="$1" path="$2"
  if [[ -f "$path" ]]; then
    if openssl pkey -in "$path" -noout 2>/dev/null; then
      echo "OK  $label: $path（私钥可读）"
    elif grep -qE 'BEGIN (RSA )?PUBLIC KEY|BEGIN CERTIFICATE' "$path" 2>/dev/null; then
      echo "OK  $label: $path（公钥/证书）"
    else
      echo "WARN $label: $path（存在但格式未识别）"
    fi
  else
    echo "MISS $label: $path"
  fi
}

check_file "商户私钥" "$STACK/douyinpay-private.pem"
check_file "商家证书" "$STACK/douyinpay-merchant-cert.pem"
check_file "平台公钥" "$STACK/douyinpay-platform-public.pem"

echo ""
if [[ -f "$ENV" ]]; then
  for k in DOUYINPAY_MCH_ID DOUYINPAY_APP_ID DOUYINPAY_SERIAL_NO DOUYINPAY_ENCRYPT_KEY DOUYINPAY_NOTIFY_URL DOUYINPAY_PRIVATE_KEY_FILE DOUYINPAY_PLATFORM_PUBLIC_KEY_FILE; do
    if grep -q "^${k}=." "$ENV" 2>/dev/null; then
      v="$(grep "^${k}=" "$ENV" | head -1 | cut -d= -f2- | tr -d '"')"
      if [[ "$k" == *KEY* && "$k" != *FILE* ]]; then
        echo "OK  env $k（已设置，长度 ${#v}）"
      else
        echo "OK  env $k=$v"
      fi
    else
      echo "MISS env $k"
    fi
  done
  if grep -q '^DOUYINPAY_PRIVATE_KEY=' "$ENV" 2>/dev/null; then
    echo "WARN env 仍含内联 DOUYINPAY_PRIVATE_KEY（建议 bash scripts/ecs-fix-douyinpay-pem-env.sh 改读文件）"
  fi
else
  echo "MISS $ENV"
fi

echo ""
echo "上传文件扫描（$HOME /tmp，前 10 条）："
find "$HOME" /tmp -maxdepth 4 -type f \( -name '*商户私钥*' -o -name '*商家公钥*' -o -name '*平台*公钥*' \) 2>/dev/null | head -10 || echo "（无）"

echo ""
echo "公网探活："
curl -sS "https://mofangdianai.com/erp-api/meoo-douyin-pay-notify?detail=1" 2>/dev/null | head -c 600 || true
echo ""
