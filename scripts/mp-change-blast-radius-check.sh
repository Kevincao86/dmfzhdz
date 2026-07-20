#!/usr/bin/env bash
# 小程序/共享模块改动误伤检测：若可能影响其它功能，exit 2 并输出「误伤通知」供人工确认
#
# 用法:
#   bash scripts/mp-change-blast-radius-check.sh           # 工作区相对 HEAD
#   bash scripts/mp-change-blast-radius-check.sh --staged  # 仅 staged
#   bash scripts/mp-change-blast-radius-check.sh --against-ref origin/main
#
# Agent 规则（见 mp-change-blast-radius-guard.mdc）：
#   exit 2 → 禁止继续改代码/提交/部署，须向用户发出误伤通知并等待确认

set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"

MODE="worktree"
AGAINST="HEAD"
while [[ $# -gt 0 ]]; do
  case "$1" in
    --staged) MODE="staged"; shift ;;
    --against-ref)
      AGAINST="${2:-HEAD}"
      shift 2
      ;;
    -h|--help)
      sed -n '2,12p' "$0"
      exit 0
      ;;
    *) echo "未知参数: $1" >&2; exit 1 ;;
  esac
done

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
  echo "OK: 无待检改动"
  exit 0
fi

# 共享/基础设施：一动即可能误伤全站或多业务线
SHARED_PATTERNS=(
  '灵祺达人撮合小程序/utils/ecs.js'
  '灵祺达人撮合小程序/utils/api.js'
  '灵祺达人撮合小程序/utils/cloudEcs.js'
  '灵祺达人撮合小程序/utils/auth.js'
  '灵祺达人撮合小程序/utils/mpRuntime.js'
  '灵祺达人撮合小程序/utils/hallRegistryParse.js'
  '灵祺达人撮合小程序/cloudfunctions/mpErpProxy/'
  'web版/merchant-erp/scripts/ecs-auth-api-server.ts'
  'web版/merchant-erp/src/lib/registrySnapshotIo'
  '商家管理后台/src/ops/opsRegistryApi.ts'
)

# 业务域标签见脚本末尾 case 分支

match_any() {
  local file="$1"
  shift
  local pat
  for pat in "$@"; do
    [[ "$file" == *"$pat"* ]] && return 0
  done
  return 1
}

hit_shared=0
shared_files=()
domains="" # space-separated keys

add_domain() {
  local key="$1"
  case " $domains " in
    *" $key "*) ;;
    *) domains="${domains:+$domains }$key" ;;
  esac
}

for f in "${CHANGED[@]}"; do
  [[ -z "$f" ]] && continue
  for sp in "${SHARED_PATTERNS[@]}"; do
    if [[ "$f" == *"$sp"* ]]; then
      hit_shared=1
      shared_files+=("$f")
      add_domain shared_infra
      break
    fi
  done

  if match_any "$f" mpGroupQr form-relay-group-qr mine-pr-order-applicants group-qr; then
    add_domain group_qr
  fi
  if match_any "$f" recruitmentVideoUpload recruitment-video-upload; then
    add_domain recruit_video
  fi
  if match_any "$f" recommendAllTalentsPool recommendHall recommend-all-talents; then
    add_domain recommend_hall
  fi
  if match_any "$f" meoo-ops-mp-auth mp-auth auth.js mpSession; then
    add_domain mp_auth
  fi
  if match_any "$f" '/pages/publish/' publish.js publishOrder; then
    add_domain mp_publish
  fi
  if match_any "$f" talentChat messagesStore mp-talent-chat inbox; then
    add_domain mp_chat
  fi
  if match_any "$f" opsRegistry registrySnapshot meoo-ops-sync-registry meoo-ops-mp-recruitment; then
    add_domain ops_registry
  fi
  if match_any "$f" '商家管理后台/src/ops/' '商家管理后台/api/'; then
    add_domain ops_admin_ui
  fi
  if match_any "$f" '灵祺达人履约管理后台/'; then
    add_domain fulfillment_web
  fi
  if match_any "$f" scripts/ecs- ecs-deploy ecs-pre-light; then
    add_domain deploy
  fi
done

domain_count=0
if [[ -n "$domains" ]]; then
  # shellcheck disable=SC2206
  domain_keys=($domains)
  domain_count=${#domain_keys[@]}
fi

# 误伤条件：改了共享基础设施；或一次改动跨 2+ 业务域
if [[ "$hit_shared" -eq 1 || "$domain_count" -gt 1 ]]; then
  echo "========================================"
  echo "【误伤通知】本次改动可能影响其它功能，已暂停自动修改/部署"
  echo "========================================"
  echo ""
  echo "改动文件 (${#CHANGED[@]}):"
  printf '  - %s\n' "${CHANGED[@]}"
  echo ""
  if [[ "$hit_shared" -eq 1 ]]; then
    echo "命中共享/基础设施（高风险）:"
    printf '  - %s\n' "${shared_files[@]}"
    echo ""
  fi
  echo "可能影响的功能域:"
  for key in $domains; do
    label=""
    case "$key" in
      group_qr) label='群二维码上传/展示/通知、转发代收、PR报名列表' ;;
      recruit_video) label='探店成片上传、视频审核' ;;
      recommend_hall) label='推荐大厅全部达人池（见 recommend-all-talents-lock）' ;;
      mp_auth) label='小程序登录/会话/hall_registry' ;;
      mp_publish) label='发单/发布向导' ;;
      mp_chat) label='达人私信/站内信' ;;
      ops_registry) label='运营注册表读写/同步' ;;
      ops_admin_ui) label='商家管理后台页面' ;;
      fulfillment_web) label='履约 Web 小程序嵌入' ;;
      deploy) label='部署脚本/轻量 auth-api' ;;
      shared_infra) label='小程序 API 通道/云代理/全局网络层' ;;
      *) label="$key" ;;
    esac
    echo "  · $label"
  done
  echo ""
  echo "请确认是否仍要继续本次修改。"
  echo "确认后回复：确认误伤继续"
  echo ""
  echo "检测命令: bash scripts/mp-change-blast-radius-check.sh"
  exit 2
fi

if [[ "$domain_count" -eq 1 ]]; then
  key="${domain_keys[0]}"
  label=""
  case "$key" in
    group_qr) label='群二维码上传/展示/通知、转发代收、PR报名列表' ;;
    recruit_video) label='探店成片上传、视频审核' ;;
    recommend_hall) label='推荐大厅全部达人池' ;;
    mp_auth) label='小程序登录/会话' ;;
    mp_publish) label='发单/发布向导' ;;
    mp_chat) label='达人私信/站内信' ;;
    ops_registry) label='运营注册表读写/同步' ;;
    ops_admin_ui) label='商家管理后台页面' ;;
    fulfillment_web) label='履约 Web' ;;
    deploy) label='部署脚本' ;;
    shared_infra) label='共享网络层' ;;
    *) label="$key" ;;
  esac
  # 仅输出 ASCII key，避免部分环境 UTF-8 与 set -u 组合导致 echo 误解析
  echo "OK: 改动范围集中在 domain=${key}，未检出跨域误伤"
else
  echo "OK: 改动未命中已知跨域风险模式"
fi
exit 0
