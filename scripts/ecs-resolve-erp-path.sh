# shellcheck shell=bash
# 被其它 ecs-*.sh source；ECS 上可能是 web版/merchant-erp 或历史路径 web/merchant-erp

ecs_resolve_erp_dir() {
  local root="${1:-$HOME/app}"
  if [[ -f "$root/web版/merchant-erp/scripts/ecs-auth-api-server.ts" ]]; then
    echo "$root/web版/merchant-erp"
  elif [[ -f "$root/web/merchant-erp/scripts/ecs-auth-api-server.ts" ]]; then
    echo "$root/web/merchant-erp"
  else
    echo "$root/web版/merchant-erp"
  fi
}
