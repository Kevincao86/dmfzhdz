#!/usr/bin/env bash
# 仅重置「小程序」相关 ECS 组件（不动商家 Web dist、Vercel、无关业务 API）
# admin 执行: cd ~/app && git pull && bash scripts/ecs-redeploy-mp-only.sh
#
# 会操作:
#   - meoo-auth-api（小程序 /erp-api 路由）
#   - Nginx 中 /erp-api/ 与 mp-cronet-ping（TLS Cronet 兼容）
#   - 小程序 DB 迁移（私信/登录表）
#   - ~/stack/auth-api.env 中的 MP_WECHAT_*（若已存在则保留）
# 不会操作:
#   - merchant-erp dist 静态站重建
#   - partner / 运营台部署

set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
DOMAIN="${1:-mofangdianai.com}"
PORT="${AUTH_API_PORT:-3001}"

if [[ "$(id -un)" != "admin" ]]; then
  echo "请用 admin 执行，勿 sudo bash 本脚本"
  exit 1
fi

echo "== 1) 拉代码 =="
if [[ -d "$ROOT/.git" ]]; then
  (cd "$ROOT" && git pull --ff-only) || (cd "$ROOT" && git pull)
  (cd "$ROOT" && git log -1 --oneline)
fi

echo "== 2) auth-api.env（仅确保存在，不覆盖已有密钥） =="
if [[ ! -f "$HOME/stack/auth-api.env" ]]; then
  bash "$ROOT/scripts/ecs-run-auth-api.sh" || true
  pkill -f ecs-auth-api-server 2>/dev/null || true
fi
if ! grep -q '^MP_WECHAT_APPID=.' "$HOME/stack/auth-api.env" 2>/dev/null; then
  echo "WARN: ~/stack/auth-api.env 缺少 MP_WECHAT_APPID/SECRET，登录会 wx_not_configured"
  echo "  请手动追加后: sudo systemctl restart meoo-auth-api"
fi

echo "== 3) 小程序 SQL（私信/登录） =="
for f in \
  20260603120000_mp_account_auth.sql \
  20260528100000_mp_talent_chat.sql \
  20260530150000_mp_talent_chat_pr_avatar_column.sql \
  20260602100000_mp_talent_chat_ensure_from_talent.sql
do
  if [[ -f "$ROOT/supabase/migrations/$f" ]]; then
    bash "$ROOT/scripts/ecs-apply-supabase-migration.sh" "$f" || echo "WARN: $f 可能已应用"
  fi
done

echo "== 4) Nginx 443 握手（TLS1.2+1.3，/erp-api） =="
bash "$ROOT/scripts/ecs-fix-mp-443-handshake-definitive.sh" "$DOMAIN"

if ! grep -q 'mp-cronet-ping' /etc/nginx/sites-available/meoo-api 2>/dev/null; then
  echo "WARN: Nginx 无 mp-cronet-ping 静态位，将依赖 auth-api 路由"
fi

echo "== 5) auth-api 对齐 web版 路径并重启（仅本服务） =="
bash "$ROOT/scripts/ecs-install-auth-api-systemd.sh"
bash "$ROOT/scripts/ecs-hotfix-mp-cronet-ping.sh" 2>/dev/null || true
sudo systemctl restart meoo-auth-api
sleep 3

echo "== 6) 本机探活（小程序接口） =="
curl -sf "http://127.0.0.1:${PORT}/api/mp-cronet-ping" | head -c 160
echo
curl -sf "http://127.0.0.1:${PORT}/api/meoo-erp-api-health" | head -c 160
echo
curl -sS -m 10 -X POST "http://127.0.0.1:${PORT}/api/meoo-ops-mp-talent-chat" \
  -H 'Content-Type: application/json' \
  -d '{"action":"sync_profile","participantKey":"t","deviceSecret":"1234567890123456","role":"talent","displayName":"t"}' | head -c 120
echo

echo "== 7) 公网探活 =="
curl -sS -m 15 --http1.1 "https://${DOMAIN}/erp-api/mp-cronet-ping" | head -c 160
echo
curl -sS -m 15 --http1.1 "https://${DOMAIN}/erp-api/meoo-erp-api-health" | head -c 160
echo

echo ""
echo "OK: 小程序 ECS 栈已重装（仅 mp 相关）。"
echo "请本机上传体验版 BUILD_ID=mp-20260606-tls13-post，微信合法域名仅 https://${DOMAIN}"
echo "若手机微信仍 reset、Safari 通：bash scripts/ecs-diagnose-wechat-cronet-reset.sh"
