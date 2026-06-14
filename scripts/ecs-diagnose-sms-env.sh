#!/usr/bin/env bash
# 只读：检查 ECS auth-api 短信环境变量是否齐全（不写库、不改 env）
set -euo pipefail

ENV_FILE="${AUTH_API_ENV:-$HOME/stack/auth-api.env}"

echo "==> SMS env diagnose ($ENV_FILE)"

if [[ ! -f "$ENV_FILE" ]]; then
  echo "FAIL: 缺少 $ENV_FILE"
  exit 1
fi

read_key() {
  local k="$1"
  grep -m1 "^${k}=" "$ENV_FILE" 2>/dev/null | cut -d= -f2- | sed 's/^["'\'']//;s/["'\'']$//' || true
}

has_val() {
  local v="$1"
  [[ -n "$v" && "$v" != *你的* && "$v" != *填写* ]]
}

check_pair() {
  local label="$1"
  local id_key="$2"
  local sec_key="$3"
  local id_val sec_val
  id_val="$(read_key "$id_key")"
  sec_val="$(read_key "$sec_key")"
  if has_val "$id_val" && has_val "$sec_val"; then
    echo "  OK $label ($id_key)"
    return 0
  fi
  return 1
}

KEY_OK=0
for pair in \
  "ALIBABA_CLOUD ALIBABA_CLOUD_ACCESS_KEY_ID ALIBABA_CLOUD_ACCESS_KEY_SECRET" \
  "OSS OSS_ACCESS_KEY_ID OSS_ACCESS_KEY_SECRET" \
  "ICE ALIYUN_ICE_ACCESS_KEY_ID ALIYUN_ICE_ACCESS_KEY_SECRET" \
  "MERCHANT_OSS MERCHANT_PRODUCT_IMAGE_OSS_ACCESS_KEY_ID MERCHANT_PRODUCT_IMAGE_OSS_ACCESS_KEY_SECRET"; do
  read -r label id_key sec_key <<<"$pair"
  if check_pair "$label" "$id_key" "$sec_key"; then
    KEY_OK=1
    break
  fi
done

if [[ "$KEY_OK" -eq 0 ]]; then
  echo "  FAIL: 无可用 AccessKey"
else
  echo "  (任一 AccessKey 来源即可，代码会自动回落)"
fi

SIGN="$(read_key ALIYUN_DYPNS_SIGN_NAME)"
TEMPLATE="$(read_key ALIYUN_DYPNS_TEMPLATE_CODE)"
if has_val "$SIGN"; then echo "  OK ALIYUN_DYPNS_SIGN_NAME=$SIGN"; else echo "  FAIL: 缺少 ALIYUN_DYPNS_SIGN_NAME"; fi
if has_val "$TEMPLATE"; then echo "  OK ALIYUN_DYPNS_TEMPLATE_CODE=$TEMPLATE"; else echo "  FAIL: 缺少 ALIYUN_DYPNS_TEMPLATE_CODE"; fi

if ! has_val "$SIGN" || ! has_val "$TEMPLATE"; then
  echo ""
  echo "修复建议:"
  echo "  bash scripts/ecs-restore-sms-dypns-from-backup.sh   # 从备份/Vercel导出恢复"
  echo "  或 nano $ENV_FILE 手动补 ALIYUN_DYPNS_SIGN_NAME / ALIYUN_DYPNS_TEMPLATE_CODE"
fi

echo ""
echo "==> auth-api health"
curl -sf -m 3 "http://127.0.0.1:3001/api/meoo-auth-ping" >/dev/null && echo "  OK :3001 ping" || echo "  FAIL: :3001 无响应"
