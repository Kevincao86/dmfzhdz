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
  video_review_play 链接/视频审核预览（ICE短链误判 + OSS签名过期）
  ops_pr_library    运营台 PR 用户库
  ops_talent_library 运营台达人库
  ops_home          运营台首页看板
  recommend_hall    推荐大厅全部达人池（慎用，见 recommend-all-talents-lock）
  mp_auth           小程序登录/会话
  ai_vision_workshop AI视觉工坊（DR增值嵌入 + 撮合小程序原生页 + 会员权限位）
  form_relay_share   转发代收「复制分享」短链（微信 genwxashortlink + 详情页路径）
  merchant_ai_ops_mix 商家 ERP：AI运营方案 + AI混剪去重
  erp_pay_points       ERP小程序支付 + 星选积分余额对齐
  mp_hall_region       小程序招募/推荐大厅城市自动定位
  merchant_nav         商家/服务商 ERP 侧栏导航信息架构
  partner_record_workshop 服务商 AI 创作 · 录播工坊（半自动）
  ai_points            全端 AI 积分扣减 / 60% 毛利定价
  mp_order_detail_fast 商单详情秒开（hall_registry includeOnly + PG 按 id）
  erp_merchant_mp      商家管理 ERP 小程序（改名/菜单对齐商家Web/缺口页）

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
    video_review_play)
      cat <<'PAT'
mpRecruitmentVideoCore
mpRecruitmentVideoPlayUrl
mpRecruitmentIceCore
videoReviewShareHandler
meoo-ops-mp-recruitment-video-upload
PrOrderVideoReviewPage
ApplicantVisitDeliverablePanel
mine-pr-order-video-review
recruitmentVideoUpload
change-scope-guard
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
    ai_vision_workshop)
      cat <<'PAT'
AiImageStudioPage
aiImageStudio
visualStudio
visual_studio
addon_visual_studio
mpVisualStudioAi
meooAgentImageCore
meoo-ai-agent-image
merchantAiUpstream
qwenVisionApi
qwenVisionCatalog
mine-pr-addon-visual-studio
mine-pr-addon-shortvideo
mine-pr-addon-digital-human
mine-pr-addons
mine-pr-addon-ai-content
mpAddonRecruitOrders
mpAddonIceApi
mpPrivacyAuthorize
OpsAccountsPermissionsPage
opsStaffAuth
addonCards
mpFeatureFlags
mpEmbedAddonAccess
mpMembershipCatalog
mpPointsSpendApi
mpAddonMerchantApi
mpAddonPageGate
prFeatureAccess
addonAccess
embedPages
MerchantEmbedShell
mp-addon-page
App.tsx
authMpSession
mpSession
change-scope-guard
撮合小程序/app.json
撮合小程序/pages/mine/mine.js
撮合小程序/utils/ecs.js
撮合小程序/utils/cloudEcs.js
PAT
      ;;
    form_relay_share)
      cat <<'PAT'
mine-form-relay
mpRecruitmentApplyShortLink
mpApplyShortLink
recruitmentShareCopy
change-scope-guard
PAT
      ;;
    merchant_ai_ops_mix)
      cat <<'PAT'
aiOpsPlanTypes
aiOpsPlanExport
aiOpsPlanApi
AiOpsPlanPage
aiGenerationJobs
AiGenerationJobsBanner
MeooLayout
merchantAiOpsPlanCore
merchantAiUpstream
meoo-ai-ops-plan
talentLibraryTierPricing
meoo-ops-novice-kol-allocation
aiAgentRecruitmentAllocation
aiAgentRecruitmentParse
services/ai/types
iceMixEditPlanAi
iceMixProduceEngine
iceMixPlan
ShortVideoIceBatchPanel
ShortVideoOptimizationPage
aliyunIceCloudApi
aliyunIceSmartBatch
iceSmartBatchPlan
ProfilePage
check-dr-affiliate-menu
ecs-deploy-talent-fulfillment
灵祺达人履约管理后台/dist
recruitmentPublishLinkMatchCore
videoModelDuration
merchantVideoAiGateway
videoAiApi
qwenVisionApi
qwenVisionCatalog
change-scope-guard
PAT
      ;;
    erp_pay_points)
      cat <<'PAT'
tenantBillingApiMp
tenantPayFlowMp
formatDisplayErrorMp
formatDisplayError
meoo-tenant-billing
meoo-xpay-goods-notify
wechatVirtualPay
authWxLoginShared
erpMpWechatAccess
wechatPayV3
tenantPaymentChannels
subscription/subscription
wallet/wallet
mpRegistryProfileGet
mine-xingxuan-points-recharge
XingxuanPointsRechargePage
aiOpsPlanTypes
aiOpsPlanExport
AiOpsPlanPage
merchantAiOpsPlanCore
ecs-setup-erp-mp-wechat-env
ecs-probe-erp-wechat-native-pay
ecs-probe-erp-wechat-jsapi-ready
ecs-auth-api-server
change-scope-guard
PAT
      ;;
    mp_hall_region)
      cat <<'PAT'
hallRegionLocate
chinaNearestCity
chinaCityCenters
meoo-mp-region-locate
pages/index/index
pages/recommend/recommend
mpPrivacyPageMixin
config.release.js
mpBuild.js
change-scope-guard
PAT
      ;;
    merchant_nav)
      cat <<'PAT'
config/nav.ts
MeooLayout.tsx
change-scope-guard
PAT
      ;;
    partner_record_workshop)
      cat <<'PAT'
config/nav.ts
App.tsx
CourseRecordWorkshopPage
courseRecordWorkshop
change-scope-guard
PAT
      ;;
    ai_points)
      cat <<'PAT'
mpPointsEconomics
erpPointsEconomics
erpAiPointsSpendCore
mpAiPointsSpendCore
mpAiPointsSpendSession
mpAiPointsBuckets
mpMembershipQuota
mpMyUsageDetailsGet
mpAddonPointsSpendClient
mpAiPointsSpendClient
mpPointsSpendApi
mpAddonPointsHints
mpPointsEconomicsMp
erpPointsSpendMp
meooPaymentTiers
tenantMembershipCore
erpAiApiPointsGate
meoo-ai-product-plan
meoo-ai-ops-plan
meoo-ai-agent-image
meoo-mp-recruitment-ai
meoo-mp-recruitment-video-compliance
meoo-mp-recruitment-script-compliance
recruitmentVideoComplianceCore
recruitmentVideoAiCompliance
mine-pr-addon-ai-review
mine-my-orders
meoo-tenant-billing
meoo-ops-mp-auth
mpCompliancePointsGate
partnerXingxuanBilling
mine-pr-addon-shortvideo
mine-pr-addon-digital-human
mpViralBriefAi
SubscriptionPlansPanel
mpMembershipCatalog
opsRegistryTypes
ai-points-pricing
meooRegistryShared
mp-change-blast-radius-check
merchantAdAiPoints
localPromotionGateway
qianchuanGateway
xhsCommercialGateway
merchantApiGatewayCore
merchantAiUpstream
AiImageStudioPage
AiOpsPlanPage
aiOpsPlanApi
change-scope-guard
PAT
      ;;
    mp_order_detail_fast)
      cat <<'PAT'
mpHallRegistryCore
registrySnapshotPgAppend
meoo-ops-mp-auth
opsRegistryTalentMp
subpack-core/detail/detail
灵祺达人履约管理后台/src/lib/mpApi.ts
RecruitmentDetailPage
change-scope-guard
PAT
      ;;
    erp_merchant_mp)
      cat <<'PAT'
灵祺ERP小程序/
upload-erp-mp-static
ecs-sync-erp-mp-static
ecs-meoo-api.nginx
change-scope-guard
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

# 关闭 quotepath，避免中文路径被 octal 转义导致白名单匹配失败
if [[ "$MODE" == "staged" ]]; then
  CHANGED_RAW="$(git -c core.quotepath=false diff --cached --name-only --diff-filter=ACMRT 2>/dev/null || true)"
else
  CHANGED_RAW="$(git -c core.quotepath=false diff --name-only --diff-filter=ACMRT "$AGAINST" 2>/dev/null || true)"
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
  # bash 3.2 + set -u：空数组展开会报 unbound
  if ((${#EXTRA_ALLOW[@]} > 0)); then
    for extra in "${EXTRA_ALLOW[@]}"; do
      [[ -n "$extra" && "$f" == *"$extra"* ]] && return 0
    done
  fi
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
  echo "【越界通知】scope=${SCOPE} — 以下文件不在白名单，禁止修改"
  echo "========================================"
  echo ""
  echo "越界文件:"
  printf '  - %s\n' "${FORBIDDEN[@]}"
  echo ""
  echo "本次允许 scope: ${SCOPE}"
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

echo "OK: scope=${SCOPE}, ${#CHANGED[@]} files in whitelist"
exit 0

