#!/usr/bin/env bash
# 将 ECS 恢复到「商家 Web + /erp-api + Supabase 反代」可运行状态
# 用法：cd ~/app && bash scripts/ecs-recovery-merchant-normal.sh
#
# 说明：若浏览器仍报证书错误，须另做根域证书（DNS 验证或阿里云免费证书），
# 本脚本先恢复 Nginx + meoo-auth-api + 本机探活。

set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
SITE="/etc/nginx/sites-available/meoo-api"
CERT_NAME="api.mofangdianai.com"
DOMAIN="mofangdianai.com"

echo "== 0) 代码（可选） =="
if [[ -d "$ROOT/.git" ]]; then
  (cd "$ROOT" && git pull --ff-only) 2>/dev/null || (cd "$ROOT" && git pull) || true
fi

echo "== 1) 恢复 Nginx 配置 =="
sudo cp "$SITE" "${SITE}.recovery.$(date +%Y%m%d%H%M%S)" 2>/dev/null || true

if [[ -f "$ROOT/scripts/ecs-meoo-api.nginx.conf" ]]; then
  sudo cp "$ROOT/scripts/ecs-meoo-api.nginx.conf" "$SITE"
  echo "已用仓库 ecs-meoo-api.nginx.conf"
elif [[ -f "$SITE.bak.20260530114833" ]]; then
  sudo cp "$SITE.bak.20260530114833" "$SITE"
  echo "已用备份 meoo-api.bak.20260530114833"
else
  BAK="$(ls -t "$SITE".bak* 2>/dev/null | head -1 || true)"
  if [[ -n "$BAK" ]]; then
    sudo cp "$BAK" "$SITE"
    echo "已用备份 $BAK"
  else
    echo "WARN: 无模板/备份，仅修正证书路径"
  fi
fi

sudo sed -i "s|/etc/letsencrypt/live/mofangdianai.com|/etc/letsencrypt/live/${CERT_NAME}|g" "$SITE"
sudo rm -f /etc/nginx/sites-enabled/default
sudo ln -sf "$SITE" /etc/nginx/sites-enabled/meoo-api

if [[ ! -f "/etc/letsencrypt/live/${CERT_NAME}/fullchain.pem" ]]; then
  echo "FATAL: 缺少 /etc/letsencrypt/live/${CERT_NAME}/fullchain.pem"
  echo "请在阿里云申请免费证书或完成 certbot DNS 验证后重试"
  exit 1
fi

echo "== 2) 启动 Nginx =="
sudo nginx -t
sudo systemctl enable nginx
sudo systemctl start nginx
sudo systemctl reload nginx

echo "== 3) Supabase Docker（若在 ~/stack） =="
if [[ -f "$HOME/stack/docker-compose.yml" ]]; then
  (cd "$HOME/stack" && docker compose ps 2>/dev/null) || (cd "$HOME/stack" && docker-compose ps 2>/dev/null) || true
  (cd "$HOME/stack" && docker compose up -d 2>/dev/null) || (cd "$HOME/stack" && docker-compose up -d 2>/dev/null) || true
fi

echo "== 4) meoo-auth-api =="
if [[ -f "$ROOT/scripts/ecs-fix-erp-api-502.sh" ]]; then
  bash "$ROOT/scripts/ecs-fix-erp-api-502.sh"
else
  bash "$ROOT/scripts/ecs-run-auth-api.sh" || true
fi

echo "== 5) 本机探活 =="
curl -sf "http://127.0.0.1:3001/api/meoo-auth-ping" >/dev/null && echo "OK: auth-api :3001"
curl -sf -k --resolve "${DOMAIN}:443:127.0.0.1" \
  "https://${DOMAIN}/erp-api/meoo-erp-api-health" | head -c 160
echo

echo "== 6) 公网 HTTPS（-k 忽略证书名；无 -k 需根域在证书 SAN 内） =="
curl -sS -k "https://${DOMAIN}/erp-api/meoo-erp-api-health" | head -c 160 || true
echo
if curl -sS "https://${DOMAIN}/erp-api/meoo-erp-api-health" 2>/dev/null | head -c 80; then
  echo
  echo "OK: 公网 HTTPS 证书已匹配 ${DOMAIN}，商家 cs.mofangdianai.com 应可登录"
else
  echo
  echo "WARN: 公网 curl 仍有 SSL 证书名问题 → 须为 ${DOMAIN} 扩域/换证（见 DEPLOY 或 certbot DNS）"
  echo "      本机 API 与 Nginx 已恢复，完成换证后无需再改业务代码"
fi

echo "完成。"
