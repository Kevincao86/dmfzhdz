#!/usr/bin/env bash
# 本机一键：上传支付宝 PEM 到轻量并写入 auth-api.env、重启 auth-api
#
# 用法（Mac 终端，需能 ssh admin@139.196.42.5）：
#   ALIPAY_APP_ID=2021xxxxxxxxxx \
#   ALIPAY_PRIVATE_PEM=$HOME/Downloads/应用私钥RSA2048.txt \
#   ALIPAY_PUBLIC_PEM=$HOME/Downloads/支付宝公钥.txt \
#   bash scripts/ecs-upload-alipay-certs-local.sh
set -euo pipefail

LIGHT_HOST="${LIGHT_HOST:-admin@139.196.42.5}"
PRIV_PEM="${ALIPAY_PRIVATE_PEM:-}"
PUB_PEM="${ALIPAY_PUBLIC_PEM:-}"
APP_ID="${ALIPAY_APP_ID:-${ALIPAY_APPID:-}}"

die() { echo "FAIL: $*" >&2; exit 1; }

[[ -n "$PRIV_PEM" && -f "$PRIV_PEM" ]] || die "请设置 ALIPAY_PRIVATE_PEM=应用私钥文件路径"
[[ -n "$PUB_PEM" && -f "$PUB_PEM" ]] || die "请设置 ALIPAY_PUBLIC_PEM=支付宝公钥文件路径（open.alipay.com 下载）"
[[ -n "$APP_ID" ]] || die "请设置 ALIPAY_APP_ID=应用APPID"
grep -qE 'BEGIN (RSA )?PRIVATE KEY' "$PRIV_PEM" || die "应用私钥格式不对（需 BEGIN PRIVATE KEY）"
grep -qE 'BEGIN (RSA )?PUBLIC KEY' "$PUB_PEM" || die "支付宝公钥格式不对（需 BEGIN PUBLIC KEY）"

echo "==> 上传到 $LIGHT_HOST:~/stack/"
ssh "$LIGHT_HOST" 'mkdir -p ~/stack'
scp "$PRIV_PEM" "$LIGHT_HOST:~/stack/alipay-app-private.pem"
scp "$PUB_PEM" "$LIGHT_HOST:~/stack/alipay-platform-public.pem"

echo "==> 轻量：写入 env + 重启 auth-api"
ssh "$LIGHT_HOST" "ALIPAY_APP_ID='$APP_ID' ALIPAY_PRIVATE_PEM=\$HOME/stack/alipay-app-private.pem ALIPAY_PUBLIC_PEM=\$HOME/stack/alipay-platform-public.pem bash ~/app/scripts/ecs-setup-alipay-env.sh"

echo ""
echo "OK: 支付宝证书已上传。探活："
echo "  curl -sS 'https://mofangdianai.com/erp-api/meoo-alipay-pay-notify?detail=1&probePrecreate=1'"
