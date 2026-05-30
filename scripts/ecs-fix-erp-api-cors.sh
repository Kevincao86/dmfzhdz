#!/usr/bin/env bash
# 修复 /erp-api/ CORS 重复（Access-Control-Allow-Origin: *, *）
# 在 ECS 执行: bash ~/app/scripts/ecs-fix-erp-api-cors.sh

set -euo pipefail

NGINX_SITE="/etc/nginx/sites-available/meoo-api"
MARKER="# meoo erp-api cors fix"

if [[ ! -f "$NGINX_SITE" ]]; then
  echo "找不到 $NGINX_SITE"
  exit 1
fi

if grep -q "$MARKER" "$NGINX_SITE"; then
  echo "已打过补丁，跳过写入。若仍报错请检查 location /erp-api/ 内容。"
else
  sudo python3 <<'PY'
from pathlib import Path
path = Path("/etc/nginx/sites-available/meoo-api")
text = path.read_text()
block = """
    # meoo erp-api cors fix
    location /erp-api/ {
        proxy_hide_header Access-Control-Allow-Origin;
        proxy_hide_header Access-Control-Allow-Methods;
        proxy_hide_header Access-Control-Allow-Headers;

        if ($request_method = OPTIONS) {
            add_header Access-Control-Allow-Origin *;
            add_header Access-Control-Allow-Methods "GET, POST, OPTIONS";
            add_header Access-Control-Allow-Headers "Content-Type";
            return 204;
        }
        add_header Access-Control-Allow-Origin * always;
        add_header Access-Control-Allow-Methods "GET, POST, OPTIONS" always;
        add_header Access-Control-Allow-Headers "Content-Type" always;

        proxy_pass http://127.0.0.1:3001/api/;
        proxy_http_version 1.1;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
    }
"""
import re
# 替换已有 location /erp-api/ 块
pat = re.compile(r"\s*location /erp-api/ \{.*?\n\s*\}", re.S)
    if pat.search(text):
        text = pat.sub("\n" + block.strip() + "\n", text, count=1)
    else:
    # 插入到 mofangdianai.com 的 server { } 末尾（第一个含 ssl 的 server）
    m = re.search(r"(server \{[^}]*server_name[^;]*mofangdianai\.com[^}]*)(^\})", text, re.S | re.M)
    if not m:
        m = re.search(r"(server \{.*?listen 443.*?\n)(^\})", text, re.S | re.M)
    if m:
        text = text[: m.end(1)] + block + text[m.end(1) :]
    else:
        raise SystemExit("未找到可插入的 server 块，请手动编辑 meoo-api")
path.write_text(text)
print("已更新", path)
PY
fi

sudo nginx -t
sudo systemctl reload nginx

echo "验证 CORS 头（应只有一行 Access-Control-Allow-Origin: *）:"
curl -sSI -X OPTIONS "https://mofangdianai.com/erp-api/meoo-auth-register" | grep -i access-control || true
