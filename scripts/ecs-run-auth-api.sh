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

if ! command -v python3 >/dev/null; then
  echo "需要 python3"
  exit 1
fi

read -r ANON_KEY SERVICE_KEY <<EOF
$(python3 <<PY
import jwt, time, os
secret = os.environ["JWT_SECRET"]
now = int(time.time())
exp = now + 10 * 365 * 24 * 3600
print(jwt.encode({"role":"anon","iss":"supabase","iat":now,"exp":exp}, secret, algorithm="HS256"))
print(jwt.encode({"role":"service_role","iss":"supabase","iat":now,"exp":exp}, secret, algorithm="HS256"))
PY
)
EOF

cat >"$ENV_FILE" <<EOF
SUPABASE_URL=http://127.0.0.1:8888
VITE_SUPABASE_URL=http://127.0.0.1:8888
SUPABASE_SERVICE_ROLE_KEY=$SERVICE_KEY
VITE_SUPABASE_ANON_KEY=$ANON_KEY
EOF

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
