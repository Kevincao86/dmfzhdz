#!/usr/bin/env bash
# 修复 meoo-api：删除 location 外的 orphaned proxy_pass，并重写 /rest/v1/、/auth/v1/
# ECS 整段复制执行，或: sudo bash scripts/ecs-repair-meoo-api-nginx-v2.sh

set -euo pipefail

NGINX_SITE="/etc/nginx/sites-available/meoo-api"
sudo cp "$NGINX_SITE" "${NGINX_SITE}.v2repair.$(date +%Y%m%d%H%M%S)"

sudo python3 <<'PY'
from pathlib import Path
import re

path = Path("/etc/nginx/sites-available/meoo-api")
lines = path.read_text().splitlines()
marker = "# meoo supabase-api cors fix"
allow_headers = "Authorization, Content-Type, apikey, X-Client-Info, prefer, accept-profile, content-profile, range, x-upsert, x-retry-count, count"
allow_methods = "GET, POST, PUT, PATCH, DELETE, OPTIONS, HEAD"
directive_re = re.compile(
    r"^\s+(add_header|proxy_hide_header|proxy_pass|proxy_http_version|proxy_set_header)\b"
)

# 1) 删掉 server 内、location 外的 proxy/add_header 孤儿行（brace depth == 1）
cleaned: list[str] = []
depth = 0
for line in lines:
    next_depth = depth + line.count("{") - line.count("}")
    if depth == 1 and directive_re.match(line):
        depth = next_depth
        continue
    cleaned.append(line)
    depth = next_depth

text = "\n".join(cleaned) + "\n"

# 2) 去掉重复 CORS 标记行（保留 location 内逻辑即可）
text = re.sub(r"^\s*# meoo supabase-api cors fix[^\n]*\n", "", text, flags=re.M)


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
        raise SystemExit(f"未找到 location {loc_path}，请检查 meoo-api")
    start, end = span
    return src[:start] + cors_block(loc_path, upstream) + src[end:]


out = text
for loc, upstream in (("/rest/v1/", "http://127.0.0.1:3000/"), ("/auth/v1/", "http://127.0.0.1:9999/")):
    out = replace_location(out, loc, upstream)

path.write_text(out)
print("OK:", path)
PY

sudo nginx -t
sudo systemctl reload nginx
echo "nginx reload 成功"

curl -sSI -X OPTIONS "https://mofangdianai.com/rest/v1/support_relay_messages" \
  -H "Origin: https://cs.mofangdianai.com" \
  -H "Access-Control-Request-Method: POST" \
  -H "Access-Control-Request-Headers: authorization,apikey,content-type,accept-profile,x-retry-count,count" \
  | grep -i access-control || true
