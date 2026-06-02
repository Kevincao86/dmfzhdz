#!/usr/bin/env bash
# 统一 ECS 上 admin 的 HOME（避免 sudo bash 整脚本时读到 /root/stack）
# 用法: source "$(dirname "$0")/ecs-resolve-admin-home.sh"

ecs_resolve_admin_home() {
  local u h
  u="$(id -un)"
  if [[ "$u" == "admin" ]]; then
    h="$HOME"
  elif [[ "$u" == "root" ]]; then
    if [[ -n "${SUDO_USER:-}" && "$SUDO_USER" != "root" ]]; then
      h="$(getent passwd "$SUDO_USER" 2>/dev/null | cut -d: -f6 || echo "")"
    fi
    if [[ -z "$h" && -d /home/admin ]]; then
      h="/home/admin"
    fi
  else
    h="$HOME"
  fi
  if [[ -n "$h" && -d "$h" ]]; then
    export HOME="$h"
  fi
}

ecs_resolve_admin_home
