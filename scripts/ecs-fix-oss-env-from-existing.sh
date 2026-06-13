#!/usr/bin/env bash
# 从 auth-api.env 已有阿里云变量复制 OSS_*，替换占位符
set -euo pipefail

ENV_FILE="${AUTH_API_ENV:-$HOME/stack/auth-api.env}"

if [[ ! -f "$ENV_FILE" ]]; then
  echo "FAIL: 缺少 $ENV_FILE"
  exit 1
fi

is_placeholder() {
  local v="$1"
  [[ -z "$v" ]] && return 0
  [[ "$v" == *你的* ]] && return 0
  [[ "$v" == *填写* ]] && return 0
  return 1
}

read_key() {
  local k="$1"
  grep -m1 "^${k}=" "$ENV_FILE" 2>/dev/null | cut -d= -f2- | sed 's/^["'\'']//;s/["'\'']$//' || true
}

set_or_replace() {
  local k="$1"
  local v="$2"
  [[ -z "$v" ]] && return 1
  if grep -q "^${k}=" "$ENV_FILE" 2>/dev/null; then
    sed -i.bak-oss-fix "s|^${k}=.*|${k}=${v}|" "$ENV_FILE"
  else
    echo "${k}=${v}" >>"$ENV_FILE"
  fi
  echo "  写入 $k"
}

SRC_ID=""
SRC_SEC=""
for pair in \
  "MERCHANT_PRODUCT_IMAGE_OSS_ACCESS_KEY_ID MERCHANT_PRODUCT_IMAGE_OSS_ACCESS_KEY_SECRET" \
  "ALIYUN_ICE_ACCESS_KEY_ID ALIYUN_ICE_ACCESS_KEY_SECRET" \
  "ALIBABA_CLOUD_ACCESS_KEY_ID ALIBABA_CLOUD_ACCESS_KEY_SECRET" \
  "OSS_ACCESS_KEY_ID OSS_ACCESS_KEY_SECRET"; do
  read -r id_key sec_key <<<"$pair"
  id_val="$(read_key "$id_key")"
  sec_val="$(read_key "$sec_key")"
  if ! is_placeholder "$id_val" && ! is_placeholder "$sec_val"; then
    SRC_ID="$id_val"
    SRC_SEC="$sec_val"
    echo "==> 使用来源: $id_key"
    break
  fi
done

if [[ -z "$SRC_ID" || -z "$SRC_SEC" ]]; then
  echo "FAIL: auth-api.env 里没有可用的阿里云 AccessKey"
  echo "请登录阿里云 RAM → 创建 AccessKey，然后执行："
  echo "  nano ~/stack/auth-api.env"
  echo "写入真实值（示例格式，请替换为控制台复制的字符串）："
  echo "  OSS_ACCESS_KEY_ID=LTAI5tXXXXXXXX"
  echo "  OSS_ACCESS_KEY_SECRET=xxxxxxxxxxxxxxxxxxxxxxxx"
  echo "  OSS_BUCKET=modianningbo"
  echo "  OSS_ENDPOINT=oss-cn-shanghai.aliyuncs.com"
  exit 1
fi

cp "$ENV_FILE" "${ENV_FILE}.bak.$(date +%Y%m%d%H%M%S)"
set_or_replace OSS_ACCESS_KEY_ID "$SRC_ID"
set_or_replace OSS_ACCESS_KEY_SECRET "$SRC_SEC"
set_or_replace OSS_BUCKET "${OSS_BUCKET:-modianningbo}"
set_or_replace OSS_ENDPOINT "${OSS_ENDPOINT:-oss-cn-shanghai.aliyuncs.com}"

echo "OK: 已从现有变量写入 OSS_*，请执行:"
echo "  bash scripts/ecs-upload-mp-recruit-covers-oss.sh"
