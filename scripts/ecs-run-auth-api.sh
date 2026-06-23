#!/usr/bin/env bash
# 在 ECS 上运行商户注册相关 /api（连本机 GoTrue/PostgREST，不依赖 Vercel 出站）
# 用法：
#   bash ~/app/scripts/ecs-git-pull-main.sh   # 拉 main（ECS 通常只有 origin，无 gitee 远程名）
#   bash scripts/ecs-setup-internal-api-proxy.sh   # 首次
#   bash scripts/ecs-run-auth-api.sh

set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
# shellcheck source=ecs-resolve-erp-path.sh
source "$ROOT/scripts/ecs-resolve-erp-path.sh"
ERP="$(ecs_resolve_erp_dir "$ROOT")"
OPS_ADMIN="$ROOT/商家管理后台"
ENV_FILE="$HOME/stack/auth-api.env"
PORT="${AUTH_API_PORT:-3001}"

if [[ ! -f "$HOME/stack/db-credentials.txt" ]]; then
  echo "缺少 ~/stack/db-credentials.txt"
  exit 1
fi

# shellcheck disable=SC1091
source "$HOME/stack/db-credentials.txt"
export JWT_SECRET POSTGRES_PASSWORD

if ! command -v python3 >/dev/null; then
  echo "需要 python3"
  exit 1
fi

pip3 install PyJWT 2>/dev/null || true

python3 <<'PY'
import jwt, time, os
secret = os.environ["JWT_SECRET"]
now = int(time.time())
exp = now + 10 * 365 * 24 * 3600
anon = jwt.encode({"role": "anon", "iss": "supabase", "iat": now, "exp": exp}, secret, algorithm="HS256")
service = jwt.encode({"role": "service_role", "iss": "supabase", "iat": now, "exp": exp}, secret, algorithm="HS256")
open("/tmp/meoo-anon.key", "w").write(anon)
open("/tmp/meoo-service.key", "w").write(service)
PY

ANON_KEY="$(cat /tmp/meoo-anon.key)"
SERVICE_KEY="$(cat /tmp/meoo-service.key)"
rm -f /tmp/meoo-anon.key /tmp/meoo-service.key

if [[ -z "$ANON_KEY" || -z "$SERVICE_KEY" ]]; then
  echo "生成 anon/service_role JWT 失败，请确认 db-credentials.txt 含 JWT_SECRET 且已 export"
  exit 1
fi

PREV_SUPPORT_TOKEN=""
PREV_ENV_BACKUP=""
if [[ -f "$ENV_FILE" ]]; then
  PREV_SUPPORT_TOKEN="$(grep '^MEOO_SUPPORT_OPS_HTTP_TOKEN=' "$ENV_FILE" | head -1 | cut -d= -f2- || true)"
  PREV_ENV_BACKUP="${ENV_FILE}.bak.$(date +%Y%m%d%H%M%S)"
  cp "$ENV_FILE" "$PREV_ENV_BACKUP"
  echo "已备份旧 env → $PREV_ENV_BACKUP"
fi

read_prev_env_key() {
  local key="$1"
  local file="${2:-$ENV_FILE}"
  [[ -f "$file" ]] || return 1
  grep -m1 "^${key}=" "$file" 2>/dev/null | cut -d= -f2- || true
}

cat >"$ENV_FILE" <<EOF
MEOO_SUPABASE_ADMIN_URL=http://127.0.0.1:8888
SUPABASE_URL=http://127.0.0.1:8888
VITE_SUPABASE_URL=http://127.0.0.1:8888
SUPABASE_SERVICE_ROLE_KEY=$SERVICE_KEY
SUPABASE_ANON_KEY=$ANON_KEY
VITE_SUPABASE_ANON_KEY=$ANON_KEY
# /api/meoo-ai-chat、数字人口播链接解析等：本地验签商户 JWT，避免出站 /auth/v1/user 失败
SUPABASE_JWT_SECRET=$JWT_SECRET
JWT_SECRET=$JWT_SECRET
GOTRUE_JWT_SECRET=$JWT_SECRET
POSTGRES_PASSWORD=$POSTGRES_PASSWORD
MEOO_DATABASE_URL=postgres://postgres:${POSTGRES_PASSWORD}@127.0.0.1:5433/postgres?sslmode=disable
EOF

if [[ -n "${MEOO_SUPPORT_OPS_HTTP_TOKEN:-}" ]]; then
  echo "MEOO_SUPPORT_OPS_HTTP_TOKEN=$MEOO_SUPPORT_OPS_HTTP_TOKEN" >>"$ENV_FILE"
elif [[ -n "$PREV_SUPPORT_TOKEN" ]]; then
  echo "MEOO_SUPPORT_OPS_HTTP_TOKEN=$PREV_SUPPORT_TOKEN" >>"$ENV_FILE"
else
  echo "MEOO_SUPPORT_OPS_HTTP_TOKEN=$(openssl rand -base64 32)" >>"$ENV_FILE"
  echo "已生成 MEOO_SUPPORT_OPS_HTTP_TOKEN，请同步到 Vercel 运营台 VITE_/MEOO_ 变量"
fi

# 保留登录/微信/密码 pepper 等（勿因重建 env 导致全站「账号或密码错误」）
PRESERVE_KEYS=(
  MP_AUTH_PEPPER
  MERCHANT_AUTH_PEPPER
  MP_WECHAT_APPID
  MP_WECHAT_SECRET
  MP_DOUYIN_APPID
  MP_DOUYIN_SECRET
  MP_AUTH_DEV_MODE
  MP_DEV_FIXED_OPENID
  MEOO_ERP_API_HOST_IP
  MEOO_SUPPORT_OPS_HTTP_TOKEN
  ALIBABA_CLOUD_ACCESS_KEY_ID
  ALIBABA_CLOUD_ACCESS_KEY_SECRET
  ALIYUN_DYPNS_SIGN_NAME
  ALIYUN_DYPNS_TEMPLATE_CODE
  ALIYUN_DYPNS_ENDPOINT
  ALIYUN_DYPNS_TEMPLATE_PARAM
  OSS_ACCESS_KEY_ID
  OSS_ACCESS_KEY_SECRET
  OSS_BUCKET
  OSS_ENDPOINT
)
for k in "${PRESERVE_KEYS[@]}"; do
  val=""
  if [[ -n "${!k:-}" ]]; then
    val="${!k}"
  elif [[ -n "$PREV_ENV_BACKUP" && -f "$PREV_ENV_BACKUP" ]]; then
    val="$(read_prev_env_key "$k" "$PREV_ENV_BACKUP")"
  elif [[ -f "${ENV_FILE}.bak" ]]; then
    val="$(read_prev_env_key "$k" "${ENV_FILE}.bak")"
  fi
  [[ -n "$val" ]] || continue
  if grep -q "^${k}=" "$ENV_FILE" 2>/dev/null; then
    continue
  fi
  echo "${k}=${val}" >>"$ENV_FILE"
done

# 短信：仅有 OSS/ICE Key 时补写 ALIBABA_CLOUD_*（号码认证与 OSS 可共用 RAM）
if ! grep -q '^ALIBABA_CLOUD_ACCESS_KEY_ID=.' "$ENV_FILE" 2>/dev/null; then
  SMS_SRC_ID="" SMS_SRC_SEC=""
  for pair in \
    "MERCHANT_PRODUCT_IMAGE_OSS_ACCESS_KEY_ID MERCHANT_PRODUCT_IMAGE_OSS_ACCESS_KEY_SECRET" \
    "ALIYUN_ICE_ACCESS_KEY_ID ALIYUN_ICE_ACCESS_KEY_SECRET" \
    "OSS_ACCESS_KEY_ID OSS_ACCESS_KEY_SECRET"; do
    read -r id_key sec_key <<<"$pair"
    id_val="$(read_prev_env_key "$id_key" "$ENV_FILE")"
    sec_val="$(read_prev_env_key "$sec_key" "$ENV_FILE")"
    if [[ -n "$id_val" && -n "$sec_val" && "$id_val" != *你的* ]]; then
      SMS_SRC_ID="$id_val"
      SMS_SRC_SEC="$sec_val"
      break
    fi
  done
  if [[ -n "$SMS_SRC_ID" && -n "$SMS_SRC_SEC" ]]; then
    echo "ALIBABA_CLOUD_ACCESS_KEY_ID=$SMS_SRC_ID" >>"$ENV_FILE"
    echo "ALIBABA_CLOUD_ACCESS_KEY_SECRET=$SMS_SRC_SEC" >>"$ENV_FILE"
    echo "已从 OSS/ICE Key 补写 ALIBABA_CLOUD_*（短信）"
  fi
fi

if ! grep -q '^MP_AUTH_PEPPER=.' "$ENV_FILE" 2>/dev/null; then
  echo ""
  echo "WARN: auth-api.env 缺少 MP_AUTH_PEPPER — 账号密码登录将全部失败。"
  echo "  从备份恢复: bash scripts/ecs-restore-auth-pepper-from-backup.sh"
  echo "  或手动写入后: sudo systemctl restart meoo-auth-api"
fi

cd "$ERP"
if [[ ! -d node_modules/@supabase/supabase-js ]]; then
  npm ci
fi

# 从 商家管理后台/api 加载的 handler 会在该目录向上解析 node_modules
if [[ ! -e "$OPS_ADMIN/node_modules/@supabase/supabase-js" ]]; then
  if [[ -d "$ERP/node_modules/@supabase/supabase-js" ]]; then
    ln -sfn "$(cd "$ERP" && pwd)/node_modules" "$OPS_ADMIN/node_modules"
    echo "已链接 $OPS_ADMIN/node_modules -> merchant-erp/node_modules"
  elif [[ -f "$OPS_ADMIN/package.json" ]]; then
    (cd "$OPS_ADMIN" && npm ci)
  fi
fi

pkill -f ecs-auth-api-server 2>/dev/null || true
sleep 1

if [[ -f /etc/systemd/system/meoo-auth-api.service ]]; then
  echo "检测到 systemd 服务 meoo-auth-api，使用 systemctl 启动（SSH 断开也不会 502）…"
  sudo systemctl daemon-reload
  sudo systemctl enable meoo-auth-api
  sudo systemctl restart meoo-auth-api
  sleep 2
  if curl -sf "http://127.0.0.1:$PORT/api/meoo-auth-ping" >/dev/null; then
    echo "OK: systemd meoo-auth-api 已在 :$PORT 运行"
    H="$(curl -sS "http://127.0.0.1:$PORT/api/meoo-erp-api-health")"
    echo "${H}" | head -c 280
    echo
    echo "公网自测: curl -sSI https://mofangdianai.com/erp-api/meoo-erp-api-health | head"
    exit 0
  fi
  echo "systemd 启动失败。最近日志："
  sudo journalctl -u meoo-auth-api -n 40 --no-pager 2>/dev/null || true
  echo ""
  echo "建议依次执行:"
  echo "  bash $ROOT/scripts/ecs-verify-auth-api-path.sh"
  echo "  cd $ERP && npm ci"
  echo "  bash $ROOT/scripts/ecs-install-auth-api-systemd.sh"
  exit 1
fi

echo "未安装 systemd 单元。强烈建议执行: bash scripts/ecs-install-auth-api-systemd.sh"
echo "否则 SSH 关闭后 Nginx /erp-api 会出现 502 Bad Gateway。"
echo "下面以前台方式启动（仅调试用，勿关闭本终端）…"

set -a
# shellcheck disable=SC1090
source "$ENV_FILE"
set +a

export AUTH_API_PORT="$PORT"
exec node --import tsx scripts/ecs-auth-api-server.ts
