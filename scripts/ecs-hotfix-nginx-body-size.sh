#!/usr/bin/env bash
# 修复招募创建 413：PostgREST / erp-api 请求体默认仅 1m
# ECS: cd ~/app && bash scripts/ecs-hotfix-nginx-body-size.sh

set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
BODY_LIMIT="${NGINX_BODY_LIMIT:-64m}"

patch_file() {
  local f="$1"
  [[ -f "$f" ]] || return 0
  sudo cp "$f" "${f}.bodyfix.$(date +%Y%m%d%H%M%S)"
  sudo python3 <<PY
from pathlib import Path
import re
path = Path("$f")
text = path.read_text(encoding="utf-8")
limit = "$BODY_LIMIT"

def ensure_limit(block: str) -> str:
    if "client_max_body_size" in block:
        return re.sub(r"client_max_body_size\\s+[^;]+;", f"client_max_body_size {limit};", block, count=1)
    lines = block.splitlines()
    out = []
    inserted = False
    for line in lines:
        out.append(line)
        if not inserted and re.match(r"\\s*location\\s+", line):
            indent = re.match(r"(\\s*)", line).group(1)
            out.append(f"{indent}    client_max_body_size {limit};")
            inserted = True
    return "\\n".join(out)

for loc in ("/rest/v1/", "/erp-api/", "/api/"):
    pattern = re.compile(rf"(\\s*location\\s+{re.escape(loc)}\\s*\\{{.*?\\n\\s*\\}})", re.S)
    def repl(m, loc=loc):
        return ensure_limit(m.group(1))
    text, n = pattern.subn(repl, text)
    if n:
        print(f"patched {loc} in {path.name}: {n}")

path.write_text(text, encoding="utf-8")
print(f"OK: {path}")
PY
}

echo "=== 1) 内网 PostgREST :8888（auth-api 写注册表必经）==="
bash "$ROOT/scripts/ecs-setup-internal-api-proxy.sh"

echo "=== 2) 公网 meoo-api ==="
MEOO_API="/etc/nginx/sites-available/meoo-api"
if [[ -f "$MEOO_API" ]]; then
  sudo cp "$ROOT/scripts/ecs-meoo-api.nginx.conf" "$MEOO_API"
  patch_file "$MEOO_API"
else
  echo "WARN: 缺少 $MEOO_API"
fi

echo "=== 3) 履约 dr / 80-ip snippet（若已安装）==="
for f in \
  /etc/nginx/sites-available/meoo-talent-fulfillment \
  /etc/nginx/sites-enabled/meoo-beian-http-80-ip; do
  patch_file "$f"
done

sudo nginx -t
sudo systemctl reload nginx
echo "完成。client_max_body_size=${BODY_LIMIT}，请重试创建招募。"
