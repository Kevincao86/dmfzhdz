#!/usr/bin/env bash
# 履约后台：DNS 切流前检查清单 + 启用 ECS 正式域 Nginx
#
# 用法：
#   bash scripts/ecs-cutover-talent-fulfillment-dns.sh ly.mofangdianai.com
#
# 前置：
#   1) https://ly-ecs.mofangdianai.com 已验收（登录、招募大厅、增值服务各点一次）
#   2) 在域名控制台将 <正式域名> 的 A 记录从 Vercel 改为 ECS 公网 IP
#   3) 证书 SAN 须包含 <正式域名>（可与 mofangdianai.com 同 PEM 或 certbot --expand）

set -euo pipefail

PROD_DOMAIN="${1:-}"
if [[ -z "$PROD_DOMAIN" ]]; then
  echo "用法: bash scripts/ecs-cutover-talent-fulfillment-dns.sh <正式域名>"
  echo "示例: bash scripts/ecs-cutover-talent-fulfillment-dns.sh ly.mofangdianai.com"
  exit 1
fi

ROOT="$(cd "$(dirname "$0")/.." && pwd)"

echo "== 切流检查：${PROD_DOMAIN} =="
echo ""
echo "请确认已完成："
echo "  [ ] ly-ecs.mofangdianai.com 登录 / 招募大厅 / 增值服务 正常"
echo "  [ ] DNS: ${PROD_DOMAIN} A 记录 → 本 ECS 公网 IP（不再指向 Vercel）"
echo "  [ ] SSL: 证书覆盖 ${PROD_DOMAIN}"
echo ""
read -r -p "以上已完成，继续部署 ECS 正式域 Nginx? [y/N] " ans
if [[ "${ans,,}" != "y" && "${ans,,}" != "yes" ]]; then
  echo "已取消。Vercel 可继续使用。"
  exit 0
fi

export FULFILLMENT_PROD_DOMAIN="$PROD_DOMAIN"
bash "$ROOT/scripts/ecs-deploy-talent-fulfillment-web.sh"

echo ""
echo "== 切流后验收 =="
echo "  curl -sI https://${PROD_DOMAIN}/ | head -5"
echo "  浏览器硬刷新登录页，Network 中 API 应为 mofangdianai.com/erp-api/meoo-*"
echo ""
echo "验收 24–48h 无问题后，在 Vercel 履约项目 → Settings → Pause Project（或删除自定义域保留备份）"
