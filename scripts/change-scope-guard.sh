#!/usr/bin/env bash
# 改动范围锁定：仅允许当前 scope 白名单内的文件被修改，否则 exit 2
#
# 用法:
#   bash scripts/change-scope-guard.sh --scope group_qr
#   bash scripts/change-scope-guard.sh --scope group_qr --staged
#   bash scripts/change-scope-guard.sh --list-scopes
#   bash scripts/change-scope-guard.sh --scope group_qr --allow "web版/merchant-erp/scripts/ecs-auth-api-server.ts"
#
# 规则见 .cursor/rules/change-scope-lock.mdc

set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"

SCOPE=""
MODE="worktree"
AGAINST="HEAD"
EXTRA_ALLOW=()

list_scopes() {
  cat <<'EOF'
可用 scope（--scope 参数）:

  group_qr          群二维码上传/展示/清理（不含探店视频/ICE/其它上传）
  recruit_video     探店成片上传
  ops_pr_library    运营台 PR 用户库
  ops_talent_library 运营台达人库
  ops_home          运营台首页看板
  recommend_hall    推荐大厅全部达人池（慎用，见 recommend-all-talents-lock）
  mp_auth           小程序登录/会话

示例:
  bash scripts/change-scope-guard.sh --scope group_qr
EOF
}

while [[ $# -gt 0 ]]; do
  case "$1" in
    --scope) SCOPE="${2:-}"; shift 2 ;;
    --staged) MODE="staged"; shift ;;
    --against-ref) AGAINST="${2:-HEAD}"; shift 2 ;;
    --allow) EXTRA_ALLOW+=("${2:-}"); shift 2 ;;
    --list-scopes) list_scopes; exit 0 ;;
    -h|--help)
      sed -n '2,14p' "$0"
      list_scopes
      exit 0
      ;;
    *) echo "未知参数: $1" >&2; exit 1 ;;
  esac
done

if [[ -z "$SCOPE" ]]; then
  echo "缺少 --scope。运行: bash scripts/change-scope-guard.sh --list-scopes" >&2
  exit 1
fi

# scope → 允许路径片段（命中任一即在该 scope 内）
scope_patterns() {
  case "$1" in
    group_qr)
      cat <<'PAT'
mpGroupQr
group-qr
group_qr
meoo-ops-mp-group-qr
form-relay-group-qr
mpGroupQrOss
mpGroupQrHall
mpGroupQrCleanup
iceGroupQr
formRelayGroupQr
PAT
      ;;
    recruit_video)
      cat <<'PAT'
recruitmentVideoUpload
recruitment-video-upload
meoo-ops-mp-recruitment-video-upload
PAT
      ;;
    ops_pr_library)
      cat <<'PAT'
OpsPrLibraryPage
OpsMembershipPlanVersionsPanel
prLibraryFilters
meoo-ops-mp-pr-user
meoo-ops-mp-membership-plan-versions
mpMembershipPlanVersion
PAT
      ;;
    ops_talent_library)
      cat <<'PAT'
OpsTalentLibraryPage
OpsMembershipPlanVersionsPanel
talentLibraryFilters
OpsLibraryBatchFeatures
OpsLibraryFeaturesImport
libraryFeaturesSheetParse
meoo-ops-mp-library-features
meoo-ops-mp-membership-plan-versions
mpMembershipPlanVersion
PAT
      ;;
    ops_home)
      cat <<'PAT'
OpsHomePage
opsDashboardCompute
opsMpUserDashboardCompute
opsDashboardRange
PAT
      ;;
    recommend_hall)
      cat <<'PAT'
recommendAllTalentsPool
recommendHall
recommendPoolVerify
recommend-all-talents
PAT
      ;;
    mp_auth)
      cat <<'PAT'
meoo-ops-mp-auth
mpSession
auth.js
pages/login/
PAT
      ;;
    *)
      echo ""
      ;;
  esac
}

PATTERNS="$(scope_patterns "$SCOPE")"
if [[ -z "$PATTERNS" ]]; then
  echo "未知 scope: $SCOPE" >&2
  list_scopes >&2
  exit 1
fi

if [[ "$MODE" == "staged" ]]; then
  CHANGED_RAW="$(git diff --cached --name-only --diff-filter=ACMRT 2>/dev/null || true)"
else
  CHANGED_RAW="$(git diff --name-only --diff-filter=ACMRT "$AGAINST" 2>/dev/null || true)"
fi

CHANGED=()
while IFS= read -r line; do
  [[ -n "$line" ]] && CHANGED+=("$line")
done <<EOF
$CHANGED_RAW
EOF

if [[ ${#CHANGED[@]} -eq 0 ]]; then
  echo "OK: scope=$SCOPE，无待检改动"
  exit 0
fi

file_allowed() {
  local f="$1"
  local pat
  while IFS= read -r pat; do
    [[ -z "$pat" ]] && continue
    [[ "$f" == *"$pat"* ]] && return 0
  done <<EOF
$PATTERNS
EOF
  local extra
  for extra in "${EXTRA_ALLOW[@]}"; do
    [[ -n "$extra" && "$f" == *"$extra"* ]] && return 0
  done
  return 1
}

FORBIDDEN=()
for f in "${CHANGED[@]}"; do
  if ! file_allowed "$f"; then
    FORBIDDEN+=("$f")
  fi
done

if [[ ${#FORBIDDEN[@]} -gt 0 ]]; then
  echo "========================================"
  echo "【越界通知】scope=$SCOPE — 以下文件不在白名单，禁止修改"
  echo "========================================"
  echo ""
  echo "越界文件:"
  printf '  - %s\n' "${FORBIDDEN[@]}"
  echo ""
  echo "本次允许 scope: $SCOPE"
  echo "白名单关键词:"
  while IFS= read -r pat; do
    [[ -n "$pat" ]] && echo "  · *${pat}*"
  done <<EOF
$PATTERNS
EOF
  if [[ ${#EXTRA_ALLOW[@]} -gt 0 ]]; then
    echo "额外允许:"
    printf '  · %s\n' "${EXTRA_ALLOW[@]}"
  fi
  echo ""
  echo "请撤销越界改动，或向用户申请扩大范围后回复：确认扩大范围"
  exit 2
fi

echo "OK: scope=$SCOPE，${#CHANGED[@]} 个文件均在白名单内"
exit 0
