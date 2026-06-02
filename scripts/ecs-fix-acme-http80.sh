#!/usr/bin/env bash
# 修复 80 端口：/.well-known 被 301 到 https，导致 certbot 无法扩域
# ECS: sudo bash ~/app/scripts/ecs-fix-acme-http80.sh

set -euo pipefail

SITE="/etc/nginx/sites-available/meoo-api"
SNIP="/tmp/meoo-http80-acme.snippet"
CERT_DIR="api.mofangdianai.com"

sudo mkdir -p /var/www/certbot
sudo cp "$SITE" "${SITE}.pre-acme-fix.$(date +%Y%m%d%H%M%S)"

sudo tee "$SNIP" >/dev/null <<'NGX'
server {
    listen 80;
    server_name mofangdianai.com api.mofangdianai.com;

    location ^~ /.well-known/acme-challenge/ {
        root /var/www/certbot;
        default_type "text/plain";
        allow all;
    }

    location / {
        return 301 https://mofangdianai.com$request_uri;
    }
}
NGX

# 删除文件内所有 listen 80 的 server { ... } 块，再追加唯一正确块
sudo python3 <<'PY'
import re
from pathlib import Path

path = Path("/etc/nginx/sites-available/meoo-api")
text = path.read_text()
snippet = Path("/tmp/meoo-http80-acme.snippet").read_text()

def strip_listen80_blocks(src: str) -> str:
    out = []
    i = 0
    while i < len(src):
        m = re.search(r"\n\s*server\s*\{", src[i:])
        if not m:
            out.append(src[i:])
            break
        start = i + m.start()
        out.append(src[i:start])
        brace = src.find("{", start)
        depth = 0
        j = brace
        while j < len(src):
            if src[j] == "{":
                depth += 1
            elif src[j] == "}":
                depth -= 1
                if depth == 0:
                    j += 1
                    break
            j += 1
        block = src[start:j]
        if re.search(r"listen\s+80\s*;", block):
            i = j
            continue
        out.append(block)
        i = j
    return "".join(out)

cleaned = strip_listen80_blocks(text).rstrip() + "\n\n" + snippet + "\n"
path.write_text(cleaned)
print("已移除旧 listen 80 块并写入统一 ACME server 块")
PY

sudo sed -i "s|/etc/letsencrypt/live/mofangdianai.com|/etc/letsencrypt/live/${CERT_DIR}|g" "$SITE"
sudo nginx -t
sudo systemctl reload nginx

echo "自测（期望 404，勿 301）："
curl -sI "http://mofangdianai.com/.well-known/acme-challenge/test" | head -5
