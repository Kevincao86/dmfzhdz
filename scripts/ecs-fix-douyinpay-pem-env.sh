#!/usr/bin/env bash
# 轻量一键修复：抖音支付私钥改读 PEM 文件，去掉 auth-api.env 内联 PEM（解决 DECODER unsupported）
#
# 用法（SSH admin@139.196.42.5）：
#   cd ~/app && bash scripts/ecs-git-pull-gitee.sh && bash scripts/ecs-fix-douyinpay-pem-env.sh
#
# 若 stack 下无 pem，脚本会依次尝试：
#   1) 从 ~/stack/auth-api.env 内联 DOUYINPAY_PRIVATE_KEY 还原
#   2) 在 $HOME /tmp 查找「商户私钥*」上传文件
#   3) 环境变量 DOUYINPAY_PRIVATE_PEM=路径
set -euo pipefail

STACK="${STACK_DIR:-$HOME/stack}"
ENV="$STACK/auth-api.env"
PRIV="$STACK/douyinpay-private.pem"
PLAT="$STACK/douyinpay-platform-public.pem"
PRIV_PKCS8="$STACK/douyinpay-private.pkcs8.pem"

die() { echo "FAIL: $*" >&2; exit 1; }

find_upload() {
  local pattern="$1"
  find /tmp "$HOME" -maxdepth 6 -type f -name "$pattern" 2>/dev/null | head -1
}

find_private_pem_file() {
  local f
  while IFS= read -r f; do
    [[ -f "$f" ]] || continue
    grep -qE 'BEGIN (RSA )?PRIVATE KEY' "$f" 2>/dev/null && { echo "$f"; return 0; }
  done < <(find /tmp "$HOME" -maxdepth 6 -type f \( -name '*.pem' -o -name '*.txt' -o -name '*私钥*' \) 2>/dev/null | sort -u)
  return 1
}

recover_pem_from_env() {
  python3 <<'PY'
from pathlib import Path
import os
import re

stack = Path(os.environ.get("STACK_DIR", Path.home() / "stack"))
env_path = stack / "auth-api.env"
priv_out = stack / "douyinpay-private.pem"
plat_out = stack / "douyinpay-platform-public.pem"

if not env_path.exists():
    raise SystemExit(0)

text = env_path.read_text(encoding="utf-8", errors="replace")

def extract_inline_pem(name: str) -> str:
    m = re.search(rf'^{re.escape(name)}="((?:[^"\\]|\\.)*)"', text, re.M)
    if m:
        return m.group(1).replace("\\n", "\n").strip()
    # 多行 PEM（非引号单行）
    lines = text.splitlines()
    out = []
    capture = False
    for ln in lines:
        if ln.startswith(f"{name}="):
            rest = ln.split("=", 1)[1].strip().strip('"')
            if "BEGIN" in rest:
                out.append(rest)
                capture = True
                if "END PRIVATE KEY" in rest or "END PUBLIC KEY" in rest:
                    capture = False
            continue
        if capture:
            out.append(ln)
            if "END PRIVATE KEY" in ln or "END PUBLIC KEY" in ln:
                capture = False
    return "\n".join(out).strip()

priv = extract_inline_pem("DOUYINPAY_PRIVATE_KEY")
plat = extract_inline_pem("DOUYINPAY_PLATFORM_PUBLIC_KEY")

if priv and "BEGIN" in priv and not priv_out.exists():
    priv_out.write_text(priv + "\n", encoding="utf-8")
    print(f"OK: 已从 auth-api.env 还原 {priv_out}")

if plat and "BEGIN" in plat and not plat_out.exists():
    plat_out.write_text(plat + "\n", encoding="utf-8")
    print(f"OK: 已从 auth-api.env 还原 {plat_out}")
PY
}

ensure_private_pem() {
  if [[ -f "$PRIV" ]]; then
    return 0
  fi
  echo "WARN: 未找到 $PRIV，尝试自动恢复…"
  recover_pem_from_env || true
  if [[ -f "$PRIV" ]]; then
    return 0
  fi
  local src="${DOUYINPAY_PRIVATE_PEM:-$(find_upload '商户私钥*')}"
  if [[ -z "$src" || ! -f "$src" ]]; then
    src="$(find_private_pem_file || true)"
  fi
  if [[ -n "$src" && -f "$src" ]] && grep -qE 'BEGIN (RSA )?PRIVATE KEY' "$src" 2>/dev/null; then
    mkdir -p "$STACK"
    cp -f "$src" "$PRIV"
    echo "OK: 已复制私钥 $src → $PRIV"
    return 0
  fi
  die "$(cat <<EOF
找不到商户私钥文件 $PRIV

请任选一种方式：
  A) Lighthouse 文件管理上传「商户私钥_xxx.pem」到 /home/admin/ 后重跑本脚本
  B) 指定路径：DOUYINPAY_PRIVATE_PEM=/path/to/商户私钥.pem bash scripts/ecs-fix-douyinpay-pem-env.sh
  C) 完整配置（需私钥+商家公钥证书+32位APIv3密钥）：
     DOUYINPAY_MCH_ID=6020260627413952 \\
     DOUYINPAY_ENCRYPT_KEY=<pay.douyinpay.com 账户中心 API 安全里的32位密钥> \\
     DOUYINPAY_APP_ID=awj7r3emov98djtg \\
     bash scripts/ecs-setup-douyinpay-env.sh

注意：DOUYINPAY_ENCRYPT_KEY 必须填真实 32 位密钥，不能填占位符「你的32位APIv3密钥」。
EOF
)"
}

ensure_private_pem

ensure_platform_pem() {
  if [[ -f "$PLAT" ]]; then
    return 0
  fi
  echo "WARN: 未找到 $PLAT，尝试自动发现平台公钥…"
  recover_pem_from_env || true
  if [[ -f "$PLAT" ]]; then
    return 0
  fi
  local src="${DOUYINPAY_PLATFORM_PEM:-}"
  if [[ -z "$src" || ! -f "$src" ]]; then
    src="$(find_upload 'pub_key.pem' 2>/dev/null || true)"
  fi
  if [[ -z "$src" || ! -f "$src" ]]; then
    src="$(find_upload '*平台*公钥*' 2>/dev/null || true)"
  fi
  if [[ -n "$src" && -f "$src" ]] && echo "$src" | grep -qi wechat; then
    src=""
  fi
  if [[ -n "$src" && -f "$src" ]] && grep -qE 'BEGIN (RSA )?PUBLIC KEY' "$src" 2>/dev/null; then
    mkdir -p "$STACK"
    cp -f "$src" "$PLAT"
    echo "OK: 已复制平台公钥 $src → $PLAT"
  fi
}

ensure_platform_pem

echo "==> 校验并转为 PKCS#8"
openssl pkey -in "$PRIV" -noout
if grep -q 'BEGIN RSA PRIVATE KEY' "$PRIV" 2>/dev/null; then
  openssl pkcs8 -topk8 -nocrypt -inform PEM -outform PEM -in "$PRIV" -out "$PRIV_PKCS8"
  cp -f "$PRIV_PKCS8" "$PRIV"
  echo "已转换 RSA PKCS#1 → PKCS#8"
fi
openssl pkey -in "$PRIV" -noout && echo "私钥 OK"

python3 <<PY
from pathlib import Path
import os

stack = Path(os.environ.get("STACK_DIR", Path.home() / "stack"))
env_path = stack / "auth-api.env"
priv = stack / "douyinpay-private.pem"
plat = stack / "douyinpay-platform-public.pem"

strip_prefixes = (
    "DOUYINPAY_PRIVATE_KEY=",
    "DOUYINPAY_PLATFORM_PUBLIC_KEY=",
    "DOUYINPAY_PRIVATE_KEY_FILE=",
    "DOUYINPAY_PLATFORM_PUBLIC_KEY_FILE=",
)
text = env_path.read_text(encoding="utf-8") if env_path.exists() else ""
keep = []
skip_pem = False
douyin_inline = {"DOUYINPAY_PRIVATE_KEY", "DOUYINPAY_PLATFORM_PUBLIC_KEY"}
for ln in text.splitlines():
    key = ln.split("=", 1)[0].strip() if "=" in ln else ""
    if any(ln.startswith(p) for p in strip_prefixes):
        if key in douyin_inline and "BEGIN" in ln and "END PRIVATE KEY" not in ln and "END PUBLIC KEY" not in ln:
            skip_pem = True
        continue
    if skip_pem:
        if "END PRIVATE KEY" in ln or "END PUBLIC KEY" in ln or "END CERTIFICATE" in ln:
            skip_pem = False
        continue
    if ln.strip():
        keep.append(ln)

lines = [
    f"DOUYINPAY_PRIVATE_KEY_FILE={priv}",
]
if plat.exists():
    lines.append(f"DOUYINPAY_PLATFORM_PUBLIC_KEY_FILE={plat}")
else:
    print("WARN: 未找到平台公钥 ~/stack/douyinpay-platform-public.pem")
    print("      请: bash scripts/ecs-fix-douyinpay-platform-key.sh")

env_path.parent.mkdir(parents=True, exist_ok=True)
env_path.write_text("\n".join(keep + lines) + "\n", encoding="utf-8")
print("OK: 已写入", env_path)
print("  DOUYINPAY_PRIVATE_KEY_FILE=", priv)
if plat.exists():
    print("  DOUYINPAY_PLATFORM_PUBLIC_KEY_FILE=", plat)
PY

echo "==> 重启 auth-api"
if [[ -d "$HOME/app" ]]; then
  cd "$HOME/app" && bash scripts/ecs-deploy-auth-api.sh
else
  sudo systemctl restart meoo-auth-api
fi

sleep 2
echo "==> 探活"
curl -sS "http://127.0.0.1:3001/api/meoo-douyin-pay-notify?detail=1&probeNative=1" || true
echo ""
