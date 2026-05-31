#!/usr/bin/env bash
# 在 ECS 上运行商户注册相关 /api（连本机 GoTrue/PostgREST，不依赖 Vercel 出站）
# 用法：
#   cd ~/app && git pull
#   bash scripts/ecs-setup-internal-api-proxy.sh   # 首次
#   bash scripts/ecs-run-auth-api.sh

set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
ERP="$ROOT/web版/merchant-erp"
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
if [[ -f "$ENV_FILE" ]]; then
  PREV_SUPPORT_TOKEN="$(grep '^MEOO_SUPPORT_OPS_HTTP_TOKEN=' "$ENV_FILE" | head -1 | cut -d= -f2- || true)"
fi

cat >"$ENV_FILE" <<EOF
SUPABASE_URL=http://127.0.0.1:8888
VITE_SUPABASE_URL=http://127.0.0.1:8888
SUPABASE_SERVICE_ROLE_KEY=$SERVICE_KEY
VITE_SUPABASE_ANON_KEY=$ANON_KEY
EOF

if [[ -n "${MEOO_SUPPORT_OPS_HTTP_TOKEN:-}" ]]; then
  echo "MEOO_SUPPORT_OPS_HTTP_TOKEN=$MEOO_SUPPORT_OPS_HTTP_TOKEN" >>"$ENV_FILE"
elif [[ -n "$PREV_SUPPORT_TOKEN" ]]; then
  echo "MEOO_SUPPORT_OPS_HTTP_TOKEN=$PREV_SUPPORT_TOKEN" >>"$ENV_FILE"
else
  echo "MEOO_SUPPORT_OPS_HTTP_TOKEN=$(openssl rand -base64 32)" >>"$ENV_FILE"
  echo "已生成 MEOO_SUPPORT_OPS_HTTP_TOKEN，请同步到 Vercel 运营台 VITE_/MEOO_ 变量"
fi

# 合并已有阿里云短信等变量（若 Vercel 导出过）
for k in ALIBABA_CLOUD_ACCESS_KEY_ID ALIBABA_CLOUD_ACCESS_KEY_SECRET ALIYUN_DYPNS_SIGN_NAME ALIYUN_DYPNS_TEMPLATE_CODE ALIYUN_DYPNS_ENDPOINT ALIYUN_DYPNS_TEMPLATE_PARAM; do
  if [[ -n "${!k:-}" ]]; then
    echo "$k=${!k}" >>"$ENV_FILE"
  fi
done

cd "$ERP"
if [[ ! -d node_modules ]]; then
  npm ci
fi

echo "启动 Auth API :$PORT（env: $ENV_FILE）"
echo "测试: curl -sS http://127.0.0.1:$PORT/api/meoo-auth-ping"

set -a
# shellcheck disable=SC1090
source "$ENV_FILE"
set +a

exec npx --yes tsx scripts/ecs-auth-api-server.ts
