#!/usr/bin/env bash
# 从 auth-api.env 备份恢复 MP_AUTH_PEPPER / 微信密钥（只改 env 文件，不动数据库）
# ECS: cd ~/app && bash scripts/ecs-restore-auth-pepper-from-backup.sh

set -euo pipefail

ENV_FILE="${AUTH_API_ENV:-$HOME/stack/auth-api.env}"
RESTORE_KEYS=(MP_AUTH_PEPPER MERCHANT_AUTH_PEPPER MP_WECHAT_APPID MP_WECHAT_SECRET)

if [[ ! -f "$ENV_FILE" ]]; then
  echo "FAIL: 缺少 $ENV_FILE"
  exit 1
fi

pick_backup() {
  local f newest=""
  # 优先最新备份（旧 pepper 会导致「密码正确仍无法登录」）
  while IFS= read -r f; do
    [[ -f "$f" ]] || continue
    grep -q '^MP_AUTH_PEPPER=.' "$f" 2>/dev/null || continue
    newest="$f"
  done < <(
    {
      ls -t "$ENV_FILE".bak.* 2>/dev/null || true
      ls -t "$ENV_FILE.bak" "$HOME/stack/vercel-export.production.env" 2>/dev/null || true
    } | awk '!seen[$0]++'
  )
  [[ -n "$newest" ]] || return 1
  echo "$newest"
}

BACKUP="$(pick_backup || true)"
if [[ -z "$BACKUP" ]]; then
  echo "FAIL: 未找到含 MP_AUTH_PEPPER 的备份（${ENV_FILE}.bak.* 或 vercel-export）"
  echo "请从 Vercel 环境变量或旧机器复制 MP_AUTH_PEPPER 后写入 $ENV_FILE"
  exit 1
fi

echo "使用备份: $BACKUP"
STAMP="$(date +%Y%m%d%H%M%S)"
cp "$ENV_FILE" "${ENV_FILE}.pre-restore.${STAMP}"

restored=0
for k in "${RESTORE_KEYS[@]}"; do
  val="$(grep -m1 "^${k}=" "$BACKUP" 2>/dev/null | cut -d= -f2- || true)"
  [[ -n "$val" ]] || continue
  if grep -q "^${k}=" "$ENV_FILE" 2>/dev/null; then
    sed -i.bak "/^${k}=/d" "$ENV_FILE"
  fi
  echo "${k}=${val}" >>"$ENV_FILE"
  echo "  + ${k}"
  restored=$((restored + 1))
done

if [[ "$restored" -eq 0 ]]; then
  echo "FAIL: 备份中无可恢复项"
  exit 1
fi

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
PORT="${AUTH_API_PORT:-3001}"

echo "== 重启 meoo-auth-api =="
sudo systemctl restart meoo-auth-api

auth_up() {
  curl -sf -m 3 "http://127.0.0.1:${PORT}/api/meoo-auth-ping" >/dev/null 2>&1
}

OK=0
for i in 1 2 3 4 5 6 7 8 9 10 11 12 13 14 15; do
  sleep 2
  if auth_up; then
    OK=1
    break
  fi
  echo "等待 :${PORT} 就绪 (${i}/15)…"
done

if [[ "$OK" != 1 ]]; then
  echo "WARN: 重启后 :${PORT} 未就绪，尝试 ecs-ensure-auth-api …"
  bash "$ROOT/scripts/ecs-ensure-auth-api.sh" || true
  sleep 3
fi

if auth_up; then
  curl -sS -m 5 "http://127.0.0.1:${PORT}/api/meoo-erp-api-health" | head -c 200
  echo ""
  echo "OK: 已恢复 $restored 项，auth-api 已就绪。请重新尝试账号密码登录。"
else
  echo "FAIL: auth-api 仍未启动。请执行:"
  echo "  sudo journalctl -u meoo-auth-api -n 40 --no-pager"
  echo "  bash $ROOT/scripts/ecs-fix-erp-api-502.sh"
  exit 1
fi
