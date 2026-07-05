#!/usr/bin/env bash
# 快速验证轻量 + 新 ECS SSH 是否可用（Agent 部署前可跑）
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
ENV_FILE="$ROOT/.cursor/ecs-ssh.local.env"
if [[ -f "$ENV_FILE" ]]; then
  # shellcheck disable=SC1090
  source "$ENV_FILE"
fi

LIGHT_HOST="${LIGHT_HOST:-admin@139.196.42.5}"
CS_HOST="${CS_HOST:-admin@8.160.173.236}"

test_host() {
  local host="$1"
  local label="$2"
  if ssh -o BatchMode=yes -o ConnectTimeout=15 "$host" 'hostname && ls ~/app/scripts/ecs-deploy-auth-api.sh >/dev/null 2>&1 && echo REPO_OK'; then
    echo "OK $label"
    return 0
  fi
  echo "FAIL $label ($host)" >&2
  return 1
}

fail=0
test_host meoo-light "轻量" || test_host "$LIGHT_HOST" "轻量" || fail=1
test_host meoo-cs "新ECS" || test_host "$CS_HOST" "新ECS" || fail=1
exit "$fail"
