#!/usr/bin/env bash
# 数字人口播 wan2.2-s2v 发版：拉代码 + auth-api + 履约/商家 Web 静态资源
#
# 两台机器分工（与 docs/MIGRATE-VERCEL-TO-ECS-talent-fulfillment.md 一致）：
#   轻量 139.196.42.5  → auth-api（wan_s2v 网关）
#   Web  8.160.173.236 → dr 履约站 + cs 商家站
#
# 在对应机器 admin 用户执行：
#   cd ~/app && bash scripts/ecs-deploy-digital-human-s2v.sh --light
#   cd ~/app && bash scripts/ecs-deploy-digital-human-s2v.sh --web
#
# 本机 SSH 免密时一键（需配置 LIGHT_HOST / CS_HOST）：
#   bash scripts/ecs-deploy-digital-human-s2v.sh --remote-all
#
# 仅发履约 dr（dist 已在 Git，可 SKIP_BUILD）：
#   cd ~/app && bash scripts/ecs-deploy-digital-human-s2v.sh --web --fulfillment-only

set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
LIGHT_HOST="${LIGHT_HOST:-admin@139.196.42.5}"
CS_HOST="${CS_HOST:-admin@8.160.173.236}"
MEOO_API_UPSTREAM="${MEOO_API_UPSTREAM:-https://mofangdianai.com}"

deploy_light() {
  echo "======== 轻量 auth-api ========"
  cd "$ROOT"
  if [[ -f scripts/ecs-git-pull-gitee.sh ]]; then
    bash scripts/ecs-git-pull-gitee.sh
  else
    git pull --ff-only || git pull
  fi
  echo "HEAD: $(git log -1 --oneline)"
  bash scripts/ecs-deploy-auth-api.sh
  curl -sS "http://127.0.0.1:3001/api/meoo-erp-api-health" | head -c 200 || true
  echo ""
}

deploy_web() {
  local fulfillment_only="${1:-0}"
  echo "======== Web 静态站 ========"
  cd "$ROOT"
  if [[ -f scripts/ecs-git-pull-gitee.sh ]]; then
    bash scripts/ecs-git-pull-gitee.sh
  else
    git pull --ff-only || git pull
  fi
  echo "HEAD: $(git log -1 --oneline)"

  SKIP_BUILD=1 MEOO_API_UPSTREAM="$MEOO_API_UPSTREAM" bash scripts/ecs-deploy-talent-fulfillment-web.sh
  if [[ "$fulfillment_only" != "1" ]]; then
    MEOO_API_UPSTREAM="$MEOO_API_UPSTREAM" MEOO_LIGHT_IP=139.196.42.5 \
      bash scripts/ecs-deploy-merchant-cs-web.sh
  fi

  echo ""
  echo "== 本机探活（Host 头） =="
  curl -sS -o /dev/null -w "dr index HTTP %{http_code}\n" \
    "http://127.0.0.1/" -H "Host: dr.mofangdianai.com" 2>/dev/null || true
  curl -sS -o /dev/null -w "cs index HTTP %{http_code}\n" \
    "http://127.0.0.1/" -H "Host: cs.mofangdianai.com" 2>/dev/null || true

  FUL_DIST="$ROOT/灵祺达人履约管理后台/dist/index.html"
  if [[ -f "$FUL_DIST" ]]; then
    echo ""
    echo "履约 dist 主 bundle:"
    rg -o 'index-[A-Za-z0-9]+\.js' "$FUL_DIST" | head -1 || true
    if rg -q 'index-B9d14oBS\.js' "$FUL_DIST" 2>/dev/null; then
      echo "OK: 已含新 bundle index-B9d14oBS.js（千问 s2v）"
    elif rg -q 'index-CWRWKxiQ\.js' "$FUL_DIST" 2>/dev/null; then
      echo "WARN: 仍是旧 bundle index-CWRWKxiQ.js，请 git pull 到 56758b74 或之后"
    fi
  fi
}

usage() {
  sed -n '2,16p' "$0"
}

main() {
  case "${1:-}" in
    --light)
      deploy_light
      ;;
    --web)
      if [[ "${2:-}" == "--fulfillment-only" ]]; then
        deploy_web 1
      else
        deploy_web 0
      fi
      ;;
    --remote-all)
      echo "远程 → $LIGHT_HOST (auth-api)"
      ssh -o ConnectTimeout=20 "$LIGHT_HOST" 'bash -s' -- --light <"$0"
      echo ""
      echo "远程 → $CS_HOST (dr + cs web)"
      ssh -o ConnectTimeout=20 "$CS_HOST" 'bash -s' -- --web <"$0"
      echo ""
      echo "完成。浏览器强刷后，数字人口播副标题应为「千问 wan2.2-s2v 口型驱动」"
      ;;
    -h|--help)
      usage
      ;;
    *)
      echo "用法:"
      usage
      exit 1
      ;;
  esac
}

main "$@"
