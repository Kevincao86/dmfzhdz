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
  local f
  for f in "$ENV_FILE".bak.* "$ENV_FILE.bak" "$HOME/stack/vercel-export.production.env"; do
    [[ -f "$f" ]] || continue
    if grep -q '^MP_AUTH_PEPPER=.' "$f" 2>/dev/null; then
      echo "$f"
      return 0
    fi
  done
  return 1
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

echo "== 重启 meoo-auth-api =="
sudo systemctl restart meoo-auth-api
sleep 2
curl -sS -m 5 "http://127.0.0.1:3001/api/meoo-erp-api-health" | head -c 200
echo ""
echo "OK: 已恢复 $restored 项。请重新尝试账号密码登录。"
