#!/usr/bin/env bash
# 兼容旧命令名 → 服务商 fws 部署脚本
exec "$(cd "$(dirname "$0")" && pwd)/ecs-deploy-partner-fws-web.sh" "$@"
