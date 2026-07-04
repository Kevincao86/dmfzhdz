#!/usr/bin/env bash
# 商家审核分享海报 → 轻量静态 CDN（微信合法域名 mofangdianai.com）
# 用法：cd ~/app && bash scripts/ecs-git-pull-gitee.sh && bash scripts/ecs-sync-merchant-notify-posters.sh
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
MP="$ROOT/灵祺达人撮合小程序"
STATIC_ROOT="/var/www/meoo-static/recruit-covers/share"

for name in merchant-notify-talent-review.png merchant-notify-content-review.png; do
  src="$MP/images/share/$name"
  if [[ ! -f "$src" ]]; then
    echo "FAIL: 缺少 $src（请先 git pull）"
    exit 1
  fi
done

echo "==> 同步商家审核海报 → $STATIC_ROOT"
sudo mkdir -p "$STATIC_ROOT"
sudo cp -f "$MP/images/share/merchant-notify-talent-review.png" "$STATIC_ROOT/"
sudo cp -f "$MP/images/share/merchant-notify-content-review.png" "$STATIC_ROOT/"
sudo chmod 644 "$STATIC_ROOT/merchant-notify-"*.png

for path in \
  "/recruit-covers/share/merchant-notify-talent-review.png" \
  "/recruit-covers/share/merchant-notify-content-review.png"; do
  CODE="$(curl -sS -L -o /dev/null -w '%{http_code}' -H 'Host: mofangdianai.com' "http://127.0.0.1${path}" || echo 000)"
  echo "  127.0.0.1${path} -> HTTP $CODE"
  [[ "$CODE" == "200" ]] || exit 1
done

echo "OK: 商家审核海报已上 CDN https://mofangdianai.com/recruit-covers/share/merchant-notify-*.png"
