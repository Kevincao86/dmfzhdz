#!/usr/bin/env bash
# 小程序启动前冒烟：WXSS 花括号、JS 语法、ECS 健康（可连跑多轮）
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"
ROUNDS="${1:-1}"
FAIL=0

echo "==> mp smoke check x${ROUNDS} @ ${ROOT}"

check_wxss() {
  python3 - <<'PY'
import glob, sys
errors = []
for path in glob.glob('**/*.wxss', recursive=True):
    with open(path, encoding='utf-8') as f:
        text = f.read()
    depth = 0
    for ch in text:
        if ch == '{':
            depth += 1
        elif ch == '}':
            depth -= 1
            if depth < 0:
                errors.append((path, 'extra }'))
                break
    if depth != 0:
        errors.append((path, f'unclosed depth={depth}'))
for e in errors:
    print('WXSS', e[0], e[1])
sys.exit(1 if errors else 0)
PY
}

check_js() {
  local f
  while IFS= read -r -d '' f; do
    node --check "$f" >/dev/null
  done < <(find . -name '*.js' \
    ! -path './cloudfunctions/*' \
    ! -path './node_modules/*' \
    -print0)
}

check_api() {
  curl -fsS -m 8 -H 'Host: 139.196.42.5' \
    'http://139.196.42.5/erp-api/meoo-erp-api-health' \
    | grep -q '"ok":true'
}

for ((i = 1; i <= ROUNDS; i++)); do
  echo "--- round ${i}/${ROUNDS} ---"
  if ! check_wxss; then FAIL=1; echo "FAIL wxss round ${i}"; fi
  if ! check_js; then FAIL=1; echo "FAIL js round ${i}"; fi
  if ! check_api; then FAIL=1; echo "FAIL api round ${i}"; fi
  echo "round ${i} ok"
done

if [[ "$FAIL" -ne 0 ]]; then
  echo "SMOKE FAILED"
  exit 1
fi
echo "SMOKE PASSED x${ROUNDS}"
