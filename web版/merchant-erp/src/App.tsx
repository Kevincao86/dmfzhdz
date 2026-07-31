import { lazy, Suspense } from 'react'
import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom'
import { AiAgentProvider } from './context/AiAgentContext'
import { PartnerClientProvider } from './context/PartnerClientContext'
import { PartnerTenantProvider, usePartnerTenant } from './context/PartnerTenantContext'
import { MembershipProvider } from './context/MembershipContext'
import RequireMembershipFeature from './components/RequireMembershipFeature'
import MembershipPlanSync from './components/MembershipPlanSync'
import MeooLayout from './components/MeooLayout'
import RequireSupabaseAuth from './components/RequireSupabaseAuth'
import LandingPage from './pages/LandingPage'
import LoginPage from './pages/LoginPage'
import { XINGXUAN_PARTNER_NAV } from './config/xingxuanPartnerNav'
import { isPartnerEdition } from './lib/appEdition'

/** 重页面按路由拆包：避免 3.7MB 主包拖成两分钟白屏 */
const AiAgentPage = lazy(() => import('./pages/AiAgentPage'))
const AiImageStudioPage = lazy(() => import('./pages/AiImageStudioPage'))
const AiOperationContentPage = lazy(() => import('./pages/AiOperationContentPage'))
const BriefContentShell = lazy(() => import('./pages/BriefContentShell'))
const BriefGenRecordsPage = lazy(() => import('./pages/BriefGenRecordsPage'))
const DigitalHumanBroadcastPage = lazy(() => import('./pages/DigitalHumanBroadcastPage'))
const ShortVideoOptimizationPage = lazy(() => import('./pages/ShortVideoOptimizationPage'))
const FinanceReconcilePage = lazy(() =>
  import('./pages/FinancePages').then((m) => ({ default: m.FinanceReconcilePage })),
)
const FinanceTaxPage = lazy(() =>
  import('./pages/FinancePages').then((m) => ({ default: m.FinanceTaxPage })),
)
const PartnerAgentSettlementPage = lazy(() => import('./pages/finance/PartnerAgentSettlementPage'))
const GeoPage = lazy(() => import('./pages/GeoPage'))
const HomeDashboard = lazy(() => import('./pages/HomeDashboard'))
const ActivityCenterPage = lazy(() => import('./pages/ActivityCenterPage'))
const ReviewsManagementPage = lazy(() => import('./pages/ReviewsManagementPage'))
const StoreDecorationPage = lazy(() => import('./pages/StoreDecorationPage'))
const StoreDetailPage = lazy(() => import('./pages/StoreDetailPage'))
const StoreInfoPage = lazy(() => import('./pages/StoreInfoPage'))
const StoreMenuPage = lazy(() => import('./pages/StoreMenuPage'))
const CompetitorAnalysisPage = lazy(() => import('./pages/CompetitorAnalysisPage'))
const AiOpsPlanPage = lazy(() => import('./pages/AiOpsPlanPage'))
const ProductCreateFlowPage = lazy(() => import('./pages/ProductCreateFlowPage'))
const ProductEditFlowPage = lazy(() => import('./pages/ProductEditFlowPage'))
const ProductsPage = lazy(() => import('./pages/ProductsPage'))
const ProductsViewPage = lazy(() => import('./pages/ProductsViewPage'))
const RecruitmentPage = lazy(() => import('./pages/RecruitmentPage'))
const XingxuanPartnerShell = lazy(() =>
  import('./pages/partner/XingxuanPartnerShell').then((m) => ({ default: m.XingxuanPartnerShell })),
)
const XingxuanPartnerRoutePage = lazy(() =>
  import('./pages/partner/XingxuanPartnerShell').then((m) => ({
    default: m.XingxuanPartnerRoutePage,
  })),
)
const SettingsPage = lazy(() => import('./pages/SettingsPage'))
const LocalPromotionAdvertisingPage = lazy(() => import('./pages/LocalPromotionAdvertisingPage'))
const LocalPromotionLeadsPage = lazy(() => import('./pages/LocalPromotionLeadsPage'))
const WalletPage = lazy(() => import('./pages/WalletPage'))
const AffiliateApplyPage = lazy(() => import('./pages/AffiliateApplyPage'))
const AffiliatePortalPage = lazy(() => import('./pages/AffiliatePortalPage'))
const PartnerSalespersonPortalPage = lazy(() => import('./pages/PartnerSalespersonPortalPage'))
const ErpDyOAuthCallbackPage = lazy(() => import('./pages/login/ErpDyOAuthCallbackPage'))
const HelpManualPage = lazy(() => import('./pages/HelpManualPage'))
const KnowledgeBasePage = lazy(() => import('./pages/KnowledgeBasePage'))
const TeamIntroPage = lazy(() => import('./pages/TeamIntroPage'))
const LegalDocPage = lazy(() => import('./pages/legal/LegalDocPage'))

function portalEdition() {
  return isPartnerEdition() ? ('partner' as const) : ('merchant' as const)
}

function PageFallback() {
  return (
    <div className="flex min-h-[50vh] items-center justify-center bg-[#f7f8fa] text-sm text-zinc-500">
      页面加载中…
    </div>
  )
}

/** 录播工坊：服务商版已隐藏，直链也跳转走 */
function PartnerRecordWorkshopRoute() {
  if (isPartnerEdition()) return <Navigate to="/ai-image" replace />
  return <Navigate to="/operation/ai-ops-plan" replace />
}

function PartnerRecruitmentRoute() {
  if (isPartnerEdition()) return <Navigate to="/recruitment/xingxuan/hall" replace />
  return <RecruitmentPage />
}

function PartnerAgentSettlementRoute() {
  const { profile } = usePartnerTenant()
  if (!isPartnerEdition() || !profile.isParent) return <Navigate to="/finance" replace />
  return <PartnerAgentSettlementPage />
}

export default function App() {
  const pubEdition = portalEdition()
  return (
    <BrowserRouter>
      <MembershipProvider>
        <PartnerTenantProvider>
          <PartnerClientProvider>
            <AiAgentProvider>
              <Suspense fallback={<PageFallback />}>
                <Routes>
                  <Route path="/" element={<LandingPage />} />
                  <Route path="/login" element={<LoginPage />} />
                  <Route path="/register" element={<LoginPage initialMode="register" />} />
                  <Route path="/affiliate/apply" element={<AffiliateApplyPage />} />
                  <Route path="/affiliate/portal" element={<AffiliatePortalPage />} />
                  <Route path="/partner/salesperson-portal" element={<PartnerSalespersonPortalPage />} />
                  <Route path="/login/dy-oauth" element={<ErpDyOAuthCallbackPage />} />
                  <Route path="/help" element={<HelpManualPage edition={pubEdition} />} />
                  <Route path="/help/:articleId" element={<HelpManualPage edition={pubEdition} />} />
                  <Route path="/team" element={<TeamIntroPage edition={pubEdition} />} />
                  <Route
                    path="/legal/privacy"
                    element={<LegalDocPage edition={pubEdition} doc="privacy" />}
                  />
                  <Route
                    path="/legal/aup"
                    element={<LegalDocPage edition={pubEdition} doc="aup" />}
                  />
                  <Route
                    element={
                      <RequireSupabaseAuth>
                        <RequireMembershipFeature>
                          <MembershipPlanSync />
                          <MeooLayout />
                        </RequireMembershipFeature>
                      </RequireSupabaseAuth>
                    }
                  >
                    <Route path="/home" element={<HomeDashboard />} />
                    <Route path="ai-agent" element={<AiAgentPage />} />
                    <Route path="knowledge-base" element={<KnowledgeBasePage />} />
                    <Route path="store" element={<Navigate to="/store/info" replace />} />
                    <Route path="store/info" element={<StoreInfoPage />} />
                    <Route path="store/menu" element={<StoreMenuPage />} />
                    <Route path="store/detail/:platform/:poiId" element={<StoreDetailPage />} />
                    <Route path="store/decoration" element={<StoreDecorationPage />} />
                    <Route path="products" element={<ProductsPage />} />
                    <Route path="products/create" element={<ProductCreateFlowPage />} />
                    <Route path="products/list" element={<ProductsViewPage />} />
                    <Route
                      path="products/edit/:platform/:productId"
                      element={<ProductEditFlowPage />}
                    />
                    <Route path="products/view" element={<Navigate to="/products/list" replace />} />
                    <Route path="operation" element={<Navigate to="/reviews" replace />} />
                    <Route path="recruitment" element={<PartnerRecruitmentRoute />} />
                    <Route path="recruitment/xingxuan" element={<XingxuanPartnerShell />}>
                      {XINGXUAN_PARTNER_NAV.map((item) => (
                        <Route
                          key={item.path}
                          path={item.path.replace('/recruitment/xingxuan/', '')}
                          element={<XingxuanPartnerRoutePage iframePath={item.iframePath} />}
                        />
                      ))}
                    </Route>
                    <Route path="activity" element={<ActivityCenterPage />} />
                    <Route path="reviews" element={<ReviewsManagementPage />} />
                    <Route
                      path="reviews/store"
                      element={<Navigate to="/reviews?kind=store" replace />}
                    />
                    <Route
                      path="reviews/product"
                      element={<Navigate to="/reviews?kind=product" replace />}
                    />
                    <Route path="geo" element={<GeoPage />} />
                    <Route path="operation/competitors" element={<CompetitorAnalysisPage />} />
                    <Route path="operation/ai-ops-plan" element={<AiOpsPlanPage />} />
                    <Route path="ai-create/record-workshop" element={<PartnerRecordWorkshopRoute />} />
                    <Route path="ai-image" element={<AiImageStudioPage />} />
                    <Route
                      path="ai-operation/article"
                      element={<Navigate to="/ai-operation/content" replace />}
                    />
                    <Route
                      path="ai-operation/topic"
                      element={<Navigate to="/ai-operation/content" replace />}
                    />
                    <Route path="ai-operation/content" element={<BriefContentShell />}>
                      <Route index element={<AiOperationContentPage />} />
                      <Route path="records" element={<BriefGenRecordsPage />} />
                    </Route>
                    <Route path="ai-operation/video-check" element={<ShortVideoOptimizationPage />} />
                    <Route
                      path="ai-operation/digital-human"
                      element={<DigitalHumanBroadcastPage />}
                    />
                    <Route path="advertising" element={<LocalPromotionAdvertisingPage />} />
                    <Route path="leads" element={<LocalPromotionLeadsPage />} />
                    <Route path="finance" element={<FinanceReconcilePage />} />
                    <Route path="finance/tax" element={<FinanceTaxPage />} />
                    <Route path="finance/agent-settlement" element={<PartnerAgentSettlementRoute />} />
                    <Route path="settings" element={<SettingsPage />} />
                    <Route path="wallet" element={<WalletPage />} />
                  </Route>

                  <Route path="*" element={<Navigate to="/" replace />} />
                </Routes>
              </Suspense>
            </AiAgentProvider>
          </PartnerClientProvider>
        </PartnerTenantProvider>
      </MembershipProvider>
    </BrowserRouter>
  )
}
