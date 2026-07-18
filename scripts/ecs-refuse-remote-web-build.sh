#!/usr/bin/env bash
# 新ECS / 小内存机器：禁止 npm/vite 远程构建（须本机构建 + SKIP_BUILD=1）
# 由 ecs-deploy-merchant-cs-web.sh / ecs-deploy-partner-fws-web.sh 在 build 前 source。

ecs_refuse_remote_web_build_if_new_ecs() {
  if [[ "${SKIP_BUILD:-0}" == "1" ]]; then
    return 0
  fi
  if [[ "${ALLOW_REMOTE_WEB_BUILD:-0}" == "1" ]]; then
    echo "WARN: ALLOW_REMOTE_WEB_BUILD=1，跳过新ECS 构建门禁（不推荐）"
    return 0
  fi

  local mem_kb=99999999
  if [[ -r /proc/meminfo ]]; then
    mem_kb="$(awk '/MemTotal/ {print $2}' /proc/meminfo 2>/dev/null || echo 99999999)"
  fi

  local pub_ip=""
  pub_ip="$(curl -sS --connect-timeout 2 --max-time 3 https://ifconfig.me 2>/dev/null || true)"
  if [[ -z "$pub_ip" ]]; then
    pub_ip="$(curl -sS --connect-timeout 2 --max-time 3 https://api.ipify.org 2>/dev/null || true)"
  fi

  local is_new_ecs=0
  if [[ "$pub_ip" == "8.160.173.236" ]]; then
    is_new_ecs=1
  fi
  # 新ECS 约 1.6～2G；<3G 一律视为禁止远程 build
  if [[ "${mem_kb:-0}" -lt 3000000 ]]; then
    is_new_ecs=1
  fi

  if [[ "$is_new_ecs" -eq 1 ]]; then
    echo "========================================"
    echo "FAIL: 新ECS/小内存机器禁止 npm/vite build（会 OOM 卡死）"
    echo "请在开发机本机构建后部署："
    echo "  bash scripts/ecs-deploy-cs-web-local-build.sh"
    echo "  bash scripts/ecs-deploy-fws-web-local-build.sh"
    echo "  bash scripts/ecs-deploy-new-ecs-web-local-build.sh"
    echo "或已有 dist 时：SKIP_BUILD=1 MEOO_API_UPSTREAM=https://mofangdianai.com bash scripts/ecs-deploy-merchant-cs-web.sh"
    echo "========================================"
    exit 2
  fi
}
