#!/usr/bin/env bash
# 微信 ERR_CONNECTION_RESET 且 ECS 本机 curl 正常时，优先查阿里云备案/接入
# ECS: cd ~/app && bash scripts/ecs-check-aliyun-beian-wechat.sh

set -euo pipefail

DOMAIN="${1:-mofangdianai.com}"

echo "== 1) DNS =="
echo "A: $(dig +short A "$DOMAIN" | tr '\n' ' ')"
AAAA="$(dig +short AAAA "$DOMAIN" 2>/dev/null | tr '\n' ' ')"
if [[ -n "${AAAA// }" ]]; then
  echo "FAIL: 存在 AAAA=$AAAA → 微信易 reset，请删除 AAAA 仅留 A"
else
  echo "OK: 无 AAAA"
fi

echo ""
echo "== 2) 本机 HTTPS（须在 ECS 上 200） =="
curl -sS -m 10 --http1.1 "https://${DOMAIN}/erp-api/mp-cronet-ping" | head -c 120 || echo "FAIL"
echo

echo ""
echo "== 3) 模拟微信 UA（若此处 reset，多为备案/接入/WAF，非小程序代码） =="
CODE=$(curl -sS -m 10 --http1.1 -o /dev/null -w "%{http_code}" \
  -A "MicroMessenger/8.0.42" \
  "https://${DOMAIN}/erp-api/mp-cronet-ping" 2>/dev/null || echo 000)
echo "http_code=$CODE (000/空=握手被 reset)"

echo ""
echo "== 4) 证书链 =="
openssl s_client -connect "${DOMAIN}:443" -servername "$DOMAIN" -tls1_2 </dev/null 2>/dev/null \
  | openssl x509 -noout -subject -issuer -dates 2>/dev/null || echo "WARN: openssl 失败"

echo ""
echo "== 5) 必做（阿里云 ECS 常见根因） =="
cat <<EOF
若 3) 为 000 而 2) 在 ECS 上正常，且手机微信 -101、Safari 可能正常：

  → 域名须在 **阿里云 ICP 代备案系统** 完成「备案」或「接入备案」
  → 仅在其他平台备案、ECS 在阿里云，会被监测阻断 HTTPS（微信 Cronet 典型表现）

操作：
  1. 打开 https://beian.aliyun.com/ 登录与 ECS 同一账号
  2. 查 ${DOMAIN} 是否「已备案且接入阿里云」
  3. 若否：提交「新增接入」备案（约 1~20 个工作日）
  4. 备案期间可临时：DNS 增加 api.${DOMAIN} → 与本机同 IP，小程序改走 api 子域（见 ECS.md）

微信后台：
  request 合法域名仅 https://${DOMAIN}（若用 api 子域则再加 https://api.${DOMAIN}）
EOF
