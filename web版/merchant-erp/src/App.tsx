import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom'
import type { ReactNode } from 'react'
import { AiAgentProvider } from './context/AiAgentContext'
import { PartnerClientProvider } from './context/PartnerClientContext'
import { PartnerTenantProvider, usePartnerTenant } from './context/PartnerTenantContext'
import { MembershipProvider } from './context/MembershipContext'
import RequireMembershipFeature from './components/RequireMembershipFeature'
import MembershipPlanSync from './components/MembershipPlanSync'
import MeooLayout from './components/MeooLayout'
import RequireSupabaseAuth from './components/RequireSupabaseAuth'
import AiAgentPage from './pages/AiAgentPage'
import AiImageStudioPage from './pages/AiImageStudioPage'
import AiOperationContentPage from './pages/AiOperationContentPage'
import BriefContentShell from './pages/BriefContentShell'
import BriefGenRecordsPage from './pages/BriefGenRecordsPage'
import DigitalHumanBroadcastPage from './pages/DigitalHumanBroadcastPage'
import ShortVideoOptimizationPage from './pages/ShortVideoOptimizationPage'
import { FinanceReconcilePage, FinanceTaxPage } from './pages/FinancePages'
import PartnerAgentSettlementPage from './pages/finance/PartnerAgentSettlementPage'
import GeoPage from './pages/GeoPage'
import HomeDashboard from './pages/HomeDashboard'
import ActivityCenterPage from './pages/ActivityCenterPage'
import ReviewsManagementPage from './pages/ReviewsManagementPage'
import StoreDecorationPage from './pages/StoreDecorationPage'
import StoreDetailPage from './pages/StoreDetailPage'
import StoreInfoPage from './pages/StoreInfoPage'
import StoreMenuPage from './pages/StoreMenuPage'
import CompetitorAnalysisPage from './pages/CompetitorAnalysisPage'
import AiOpsPlanPage from './pages/AiOpsPlanPage'
import CourseRecordWorkshopPage from './pages/CourseRecordWorkshopPage'
import ProductCreateFlowPage from './pages/ProductCreateFlowPage'
import ProductEditFlowPage from './pages/ProductEditFlowPage'
import ProductsPage from './pages/ProductsPage'
import ProductsViewPage from './pages/ProductsViewPage'
import RecruitmentPage from './pages/RecruitmentPage'
import { XingxuanPartnerRoutePage, XingxuanPartnerShell } from './pages/partner/XingxuanPartnerShell'
import { XINGXUAN_PARTNER_NAV } from './config/xingxuanPartnerNav'
import SettingsPage from './pages/SettingsPage'
import LocalPromotionAdvertisingPage from './pages/LocalPromotionAdvertisingPage'
import LocalPromotionLeadsPage from './pages/LocalPromotionLeadsPage'
import WalletPage from './pages/WalletPage'
import LandingPage from './pages/LandingPage'
import AffiliateApplyPage from './pages/AffiliateApplyPage'
import AffiliatePortalPage from './pages/AffiliatePortalPage'
import PartnerSalespersonPortalPage from './pages/PartnerSalespersonPortalPage'
import LoginPage from './pages/LoginPage'
import ErpDyOAuthCallbackPage from './pages/login/ErpDyOAuthCallbackPage'
import HelpManualPage from './pages/HelpManualPage'
import TeamIntroPage from './pages/TeamIntroPage'
import LegalDocPage from './pages/legal/LegalDocPage'
import { isPartnerEdition } from './lib/appEdition'

function portalEdition() {
  return isPartnerEdition() ? ('partner' as const) : ('merchant' as const)
}

function MerchantOnlyAiOperationRoute({ children }: { children: ReactNode }) {
  if (isPartnerEdition()) return <Navigate to="/recruitment/xingxuan/hall" replace />
  return <>{children}</>
}

/** 录播工坊：仅服务商 AI 创作入口 */
function PartnerRecordWorkshopRoute() {
  if (!isPartnerEdition()) return <Navigate to="/operation/ai-ops-plan" replace />
  return <CourseRecordWorkshopPage />
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
        <Route path="/legal/privacy" element={<LegalDocPage edition={pubEdition} doc="privacy" />} />
        <Route path="/legal/aup" element={<LegalDocPage edition={pubEdition} doc="aup" />} />
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
          <Route path="store" element={<Navigate to="/store/info" replace />} />
          <Route path="store/info" element={<StoreInfoPage />} />
          <Route path="store/menu" element={<StoreMenuPage />} />
          <Route path="store/detail/:platform/:poiId" element={<StoreDetailPage />} />
          <Route path="store/decoration" element={<StoreDecorationPage />} />
          <Route path="products" element={<ProductsPage />} />
          <Route path="products/create" element={<ProductCreateFlowPage />} />
          <Route path="products/list" element={<ProductsViewPage />} />
          <Route path="products/edit/:platform/:productId" element={<ProductEditFlowPage />} />
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
          <Route path="reviews/store" element={<Navigate to="/reviews?kind=store" replace />} />
          <Route path="reviews/product" element={<Navigate to="/reviews?kind=product" replace />} />
          <Route path="geo" element={<GeoPage />} />
          <Route path="operation/competitors" element={<CompetitorAnalysisPage />} />
          <Route path="operation/ai-ops-plan" element={<AiOpsPlanPage />} />
          <Route path="ai-create/record-workshop" element={<PartnerRecordWorkshopRoute />} />
          <Route path="ai-image" element={<AiImageStudioPage />} />
          <Route
            path="ai-operation/article"
            element={
              <MerchantOnlyAiOperationRoute>
                <Navigate to="/ai-operation/content" replace />
              </MerchantOnlyAiOperationRoute>
            }
          />
          <Route
            path="ai-operation/topic"
            element={
              <MerchantOnlyAiOperationRoute>
                <Navigate to="/ai-operation/content" replace />
              </MerchantOnlyAiOperationRoute>
            }
          />
          <Route
            path="ai-operation/content"
            element={
              <MerchantOnlyAiOperationRoute>
                <BriefContentShell />
              </MerchantOnlyAiOperationRoute>
            }
          >
            <Route index element={<AiOperationContentPage />} />
            <Route path="records" element={<BriefGenRecordsPage />} />
          </Route>
          <Route
            path="ai-operation/video-check"
            element={
              <MerchantOnlyAiOperationRoute>
                <ShortVideoOptimizationPage />
              </MerchantOnlyAiOperationRoute>
            }
          />
          <Route
            path="ai-operation/digital-human"
            element={
              <MerchantOnlyAiOperationRoute>
                <DigitalHumanBroadcastPage />
              </MerchantOnlyAiOperationRoute>
            }
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
      </AiAgentProvider>
      </PartnerClientProvider>
      </PartnerTenantProvider>
      </MembershipProvider>
    </BrowserRouter>
  )
}
