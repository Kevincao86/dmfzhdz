#!/usr/bin/env bash
# 从 auth-api.env 备份 / Vercel 导出恢复号码认证短信签名与模板（只改 env，不动库）
# ECS: cd ~/app && bash scripts/ecs-restore-sms-dypns-from-backup.sh
set -euo pipefail

ENV_FILE="${AUTH_API_ENV:-$HOME/stack/auth-api.env}"
RESTORE_KEYS=(
  ALIYUN_DYPNS_SIGN_NAME
  ALIYUN_DYPNS_TEMPLATE_CODE
  ALIYUN_DYPNS_ENDPOINT
  ALIYUN_DYPNS_TEMPLATE_PARAM
)

is_placeholder() {
  local v="$1"
  [[ -z "$v" ]] && return 0
  [[ "$v" == '""' ]] && return 0
  [[ "$v" == "''" ]] && return 0
  [[ "$v" == *你的* ]] && return 0
  [[ "$v" == *填写* ]] && return 0
  return 1
}

read_key_from() {
  local file="$1"
  local k="$2"
  grep -m1 "^${k}=" "$file" 2>/dev/null | cut -d= -f2- | sed 's/^["'\'']//;s/["'\'']$//' || true
}

if [[ ! -f "$ENV_FILE" ]]; then
  echo "FAIL: 缺少 $ENV_FILE"
  exit 1
fi

pick_backup() {
  local f newest=""
  while IFS= read -r f; do
    [[ -f "$f" ]] || continue
    local sign template
    sign="$(read_key_from "$f" ALIYUN_DYPNS_SIGN_NAME)"
    template="$(read_key_from "$f" ALIYUN_DYPNS_TEMPLATE_CODE)"
    is_placeholder "$sign" && continue
    is_placeholder "$template" && continue
    newest="$f"
  done < <(
    {
      ls -t "$ENV_FILE".bak.* "$ENV_FILE".pre-restore.* 2>/dev/null || true
      ls -t "$ENV_FILE.bak" "$HOME/stack/vercel-export.production.env" 2>/dev/null || true
    } | awk '!seen[$0]++'
  )
  [[ -n "$newest" ]] || return 1
  echo "$newest"
}

BACKUP="$(pick_backup || true)"
if [[ -z "$BACKUP" ]]; then
  echo "FAIL: 未在备份中找到有效的 ALIYUN_DYPNS_SIGN_NAME + ALIYUN_DYPNS_TEMPLATE_CODE"
  echo "请从以下任一来源复制后写入 $ENV_FILE ："
  echo "  1) Vercel dmfweb → Settings → Environment Variables → Production → ALIYUN_DYPNS_*"
  echo "  2) 阿里云控制台 → 号码认证服务 → 短信认证 → 签名管理 / 模板管理"
  echo ""
  echo "示例（值须替换为控制台真实内容）："
  echo "  ALIYUN_DYPNS_SIGN_NAME=魔方点AI"
  echo "  ALIYUN_DYPNS_TEMPLATE_CODE=100001"
  echo "  ALIYUN_DYPNS_TEMPLATE_PARAM={\"code\":\"##code##\",\"min\":\"5\"}"
  exit 1
fi

echo "使用备份: $BACKUP"
STAMP="$(date +%Y%m%d%H%M%S)"
cp "$ENV_FILE" "${ENV_FILE}.pre-sms-restore.${STAMP}"

restored=0
for k in "${RESTORE_KEYS[@]}"; do
  val="$(read_key_from "$BACKUP" "$k")"
  is_placeholder "$val" && continue
  if grep -q "^${k}=" "$ENV_FILE" 2>/dev/null; then
    sed -i.bak "/^${k}=/d" "$ENV_FILE"
  fi
  echo "${k}=${val}" >>"$ENV_FILE"
  echo "  + ${k}=${val}"
  restored=$((restored + 1))
done

if [[ "$restored" -eq 0 ]]; then
  echo "FAIL: 备份中无可恢复项"
  exit 1
fi

echo ""
echo "== 重启 meoo-auth-api =="
sudo systemctl restart meoo-auth-api
sleep 2

echo "== 诊断 =="
bash "$(dirname "$0")/ecs-diagnose-sms-env.sh"

echo ""
echo "== 发码自测（请换成真实手机号）=="
curl -sS -m 15 -X POST "http://127.0.0.1:3001/api/meoo-auth-sms-send" \
  -H 'Content-Type: application/json' \
  -d '{"phone":"13800138000"}' | head -c 240
echo ""
