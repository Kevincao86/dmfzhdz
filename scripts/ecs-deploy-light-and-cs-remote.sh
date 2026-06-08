#!/usr/bin/env bash
# 本机一键：推送后 SSH 部署轻量（API+根域 Web）与新 ECS（cs / fws 子域）
#
# 用法:
#   bash scripts/ecs-deploy-light-and-cs-remote.sh
#   LIGHT_HOST=admin@139.196.42.5 CS_HOST=admin@8.160.173.236 bash scripts/ecs-deploy-light-and-cs-remote.sh
#
# 仅轻量或仅 cs / 仅 fws:
#   DEPLOY_LIGHT=1 DEPLOY_CS=0 DEPLOY_FWS=0 bash scripts/ecs-deploy-light-and-cs-remote.sh

set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
LIGHT_HOST="${LIGHT_HOST:-admin@139.196.42.5}"
CS_HOST="${CS_HOST:-admin@8.160.173.236}"
DEPLOY_LIGHT="${DEPLOY_LIGHT:-1}"
DEPLOY_CS="${DEPLOY_CS:-1}"
DEPLOY_FWS="${DEPLOY_FWS:-1}"

ssh_run() {
  local host="$1"
  shift
  echo ""
  echo "======== SSH $host ========"
  ssh -o ConnectTimeout=20 -o StrictHostKeyChecking=accept-new "$host" "$@"
}

deploy_light() {
  ssh_run "$LIGHT_HOST" bash -s <<'REMOTE'
set -euo pipefail
cd ~/app
if [[ -f scripts/ecs-git-pull-gitee.sh ]]; then
  bash scripts/ecs-git-pull-gitee.sh
else
  git fetch origin main && git pull origin main
fi
echo "HEAD: $(git log -1 --oneline)"
sudo cp ~/app/scripts/ecs-meoo-api.nginx.conf /etc/nginx/sites-available/meoo-api.conf 2>/dev/null \
  || sudo cp ~/app/scripts/ecs-meoo-api.nginx.conf /etc/nginx/sites-available/meoo-api
sudo nginx -t
sudo systemctl reload nginx
if [[ -f scripts/ecs-deploy-merchant-web-mofangdianai.sh ]]; then
  sudo bash scripts/ecs-deploy-merchant-web-mofangdianai.sh
else
  bash scripts/ecs-deploy-auth-api.sh
fi
bash scripts/ecs-diagnose-cloud-video.sh 2>/dev/null || true
REMOTE
}

deploy_cs() {
  ssh_run "$CS_HOST" bash -s <<'REMOTE'
set -euo pipefail
cd ~/app
if [[ -f scripts/ecs-git-pull-gitee.sh ]]; then
  bash scripts/ecs-git-pull-gitee.sh
else
  git fetch origin main && git pull origin main
fi
echo "HEAD: $(git log -1 --oneline)"
MEOO_API_UPSTREAM=https://mofangdianai.com MEOO_LIGHT_IP=139.196.42.5 \
  bash scripts/ecs-deploy-merchant-cs-web.sh
REMOTE
}

deploy_fws() {
  ssh_run "$CS_HOST" bash -s <<'REMOTE'
set -euo pipefail
cd ~/app
if [[ -f scripts/ecs-git-pull-gitee.sh ]]; then
  bash scripts/ecs-git-pull-gitee.sh
else
  git fetch origin main && git pull origin main
fi
echo "HEAD: $(git log -1 --oneline)"
MEOO_API_UPSTREAM=https://mofangdianai.com MEOO_LIGHT_IP=139.196.42.5 \
  bash scripts/ecs-deploy-partner-fws-web.sh
REMOTE
}

echo "部署目标: 轻量=$LIGHT_HOST (DEPLOY_LIGHT=$DEPLOY_LIGHT), cs ECS=$CS_HOST (DEPLOY_CS=$DEPLOY_CS, DEPLOY_FWS=$DEPLOY_FWS)"

if [[ "$DEPLOY_LIGHT" == "1" ]]; then
  deploy_light
fi

if [[ "$DEPLOY_CS" == "1" ]]; then
  deploy_cs
fi

if [[ "$DEPLOY_FWS" == "1" ]]; then
  deploy_fws
fi

echo ""
echo "OK: 远程部署命令已下发。验收:"
echo "  curl -sS https://mofangdianai.com/erp-api/meoo-merchant-ai-video-ice-config | head -c 300"
echo "  curl -sS -o /dev/null -w '%{http_code}' https://cs.mofangdianai.com/"
echo "  curl -sS -o /dev/null -w '%{http_code}' https://fws.mofangdianai.com/"
