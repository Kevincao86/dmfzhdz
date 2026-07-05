#!/usr/bin/env bash
# 一次性配置：本机免密 SSH 到轻量 + 新 ECS，供 Agent 远程部署
#
# 用法:
#   bash scripts/ecs-setup-ssh-once.sh          # 写 SSH config + 测连通
#   bash scripts/ecs-setup-ssh-once.sh --copy-id # 还需在 ecs-ssh.local.env 填 ECS_SSH_PASSWORD

set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
ENV_FILE="$ROOT/.cursor/ecs-ssh.local.env"
EXAMPLE="$ROOT/.cursor/ecs-ssh.local.env.example"

mkdir -p "$ROOT/.cursor"

if [[ ! -f "$EXAMPLE" ]]; then
  echo "缺少 $EXAMPLE"
  exit 1
fi

if [[ ! -f "$ENV_FILE" ]]; then
  cp "$EXAMPLE" "$ENV_FILE"
  chmod 600 "$ENV_FILE"
  echo "已创建 $ENV_FILE — 若需自动装公钥，填入 ECS_SSH_PASSWORD 后重跑 --copy-id"
fi

# shellcheck disable=SC1090
source "$ENV_FILE"

ECS_SSH_KEY="${ECS_SSH_KEY:-$HOME/.ssh/id_ed25519_ecs}"
LIGHT_HOST="${LIGHT_HOST:-admin@139.196.42.5}"
CS_HOST="${CS_HOST:-admin@8.160.173.236}"
LIGHT_IP="${LIGHT_HOST#*@}"
CS_IP="${CS_HOST#*@}"

if [[ ! -f "$ECS_SSH_KEY" ]]; then
  echo "未找到私钥 $ECS_SSH_KEY"
  echo "生成: ssh-keygen -t ed25519 -f $ECS_SSH_KEY -C damowang-mac -N ''"
  exit 1
fi

PUB="${ECS_SSH_KEY}.pub"
if [[ ! -f "$PUB" ]]; then
  echo "未找到公钥 $PUB"
  exit 1
fi

SSH_CONFIG="$HOME/.ssh/config"
MARK_BEGIN="# >>> meoo-ecs (linqierp) >>>"
MARK_END="# <<< meoo-ecs (linqierp) <<<"

mkdir -p "$HOME/.ssh"
chmod 700 "$HOME/.ssh"

block="$(cat <<EOF
$MARK_BEGIN
Host meoo-light $LIGHT_IP
  HostName $LIGHT_IP
  User admin
  IdentityFile $ECS_SSH_KEY
  IdentitiesOnly yes
  StrictHostKeyChecking accept-new
  ConnectTimeout 20

Host meoo-cs $CS_IP
  HostName $CS_IP
  User admin
  IdentityFile $ECS_SSH_KEY
  IdentitiesOnly yes
  StrictHostKeyChecking accept-new
  ConnectTimeout 20
$MARK_END
EOF
)"

if [[ -f "$SSH_CONFIG" ]] && grep -qF "$MARK_BEGIN" "$SSH_CONFIG"; then
  tmp="$(mktemp)"
  awk -v b="$MARK_BEGIN" -v e="$MARK_END" '
    $0 == b { skip=1; next }
    $0 == e { skip=0; next }
    !skip { print }
  ' "$SSH_CONFIG" >"$tmp"
  printf '%s\n\n%s\n' "$(cat "$tmp")" "$block" >"$SSH_CONFIG"
  rm -f "$tmp"
else
  printf '\n%s\n' "$block" >>"$SSH_CONFIG"
fi
chmod 600 "$SSH_CONFIG"

echo 'OK: 已写入 '"${SSH_CONFIG}"'（Host meoo-light / meoo-cs + IP 别名）'
echo "公钥指纹: $(ssh-keygen -lf "$PUB")"
echo ""

copy_id_one() {
  local host="$1"
  local label="$2"
  if ssh -o BatchMode=yes -o ConnectTimeout=10 "$host" 'echo ok' >/dev/null 2>&1; then
    echo "[$label] 已免密 → $host"
    return 0
  fi
  if [[ "${ECS_SSH_PASSWORD:-}" == "" ]]; then
    echo "[$label] 未免密。手动执行:"
    echo "  ssh-copy-id -i $PUB $host"
    return 1
  fi
  if ! command -v sshpass >/dev/null 2>&1; then
    echo "[$label] 需要 sshpass: brew install hudochenkov/sshpass/sshpass"
    return 1
  fi
  SSHPASS="$ECS_SSH_PASSWORD" sshpass -e ssh-copy-id -i "$PUB" -o StrictHostKeyChecking=accept-new "$host"
  echo "[$label] 公钥已安装 → $host"
}

if [[ "${1:-}" == "--copy-id" ]]; then
  copy_id_one "$LIGHT_HOST" "轻量" || true
  copy_id_one "$CS_HOST" "新ECS" || true
fi

echo ""
echo "== 连通性测试 =="
ok=0
for pair in "meoo-light:轻量" "meoo-cs:新ECS"; do
  host="${pair%%:*}"
  label="${pair##*:}"
  if out="$(ssh -o BatchMode=yes "$host" 'hostname && test -d ~/app && echo APP_OK' 2>&1)"; then
    echo "✓ $label ($host): $out"
    ok=$((ok + 1))
  else
    echo "✗ $label ($host): $out"
  fi
done

echo ""
if [[ "$ok" -eq 2 ]]; then
  echo "全部就绪。Agent 可执行:"
  echo "  bash scripts/ecs-deploy-light-safe.sh --remote"
  echo "  bash scripts/ecs-deploy-light-and-cs-remote.sh"
  exit 0
fi

echo "尚未全部连通。任选其一:"
echo "  1) 在 $ENV_FILE 填入 ECS_SSH_PASSWORD 后: bash scripts/ecs-setup-ssh-once.sh --copy-id"
echo "  2) 阿里云控制台 → 实例 → 远程连接 → 粘贴公钥到 admin ~/.ssh/authorized_keys:"
echo "     $(cat "$PUB")"
exit 1
