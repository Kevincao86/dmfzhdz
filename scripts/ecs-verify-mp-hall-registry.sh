#!/usr/bin/env bash
# 探活招募大厅接口（只应返回 mpRecruitmentOrders 数组）
# ECS admin: cd ~/app && bash scripts/ecs-git-pull-main.sh && bash scripts/ecs-verify-mp-hall-registry.sh

set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
PORT="${AUTH_API_PORT:-3001}"

if [[ "$(id -un)" != "admin" ]]; then
  echo "请用 admin 执行（勿 sudo 整条命令）"
  exit 1
fi

if ! curl -sf -m 3 "http://127.0.0.1:${PORT}/api/meoo-auth-ping" >/dev/null 2>&1; then
  echo "=== :${PORT} 未监听，先修复 auth-api ==="
  bash "$ROOT/scripts/ecs-ensure-auth-api.sh"
  echo ""
fi

echo "=== :${PORT} POST hall_registry（小程序主路径）==="
BODY="$(curl -sS -m 25 -X POST -H "Content-Type: application/json" \
  "http://127.0.0.1:${PORT}/api/meoo-ops-mp-auth" \
  -d '{"action":"hall_registry"}' || true)"
echo "${BODY}" | head -c 500
echo ""

if ! echo "$BODY" | grep -q 'mpRecruitmentOrders'; then
  echo "=== 回退 GET meoo-ops-mp-hall-registry ==="
  BODY="$(curl -sS -m 25 "http://127.0.0.1:${PORT}/api/meoo-ops-mp-hall-registry" || true)"
  echo "${BODY}" | head -c 500
  echo ""
fi

if ! echo "$BODY" | grep -q 'mpRecruitmentOrders'; then
  echo "FAIL: 响应不含 mpRecruitmentOrders"
  echo "  sudo journalctl -u meoo-auth-api -n 40 --no-pager"
  exit 1
fi

echo "=== Nginx /erp-api ==="
NGX="$(curl -sS -m 25 -H "Host: 139.196.42.5" "http://127.0.0.1/erp-api/meoo-ops-mp-hall-registry" || true)"
echo "${NGX}" | head -c 500
echo ""
ORDER_ID="${ORDER_ID:-}"
if [[ -n "$ORDER_ID" ]]; then
  echo "=== 检查订单 $ORDER_ID 是否在大厅响应中 ==="
  CHECK="$(echo "$BODY" | ORDER_ID="$ORDER_ID" node -e "
    const id = process.env.ORDER_ID;
    let raw = '';
    process.stdin.on('data', (c) => { raw += c; });
    process.stdin.on('end', () => {
      try {
        const data = JSON.parse(raw || '{}');
        const list = Array.isArray(data.mpRecruitmentOrders) ? data.mpRecruitmentOrders : [];
        const hit = list.find((o) => o && String(o.id) === id);
        if (!hit) {
          console.log('MISSING: 不在大厅开放单列表（可能已截止/已完成或 status 非 open|collecting）');
          process.exit(2);
        }
        console.log('FOUND:', JSON.stringify({
          id: hit.id,
          status: hit.status,
          deadline: hit.deadline,
          title: hit.title,
          hall: hit.hall,
          orderKind: hit.orderKind,
        }));
      } catch (e) {
        console.error('parse_failed', e && e.message ? e.message : e);
        process.exit(3);
      }
    });
  " 2>/dev/null || true)"
  echo "$CHECK"
  if echo "$CHECK" | grep -q '^MISSING:'; then
    echo "提示: ORDER_ID=$ORDER_ID bash scripts/ecs-repair-mp-hall-order-deadline.sh"
    exit 2
  fi
fi

echo "OK: 招募大厅接口可用。请上传体验版并部署云函数 mpErpProxy。"
