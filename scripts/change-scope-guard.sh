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
  account_pwd_support  改密(短信)+小灵同学双向消息
  support_feishu       飞书双向客服（应用回调+映射表+独立客服台）
  regional_partner     区域服务商（城市代理门户 + 运营台开账号）
  mp_pr_orphan_delete  我的发单 orphan 误删（includePrOwned 空列表剪枝）
  mp_recruit_no_drop   招募单禁止 slice(200) 丢单 + 备份复原
  knowledge_base       知识库（运营全局 + 商家/FWS 租户 + AI 投喂）
  merchant_brief_direct 商家 ERP：Brief 去订单直接生成 + 短视频观感打磨
  merchant_jimeng_studio 商家 ERP：即梦式短视频台（Skill/画布/短片/案例）+ 全站 UI token
  aimodelserver_upstream AiModelServer（api.aimodelserver.com）OpenAI 兼容上游接入
  digital_human_bg     商家 ERP：数字人口播·实景/时长/人像融合
  video_gen_precision  视频生成更准：Brief/Skill槽位/保真校验/全入口门禁（不含 ICE）
  openmontage_local    Cursor 本地 OpenMontage skill + 安装脚本（不含 ERP 成片链路）
  jianying_local       Cursor 本地剪映 skill + 安装脚本（不含 ERP / CapCut 国际版）
  merchant_registry_bootstrap 商家壳注册表瘦身（OpsRegistryBridge slice=ai，缓解 cs/fws/dr 卡顿）
  shop_analysis          商家 ERP：店铺分析（图表/门店筛选/经营建议/逐单 POI）
  merchant_store_info    商家 ERP：店铺信息门店列表（账户门店关系默认全量）
  edition_cs_sync        各端前端对齐 CS（DR/FWS/Admin 同源功能与积分经济）
  ai_agent_quick_image   商家 ERP：AI 智能体快捷任务平铺 + 生图意图自动切模型
  merchant_ai_agent_tax  商家 ERP：AI智能体意图/工具门禁 + 近三月日期 + 一键报税佣金（含构建类型补齐）
  merchant_ai_agent_data 商家 ERP：AI智能体跨页只读取数（评价/线索/投流/订单等摘要注入）
  competitor_industry    商家 ERP：竞争对手分析经营类目读取/门店毛利配置联动
  competitor_baidu_map   商家 ERP：竞品分析接入百度地图周边 POI（服务端 AK）
  map_providers          商家 ERP：地图主副（高德优先 / 百度兜底）竞品+选址
  ops_site_selection     商家 ERP：运营「选址参考」+ 竞品近7日人流热度
  partner_linke_auth     服务商版：林客邀请授权链接拼装/客户商家开通

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
aiImageDelivery
visualStudio
visual_studio
addon_visual_studio
mpVisualStudioAi
meooAgentImageCore
meoo-ai-agent-image
tokenmixImageGenerate
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
App.tsx
partnerEditionConfig.ts
index.html
index.css
ecs-nginx-merchant-cs.conf
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
    account_pwd_support)
      cat <<'PAT'
SupabaseChangePasswordForm
MeooLayout
LoginAuthPanel
meoo-auth-sms-change-password
authSmsAuthShared
tenantRegisterApi
tenantLocalState
ecs-auth-api-server
mpAccountAuth
meoo-ops-mp-auth
mpSupportRelayHandler
mpSupportRelayHttp
FloatingOnlineSupport
support-ops-send
OpsSupportWorkbenchPage
supportOpsHttpApi
loginCredentialsPanel
login-cred-panel
pages/login/login
utils/auth.js
SupportPage
mp-support-relay-e2e-smoke
灵祺达人撮合小程序/
灵祺星选小程序抖音版/
灵祺达人履约管理后台/src/pages/SupportPage
change-scope-guard
PAT
      ;;
    support_feishu)
      cat <<'PAT'
support_feishu
supportFeishu
support-feishu
meoo-support-feishu
supportFeishuAppBridge
supportFeishuNotify
supportOpsSendCore
support-ops-send
support-poll
OpsSupportWorkbenchPage
supportOpsHttpApi
在线客服/
ecs-auth-api-server
ecs-run-auth-api
20260728220000_support_feishu_thread_map
change-scope-guard
PAT
      ;;
    regional_partner)
      cat <<'PAT'
区域服务商/
regional_partners
regionalPartners
RegionalPartner
OpsRegionalPartnersPage
regionalPartnersApi
regionalPartnersBackend
chinaAdminDivisions
meoo-ops-regional-partners
meoo-regional-partner
tenants_register_city
register_city
opsStaffAuth
opsStaffAccountsBackend
opsTenantsMutationsBackend
opsNavConfig
商家管理后台/src/App.tsx
ecs-auth-api-server
ecs-apply-regional-partners
20260726170000_regional_partners
20260726180000_tenants_register_city
20260727100000_tenants_business_license_address
business_license_address
20260728120000_regional_partners_subscription_pricing
subscription_pricing
regionalPartnerPricing
meoo-tenant-subscription-tiers
TenantPayModal
SubscriptionPlansPanel
meoo-tenant-billing
tenantPaymentShared
tenantBillingClient
meooPaymentTiers
change-scope-guard
PAT
      ;;
    mp_pr_orphan_delete)
      cat <<'PAT'
prPublishedOrders
applicationsStore
mpAccountClientSync
mpAccountClientStateMerge
opsRegistryTalentMp
mine-pr-orders
mineProfileStats
PrOrdersPage
PrOrdersScreen
lingqi-xingxuan-app/src/api/registry
lingqi-xingxuan-app/src/lib/applicationsStore
publishedOrders
change-scope-guard
PAT
      ;;
    mp_recruit_no_drop)
      cat <<'PAT'
meoo-ops-mp-recruitment-orders-append
opsRegistryGatewayShared
opsRegistrySupabaseDispatch
registrySnapshotPgAppend
商家管理后台/src/ops/opsRegistrySupabaseDispatch
change-scope-guard
PAT
      ;;
    knowledge_base)
      cat <<'PAT'
knowledge_base
knowledgeBase
KnowledgeBase
OpsKnowledgeBase
meoo-kb
meooAiChatPrepare
opsNavConfig
opsStaffAuth
opsKnowledgeBaseApi
knowledgeBaseTypes
knowledgeBaseApi
KnowledgeBasePage
20260728100000_knowledge_base
ecs-apply-knowledge-base
ecs-auth-api-server
商家管理后台/src/App.tsx
web版/merchant-erp/src/App.tsx
web版/merchant-erp/src/config/nav.ts
change-scope-guard
PAT
      ;;
    merchant_brief_direct)
      cat <<'PAT'
AiOperationContentPage
viralBriefAi
viralBriefCaseLibrary
BriefGenRecords
mpBriefGenRecords
shortVideoGuidanceAi
ShortVideoOptimizationPage
shortVideoProductFocus
change-scope-guard
PAT
      ;;
    merchant_jimeng_studio)
      cat <<'PAT'
ShortVideoOptimizationPage
ShortVideoIceBatchPanel
ShortVideoScriptTableEditor
ShortVideoAgentCabin
ShortVideoCaseGallery
ShortVideoInfiniteCanvas
ShortVideoMusicStudio
shortVideoSkills
shortVideoCaseGallery
shortVideoCaseCdn
shortVideoStudioModes
shortVideoMusicLibrary
shortVideoUiLabels
shortVideoGuidanceAi
shortVideoProductFocus
shortVideoScriptTable
shortVideoPostProcess
shortVideoNarrationExtract
digitalHumanPostProcessStyles
digitalHumanSubtitle
videoAiApi
videoModelDuration
merchantVideoAiGateway
short-video-cases
short-video-bgm
gen-case-seedance
gen-case-content-bgm
gen-case-narration-vo
AiAgentPage
MeooLayout
index.css
merchantEmbedChrome.css
change-scope-guard
PAT
      ;;
    aimodelserver_upstream)
      cat <<'PAT'
aimodelserver
aiVendorCatalogShared
merchantRegistryVendorEnv
meooAiChatPrepare
chatRouter
chatStreamRouter
modelRegistry
agentModelRoute
services/ai/types
change-scope-guard
PAT
      ;;
    digital_human_bg)
      cat <<'PAT'
digitalHumanStoreScenes
DhStep3Extras
DigitalHumanBroadcastPage
digitalHumanBroadcast
digitalHumanVideoRender
digitalHumanBackgroundComposite
digitalHumanSeedancePrompt
digitalHumanPortraitMatting
digitalHumanPostProcessStyles
digitalHumanSubtitle
concatVideoSegments
videoFrameUtils
arkVideoContentPayload
arkVideoModelDiscovery
arkVideoModelRouter
merchantVideoAiGateway
videoAiApi
digitalHumanDouyinLinkCore
digitalHumanTtsApi
dh-seedance-r2v-local-smoke
dh-omnihuman-local-smoke
dhOmniHumanVideoApi
volcVisualSign
volcOmniHumanClient
change-scope-guard
PAT
      ;;
    video_gen_precision)
      cat <<'PAT'
shortVideoGenBrief
preparePreciseVideoGeneration
shortVideoSkills
shortVideoGuidanceAi
shortVideoScriptTable
ShortVideoOptimizationPage
ShortVideoAgentCabin
videoAiApi
DigitalHumanBroadcastPage
digitalHumanVideoRender
digitalHumanSeedancePrompt
AiOperationContentPage
viralBriefAi
shortvideo-ai
videoAiMp
videoGenBrief
mine-pr-addon-shortvideo
mpAddonMerchantApi
change-scope-guard
PAT
      ;;
    openmontage_local)
      cat <<'PAT'
.cursor/skills/openmontage
openmontage-setup
openmontage
tools/OpenMontage
tools/.gitkeep
tools/README
change-scope-guard
.gitignore
PAT
      ;;
    jianying_local)
      cat <<'PAT'
.cursor/skills/jianying-editor
jianying-editor-setup
jianying-editor
jianying-jobs
tools/jianying-editor-skill
tools/jianying-jobs
tools/README
change-scope-guard
.gitignore
PAT
      ;;
    merchant_registry_bootstrap)
      cat <<'PAT'
OpsRegistryBridge
opsRegistryClient
registryTenantIsolation
meoo-ops-sync-registry
meoo-ops-registry-ops-get
opsRegistryGatewayShared
ecs-auth-api-server
change-scope-guard
PAT
      ;;
    shop_analysis)
      cat <<'PAT'
StoreAnalysisPage
merchantOrdersApi
merchantPlatformOrdersCore
shopAnalysisAiCore
shopAnalysisAiPoints
meoo-shop-analysis-summary
meoo-shop-analysis-ai
meoo-merchant-orders
douyinMerchantGateway
merchant_platform_orders_poi
ecs-auth-api-server
erpAiPointsSpendCore
erpAiApiPointsGate
change-scope-guard
PAT
      ;;
    merchant_store_info)
      cat <<'PAT'
StoreInfoPage
merchantStoresApi
douyinMerchantApi
douyinMerchantGateway
change-scope-guard
PAT
      ;;
    competitor_industry)
      cat <<'PAT'
CompetitorAnalysisPage
competitorIndustry
competitorStorage
storeMarginsRead
StoreGrossMarginConfigCard
ProductsPage
tenantStoreIntelCloud
douyinGoodsCategoryPicker
FinancePages
change-scope-guard
PAT
      ;;
    competitor_baidu_map)
      cat <<'PAT'
baiduMapClient
amapMapClient
mapProvidersClient
merchantStoreIntelCore
meoo-competitor-analysis
CompetitorAnalysisPage
storeIntelApi
competitorStorage
change-scope-guard
PAT
      ;;
    map_providers)
      cat <<'PAT'
amapMapClient
mapProvidersClient
baiduMapClient
merchantStoreIntelCore
siteSelectionCore
siteSelectionHeat
meoo-competitor-analysis
meoo-site-selection
CompetitorAnalysisPage
storeIntelApi
competitorStorage
change-scope-guard
PAT
      ;;
    ops_site_selection)
      cat <<'PAT'
baiduMapClient
amapMapClient
mapProvidersClient
siteSelectionHeat
siteSelectionCore
meoo-site-selection
merchantStoreIntelCore
merchantApiMock
ecs-auth-api-server
SiteSelectionPage
SiteSelectionHeatMap
SiteSelectionScoreCard
FootTrafficHeatPanel
CompetitorAnalysisPage
storeIntelApi
competitorStorage
nav.ts
App.tsx
membershipPlan
partnerEditionConfig
change-scope-guard
PAT
      ;;
    partner_linke_auth)
      cat <<'PAT'
partnerLinkeOnboardCore
partnerLinkeSolutionOptions
PartnerClientsSection
douyinPartnerBindGuideConfig
partnerLinkeOnboardClient
meoo-partner-linke-onboard
change-scope-guard
PAT
      ;;
    edition_cs_sync)
      cat <<'PAT'
XingxuanPointsRechargePage
mpPointsEconomics
OpsMpLibraryPermissionPage
ecs-deploy-dr-web-local-build
ecs-deploy-talent-fulfillment
ecs-new-ecs-local-build-only
deploy-targets
灵祺达人履约管理后台/.gitignore
灵祺达人履约管理后台/dist
change-scope-guard
PAT
      ;;
    ai_agent_quick_image)
      cat <<'PAT'
AiAgentPage
AiAgentDrawer
AiAgentComposerBar
aiImageIntentRouting
agentImageModelKeys
agentModelRoute
AiAgentContext
aiAgentPlan
aiAgentSoftScenarioConfirm
aiAgentScenarioWorkflows
agentMerchantIntelLoader
geoScoresFromDouyinRows
mpPointsEconomics
merchantIndustryAlign
agentMerchantContext
services/ai/types
change-scope-guard
PAT
      ;;
    merchant_ai_agent_tax)
      cat <<'PAT'
AiAgentContext
aiAgentActionParse
aiAgentSystemPromptRoute
aiAgentTools
aiAgentScenarioWorkflows
agentMerchantContext
agentBusinessMetricsFetch
agentPageDataLoaders
aiAgentTaxFilingPreview
platformIndustryCommission
taxFiling
FinancePages
financeCommissionRatesApi
platformCommissionRateGateway
meoo-finance-commission-rates
douyinMerchantGateway
merchantApiGatewayCore
opsRegistryTypes
mpMembershipPromoClaimMutations
change-scope-guard
PAT
      ;;
    merchant_ai_agent_data)
      cat <<'PAT'
AiAgentContext
aiAgentTools
aiAgentSystemPromptRoute
agentMerchantContext
agentMerchantIntelLoader
agentBusinessMetricsFetch
agentPageDataLoaders
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
  echo "OK: scope=${SCOPE}, no pending changes"
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

