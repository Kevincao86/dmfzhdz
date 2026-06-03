#!/usr/bin/env bash
# 诊断：Safari 能开 JSON，微信真机/体验版 ERR_CONNECTION_RESET (-101)
# ECS: cd ~/app && bash scripts/ecs-diagnose-wechat-cronet-reset.sh

set -euo pipefail

DOMAIN="${1:-mofangdianai.com}"
ROOT="$(cd "$(dirname "$0")/.." && pwd)"

echo "== 1) DNS（微信常走 IPv6，AAAA 错误会导致 30ms 内 reset） =="
echo -n "A 记录: "
dig +short A "$DOMAIN" | tr '\n' ' '
echo
AAAA="$(dig +short AAAA "$DOMAIN" 2>/dev/null | tr '\n' ' ')"
if [[ -n "${AAAA// }" ]]; then
  echo "FAIL: 存在 AAAA 记录: $AAAA"
  echo "  → 请到域名控制台删除 AAAA，只保留 A 指向 ECS 公网 IP，等待 5~30 分钟后再测微信。"
else
  echo "OK: 无 AAAA（仅 IPv4）"
fi

echo ""
echo "== 2) 本机 443 监听（勿 [::]:443 且无证书时仍接受连接） =="
sudo ss -tlnp | grep -E ':443\b' || true

echo ""
echo "== 3) TLS（须 TLS1.2、无 http2，证书含中间链） =="
echo | openssl s_client -connect "${DOMAIN}:443" -servername "$DOMAIN" -tls1_2 2>/dev/null \
  | openssl x509 -noout -subject -issuer -dates 2>/dev/null || echo "WARN: openssl 探活失败"

echo ""
echo "== 4) HTTP 探活 =="
for u in \
  "https://${DOMAIN}/erp-api/mp-cronet-ping" \
  "https://${DOMAIN}/erp-api/meoo-erp-api-health"; do
  code="$(curl -sS -o /tmp/mp-diag.json -w '%{http_code}' -m 15 --http1.1 "$u" || echo 000)"
  echo "$u → http=$code body=$(head -c 100 /tmp/mp-diag.json 2>/dev/null)"
done

echo ""
echo "== 5) 结论提示 =="
echo "若 4) 在 ECS 上 ok:true，但手机微信 Network 全部 (failed) 约 30~60ms："
echo "  · 不是业务代码/Supabase/Vercel，是微信 Cronet 与当前 HTTPS 握手不兼容。"
echo "  · 优先：删 AAAA → bash scripts/ecs-fix-mp-443-handshake-definitive.sh → 体验版 mp-20260606-tls13-post。"
echo "  · 同一台 iPhone 用 Safari 打开 mp-cronet-ping：Safari 通、微信不通 = 典型 Cronet/IPv6。"
echo "  · 可换手机 4G（关 WiFi）再试；轻量「一键 HTTPS」勿与 Nginx 同占 443。"
