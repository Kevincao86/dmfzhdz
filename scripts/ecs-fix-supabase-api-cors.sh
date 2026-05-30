#!/usr/bin/env bash
# 修复 mofangdianai.com 上 /rest/v1/、/auth/v1/ 的 CORS，
# 使 cs.mofangdianai.com（Vercel 商户前端）的 supabase-js 能携带 accept-profile、x-retry-count、count 等头。
#
# 在 ECS 执行: bash ~/app/scripts/ecs-fix-supabase-api-cors.sh

set -euo pipefail

NGINX_SITE="/etc/nginx/sites-available/meoo-api"
MARKER="# meoo supabase-api cors fix"

ALLOW_HEADERS='Authorization, Content-Type, apikey, X-Client-Info, prefer, accept-profile, content-profile, range, x-upsert, x-retry-count, count'
ALLOW_METHODS='GET, POST, PUT, PATCH, DELETE, OPTIONS, HEAD'

if [[ ! -f "$NGINX_SITE" ]]; then
  echo "找不到 $NGINX_SITE"
  exit 1
fi

if grep -q "$MARKER" "$NGINX_SITE"; then
  echo "检测到已有 CORS 标记，将用大括号安全解析重新写入 /rest/v1/ 与 /auth/v1/ …"
fi

sudo cp "$NGINX_SITE" "${NGINX_SITE}.bak.$(date +%Y%m%d%H%M%S)"

sudo python3 <<'PY'
from pathlib import Path

path = Path("/etc/nginx/sites-available/meoo-api")
text = path.read_text()
marker = "# meoo supabase-api cors fix"
allow_headers = "Authorization, Content-Type, apikey, X-Client-Info, prefer, accept-profile, content-profile, range, x-upsert, x-retry-count, count"
allow_methods = "GET, POST, PUT, PATCH, DELETE, OPTIONS, HEAD"


def cors_block(location_path: str, upstream: str) -> str:
    return f"""    {marker} {location_path}
    location {location_path} {{
        if ($request_method = OPTIONS) {{
            add_header Access-Control-Allow-Origin *;
            add_header Access-Control-Allow-Methods "{allow_methods}";
            add_header Access-Control-Allow-Headers "{allow_headers}";
            add_header Access-Control-Max-Age 86400;
            add_header Content-Length 0;
            return 204;
        }}

        proxy_hide_header Access-Control-Allow-Origin;
        proxy_hide_header Access-Control-Allow-Methods;
        proxy_hide_header Access-Control-Allow-Headers;
        add_header Access-Control-Allow-Origin * always;
        add_header Access-Control-Allow-Methods "{allow_methods}" always;
        add_header Access-Control-Allow-Headers "{allow_headers}" always;

        proxy_pass {upstream};
        proxy_http_version 1.1;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
    }}"""


def find_location_block(src: str, loc_path: str):
    needle = f"location {loc_path}"
    idx = src.find(needle)
    if idx < 0:
        return None
    brace = src.find("{", idx)
    if brace < 0:
        return None
    depth = 0
    i = brace
    while i < len(src):
        c = src[i]
        if c == "{":
            depth += 1
        elif c == "}":
            depth -= 1
            if depth == 0:
                start = src.rfind("\n", 0, idx)
                start = 0 if start < 0 else start + 1
                return start, i + 1
        i += 1
    return None


def replace_location(src: str, loc_path: str, upstream: str) -> str:
    span = find_location_block(src, loc_path)
    if not span:
        raise SystemExit(f"未找到 location {loc_path}")
    start, end = span
    return src[:start] + cors_block(loc_path, upstream) + src[end:]


out = text
for loc, upstream in (("/rest/v1/", "http://127.0.0.1:3000/"), ("/auth/v1/", "http://127.0.0.1:9999/")):
    out = replace_location(out, loc, upstream)

path.write_text(out)
print("已更新", path)
PY

sudo nginx -t
sudo systemctl reload nginx

echo ""
echo "验证 CORS 预检（应含 x-retry-count、accept-profile）："
curl -sSI -X OPTIONS "https://mofangdianai.com/rest/v1/support_relay_messages" \
  -H "Origin: https://cs.mofangdianai.com" \
  -H "Access-Control-Request-Method: GET" \
  -H "Access-Control-Request-Headers: authorization,apikey,content-type,accept-profile,x-retry-count,count" \
  | grep -i access-control || true
