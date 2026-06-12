#!/usr/bin/env bash
# 只读诊断：账号密码登录失败原因（pepper / mp_accounts / PostgREST）
# ECS: cd ~/app && bash scripts/ecs-verify-mp-password-login.sh [手机号]

set -euo pipefail

PHONE="${1:-15657827912}"
ENV_FILE="${AUTH_API_ENV:-$HOME/stack/auth-api.env}"
PORT="${AUTH_API_PORT:-3001}"

echo "=== 1) auth-api 探活 ==="
curl -sS -m 5 "http://127.0.0.1:${PORT}/api/meoo-erp-api-health" | head -c 240
echo ""

echo "=== 2) auth-api.env 关键项 ==="
if [[ ! -f "$ENV_FILE" ]]; then
  echo "FAIL: 缺少 $ENV_FILE"
  exit 1
fi
for k in MP_AUTH_PEPPER MERCHANT_AUTH_PEPPER MP_WECHAT_APPID SUPABASE_URL; do
  if grep -q "^${k}=." "$ENV_FILE" 2>/dev/null; then
    echo "  OK ${k}=<set>"
  else
    echo "  MISSING ${k}  ← 缺 MP_AUTH_PEPPER 会导致密码全错"
  fi
done

# shellcheck disable=SC1090
source "$ENV_FILE"
BASE="${SUPABASE_URL:-http://127.0.0.1:8888}"
SR="${SUPABASE_SERVICE_ROLE_KEY:-}"
if [[ -z "$SR" ]]; then
  echo "FAIL: SUPABASE_SERVICE_ROLE_KEY 未设置"
  exit 1
fi

DIGITS="$(echo "$PHONE" | tr -cd '0-9')"
if [[ ${#DIGITS} -ne 11 ]]; then
  echo "WARN: 手机号格式异常: $PHONE"
fi

echo "=== 3) PostgREST 查 mp_accounts（只读）==="
HTTP_BODY="$(curl -sS -m 10 -w "\n__HTTP__%{http_code}" \
  -H "apikey: ${SR}" \
  -H "Authorization: Bearer ${SR}" \
  "${BASE}/rest/v1/mp_accounts?login_name=eq.${DIGITS}&select=id,login_name,active_role,password_hash,password_salt,openid&limit=1")"
HTTP="$(echo "$HTTP_BODY" | sed -n '$s/.*__HTTP__//p')"
JSON="$(echo "$HTTP_BODY" | sed '/__HTTP__/d')"
echo "http=$HTTP"
echo "$JSON" | head -c 400
echo ""

if [[ "$HTTP" != "200" ]]; then
  echo "FAIL: 无法读取 mp_accounts（PostgREST/权限）"
  exit 1
fi

if [[ "$JSON" == "[]" ]]; then
  echo "DIAG: 该手机号未注册 mp_accounts.login_name（可能仅微信登录过）"
  exit 1
fi

HAS_HASH="$(echo "$JSON" | grep -q '"password_hash":null' && echo no || echo yes)"
HAS_SALT="$(echo "$JSON" | grep -q '"password_salt":null' && echo no || echo yes)"
echo "has_password_hash=$HAS_HASH has_password_salt=$HAS_SALT"

echo "=== 4) password_login 探针（不打印密码）==="
PROBE="$(curl -sS -m 10 -X POST -H "Content-Type: application/json" \
  "http://127.0.0.1:${PORT}/api/meoo-ops-mp-auth" \
  -d "{\"action\":\"password_login\",\"loginName\":\"${DIGITS}\",\"password\":\"__probe__\"}")"
echo "$PROBE" | head -c 280
echo ""

if echo "$PROBE" | grep -q '"error":"invalid_credentials"'; then
  if [[ "$HAS_HASH" == "no" || "$HAS_SALT" == "no" ]]; then
    echo "结论: 账号存在但未设置密码 → 请微信登录后在资料页设置密码，或走注册/找回流程"
  elif ! grep -q '^MP_AUTH_PEPPER=.' "$ENV_FILE" 2>/dev/null; then
    echo "结论: 缺少 MP_AUTH_PEPPER → bash scripts/ecs-restore-auth-pepper-from-backup.sh"
  else
    echo "结论: 密码校验失败（密码不对或 pepper 与注册时不一致）→ 尝试 ecs-restore-auth-pepper-from-backup.sh"
  fi
fi
