#!/usr/bin/env bash
# 轻量一键修复：MERCHANT_AI_QWEN_BASE_URL / DASHSCOPE_BASE_URL 缺 https:// 导致 Failed to parse URL
#
# 用法（SSH admin@139.196.42.5）：
#   cd ~/app && bash scripts/ecs-git-pull-gitee.sh && bash scripts/ecs-fix-qwen-base-url-env.sh
#
# 可选：删除业务空间域名，回退公共 DashScope：
#   REMOVE_QWEN_BASE_URL=1 bash scripts/ecs-fix-qwen-base-url-env.sh
set -euo pipefail

STACK="${STACK_DIR:-$HOME/stack}"
ENV="$STACK/auth-api.env"

die() { echo "FAIL: $*" >&2; exit 1; }

[[ -f "$ENV" ]] || die "找不到 $ENV"

python3 <<'PY'
from pathlib import Path
import os
import re

stack = Path(os.environ.get("STACK_DIR", Path.home() / "stack"))
env_path = stack / "auth-api.env"
remove = os.environ.get("REMOVE_QWEN_BASE_URL", "").strip() in ("1", "true", "yes")

keys = ("MERCHANT_AI_QWEN_BASE_URL", "DASHSCOPE_BASE_URL")
text = env_path.read_text(encoding="utf-8", errors="replace")
lines_out = []
changed = []

def normalize_url(raw: str) -> str:
    s = raw.strip().strip('"').strip("'").rstrip("/")
    if not s:
        return ""
    if not re.match(r"^https?://", s, re.I):
        s = "https://" + s.lstrip("/")
    return s

for ln in text.splitlines():
    matched = False
    for k in keys:
        if not ln.startswith(f"{k}="):
            continue
        matched = True
        if remove:
            changed.append(f"removed {k}")
            break
        val = ln.split("=", 1)[1].strip().strip('"').strip("'")
        fixed = normalize_url(val)
        if fixed != val.rstrip("/"):
            changed.append(f"{k}: added https://")
        lines_out.append(f'{k}="{fixed}"')
        break
    if not matched:
        lines_out.append(ln)

if not changed and not remove:
    # 检查是否已有值但格式仍不对（引号内无协议）
    for k in keys:
        m = re.search(rf'^{re.escape(k)}="?([^"\n]+)"?', text, re.M)
        if m:
            raw = m.group(1).strip()
            if raw and not re.match(r"^https?://", raw, re.I):
                # 应被上面循环处理；若单行格式特殊则强制重写
                fixed = normalize_url(raw)
                text2 = re.sub(
                    rf'^{re.escape(k)}=.*$',
                    f'{k}="{fixed}"',
                    text,
                    count=1,
                    flags=re.M,
                )
                env_path.write_text(text2.rstrip() + "\n", encoding="utf-8")
                print(f"OK: 已修正 {k} → {fixed}")
                changed.append(k)
                break

if changed:
    env_path.write_text("\n".join(lines_out).rstrip() + "\n", encoding="utf-8")
    for c in changed:
        print(f"OK: {c}")
elif remove:
    env_path.write_text("\n".join(lines_out).rstrip() + "\n", encoding="utf-8")
    print("OK: 已删除 QWEN base URL，将使用 dashscope.aliyuncs.com 默认域名")
else:
    print("OK: QWEN base URL 已是合法格式，无需修改")

for k in keys:
    m = re.search(rf'^{re.escape(k)}="?([^"\n]+)"?', env_path.read_text(encoding="utf-8"), re.M)
    if m:
        print(f"  {k}={m.group(1)}")
PY

if command -v systemctl >/dev/null 2>&1; then
  sudo systemctl restart meoo-auth-api || true
  sleep 2
  curl -sf "http://127.0.0.1:3001/erp-api/meoo-erp-api-health" | head -c 200 || echo "WARN: health 未响应，请手动检查 journalctl -u meoo-auth-api"
fi

echo "完成。若仍报 Access denied，请核对业务空间 API Key 与域名是否同一工作空间。"
