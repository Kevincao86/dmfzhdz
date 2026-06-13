#!/usr/bin/env bash
# ECS 诊断 OSS 环境变量（不打印 Secret 明文）
set -euo pipefail

ENV_FILE="${AUTH_API_ENV:-$HOME/stack/auth-api.env}"

echo "==> 检查 $ENV_FILE"
if [[ ! -f "$ENV_FILE" ]]; then
  echo "FAIL: 文件不存在"
  exit 1
fi

is_placeholder() {
  local v="$1"
  [[ -z "$v" ]] && return 0
  [[ "$v" == *你的* ]] && return 0
  [[ "$v" == *填写* ]] && return 0
  [[ "$v" == *example* ]] && return 0
  [[ "$v" == *changeme* ]] && return 0
  return 1
}

read_key() {
  local k="$1"
  grep -m1 "^${k}=" "$ENV_FILE" 2>/dev/null | cut -d= -f2- | sed 's/^["'\'']//;s/["'\'']$//' || true
}

mask() {
  local v="$1"
  if [[ -z "$v" ]]; then echo "(空)"
  elif is_placeholder "$v"; then echo "(占位符/无效)"
  elif [[ ${#v} -le 6 ]]; then echo "***"
  else echo "${v:0:4}***${v: -4}"
  fi
}

KEYS=(
  OSS_ACCESS_KEY_ID
  OSS_ACCESS_KEY_SECRET
  OSS_BUCKET
  OSS_ENDPOINT
  MERCHANT_PRODUCT_IMAGE_OSS_ACCESS_KEY_ID
  MERCHANT_PRODUCT_IMAGE_OSS_ACCESS_KEY_SECRET
  MERCHANT_PRODUCT_IMAGE_OSS_BUCKET
  ALIYUN_ICE_ACCESS_KEY_ID
  ALIYUN_ICE_ACCESS_KEY_SECRET
  ALIBABA_CLOUD_ACCESS_KEY_ID
  ALIBABA_CLOUD_ACCESS_KEY_SECRET
)

for k in "${KEYS[@]}"; do
  v="$(read_key "$k")"
  [[ -n "$v" ]] || continue
  echo "  $k=$(mask "$v")"
done

OSS_ID="$(read_key OSS_ACCESS_KEY_ID)"
OSS_SEC="$(read_key OSS_ACCESS_KEY_SECRET)"
BUCKET="$(read_key OSS_BUCKET)"
[[ -z "$BUCKET" ]] && BUCKET="$(read_key MERCHANT_PRODUCT_IMAGE_OSS_BUCKET)"

if ! is_placeholder "$OSS_ID" && ! is_placeholder "$OSS_SEC" && [[ -n "$BUCKET" ]]; then
  echo "OK: OSS 变量看起来已配置，可执行: bash scripts/ecs-upload-mp-recruit-covers-oss.sh"
  exit 0
fi

echo ""
echo "WARN: OSS_ACCESS_KEY 仍为占位符或缺失"
echo "可选修复："
echo "  1) bash scripts/ecs-fix-oss-env-from-existing.sh   # 从 ALIBABA_CLOUD / ALIYUN_ICE 复制"
echo "  2) 手动编辑: nano ~/stack/auth-api.env"
echo "     把 OSS_ACCESS_KEY_ID/SECRET 换成阿里云控制台的真实 AccessKey（不是「你的AccessKeyId」这段中文）"
