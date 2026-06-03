#!/usr/bin/env bash
# 小程序 ECS 栈：Nginx 443 + auth-api（无 Vercel / 无 Supabase 云）
# ECS admin: cd ~/app && git pull && bash scripts/ecs-mp-minimal.sh

set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
DOMAIN="${1:-mofangdianai.com}"

if [[ "$(id -un)" != "admin" ]]; then
  echo "请用 admin 执行"
  exit 1
fi

bash "$ROOT/scripts/ecs-fix-mp-443-handshake-definitive.sh" "$DOMAIN"
bash "$ROOT/scripts/ecs-fix-mp-chat-ecs.sh" 2>/dev/null || true

echo ""
echo "OK: 小程序 API 仅 https://${DOMAIN}/erp-api"
echo "体验版 BUILD: mp-20260606-ecs-clean"
