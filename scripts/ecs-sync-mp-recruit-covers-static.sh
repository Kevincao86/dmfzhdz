#!/usr/bin/env bash
# 封面图库 + 首页 Banner → https://mofangdianai.com/recruit-covers/（downloadFile 合法域名）
# 须在轻量 ECS 执行：cd ~/app && bash scripts/ecs-sync-mp-recruit-covers-static.sh
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
MP="$ROOT/灵祺达人撮合小程序"
COVERS_SRC="$MP/packages/recruit-covers-mp"
STATIC_ROOT="/var/www/meoo-static/recruit-covers"
NGINX_SITE="/etc/nginx/sites-available/meoo-api"

if [[ ! -d "$COVERS_SRC/platforms" ]]; then
  echo "FAIL: 缺少 $COVERS_SRC/platforms，请先 git pull"
  exit 1
fi

echo "==> 同步封面 JPEG → $STATIC_ROOT"
sudo mkdir -p "$STATIC_ROOT/platforms" "$STATIC_ROOT/tags" "$STATIC_ROOT/share" "$STATIC_ROOT/home" "$STATIC_ROOT/auth" "$STATIC_ROOT/login-orbit"
sudo cp -f "$COVERS_SRC"/platforms/*.jpg "$STATIC_ROOT/platforms/"
sudo cp -f "$COVERS_SRC"/tags/*.jpg "$STATIC_ROOT/tags/"

SHARE="$MP/images/share/share-cover-ai-match.jpg"
if [[ -f "$SHARE" ]]; then
  sudo cp -f "$SHARE" "$STATIC_ROOT/share/share-cover-ai-match.jpg"
fi

for f in hero-talent.png hero-talent-v2-search.png hero-shoot.png hero-edit.png home-banner-clouds.png; do
  if [[ -f "$MP/images/home/$f" ]]; then
    sudo cp -f "$MP/images/home/$f" "$STATIC_ROOT/home/$f"
  elif [[ -f "$ROOT/灵祺达人履约管理后台/public/recruit-covers/home/$f" ]]; then
    sudo cp -f "$ROOT/灵祺达人履约管理后台/public/recruit-covers/home/$f" "$STATIC_ROOT/home/$f"
  fi
done

if [[ -d "$MP/images/auth" ]]; then
  sudo cp -f "$MP/images/auth"/*.{jpg,jpeg,png} "$STATIC_ROOT/auth/" 2>/dev/null || true
fi
for f in welcome-hero-bg.jpg welcome-bottom-deco.png login-hero-bg.jpg login-orbit-deco.jpg; do
  if [[ ! -f "$STATIC_ROOT/auth/$f" && -f "$ROOT/灵祺达人履约管理后台/public/recruit-covers/auth/$f" ]]; then
    sudo cp -f "$ROOT/灵祺达人履约管理后台/public/recruit-covers/auth/$f" "$STATIC_ROOT/auth/$f"
  fi
done
if [[ -d "$MP/images/login-orbit" ]]; then
  sudo cp -f "$MP/images/login-orbit"/*.jpg "$STATIC_ROOT/login-orbit/" 2>/dev/null || true
fi

sudo chmod -R a+rX "$STATIC_ROOT"
sudo find "$STATIC_ROOT" -type f -exec chmod 644 {} \;
if id www-data >/dev/null 2>&1; then
  sudo chown -R www-data:www-data /var/www/meoo-static 2>/dev/null || true
fi

echo "==> 部署 Nginx"
sudo cp "$ROOT/scripts/ecs-meoo-api.nginx.conf" "$NGINX_SITE"
sudo ln -sf "$NGINX_SITE" /etc/nginx/sites-enabled/meoo-api
sudo nginx -t
sudo systemctl reload nginx

PLAT_COUNT="$(ls -1 "$STATIC_ROOT/platforms"/*.jpg 2>/dev/null | wc -l | tr -d ' ')"
TAG_COUNT="$(ls -1 "$STATIC_ROOT/tags"/*.jpg 2>/dev/null | wc -l | tr -d ' ')"
echo "OK: platforms=$PLAT_COUNT tags=$TAG_COUNT"

for path in \
  "/recruit-covers/platforms/douyin-1.jpg" \
  "/recruit-covers/home/hero-shoot.png" \
  "/recruit-covers/auth/welcome-bottom-deco.png" \
  "/recruit-covers/auth/welcome-hero-bg.jpg" \
  "/recruit-covers/login-orbit/orbit-01.jpg" \
  "/recruit-covers/share/share-cover-ai-match.jpg"; do
  CODE="$(curl -sS -o /dev/null -w '%{http_code}' -H 'Host: mofangdianai.com' "http://127.0.0.1${path}" || echo 000)"
  echo "  127.0.0.1${path} -> HTTP $CODE"
  [[ "$CODE" == "200" ]] || exit 1
done

echo "OK: 真机图库/Banner 请走 https://mofangdianai.com/recruit-covers/ （已配合法域名）"
