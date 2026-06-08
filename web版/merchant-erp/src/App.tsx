import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom'
import { AiAgentProvider } from './context/AiAgentContext'
import { PartnerClientProvider } from './context/PartnerClientContext'
import { MembershipProvider } from './context/MembershipContext'
import RequireMembershipFeature from './components/RequireMembershipFeature'
import MembershipPlanSync from './components/MembershipPlanSync'
import MeooLayout from './components/MeooLayout'
import RequireSupabaseAuth from './components/RequireSupabaseAuth'
import AiAgentPage from './pages/AiAgentPage'
import AiOperationContentPage from './pages/AiOperationContentPage'
import DigitalHumanBroadcastPage from './pages/DigitalHumanBroadcastPage'
import ShortVideoOptimizationPage from './pages/ShortVideoOptimizationPage'
import { FinanceReconcilePage, FinanceTaxPage } from './pages/FinancePages'
import GeoPage from './pages/GeoPage'
import HomeDashboard from './pages/HomeDashboard'
import ActivityCenterPage from './pages/ActivityCenterPage'
import ReviewsManagementPage from './pages/ReviewsManagementPage'
import StoreDecorationPage from './pages/StoreDecorationPage'
import StoreDetailPage from './pages/StoreDetailPage'
import StoreInfoPage from './pages/StoreInfoPage'
import StoreMenuPage from './pages/StoreMenuPage'
import CompetitorAnalysisPage from './pages/CompetitorAnalysisPage'
import ProductCreateFlowPage from './pages/ProductCreateFlowPage'
import ProductEditFlowPage from './pages/ProductEditFlowPage'
import ProductsPage from './pages/ProductsPage'
import ProductsViewPage from './pages/ProductsViewPage'
import RecruitmentPage from './pages/RecruitmentPage'
import SettingsPage from './pages/SettingsPage'
import LocalPromotionAdvertisingPage from './pages/LocalPromotionAdvertisingPage'
import LocalPromotionLeadsPage from './pages/LocalPromotionLeadsPage'
import WalletPage from './pages/WalletPage'
import LandingPage from './pages/LandingPage'
import LoginPage from './pages/LoginPage'
import HelpManualPage from './pages/HelpManualPage'
import TeamIntroPage from './pages/TeamIntroPage'
import LegalDocPage from './pages/legal/LegalDocPage'
import { isPartnerEdition } from './lib/appEdition'

function portalEdition() {
  return isPartnerEdition() ? ('partner' as const) : ('merchant' as const)
}

export default function App() {
  const pubEdition = portalEdition()
  return (
    <BrowserRouter>
      <MembershipProvider>
      <PartnerClientProvider>
      <AiAgentProvider>
        <Routes>
        <Route path="/" element={<LandingPage />} />
        <Route path="/login" element={<LoginPage />} />
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
          <Route path="recruitment" element={<RecruitmentPage />} />
          <Route path="activity" element={<ActivityCenterPage />} />
          <Route path="reviews" element={<ReviewsManagementPage />} />
          <Route path="reviews/store" element={<Navigate to="/reviews?kind=store" replace />} />
          <Route path="reviews/product" element={<Navigate to="/reviews?kind=product" replace />} />
          <Route path="geo" element={<GeoPage />} />
          <Route path="operation/competitors" element={<CompetitorAnalysisPage />} />
          <Route path="ai-operation/article" element={<Navigate to="/ai-operation/content" replace />} />
          <Route path="ai-operation/topic" element={<Navigate to="/ai-operation/content" replace />} />
          <Route path="ai-operation/content" element={<AiOperationContentPage />} />
          <Route path="ai-operation/video-check" element={<ShortVideoOptimizationPage />} />
          <Route path="ai-operation/digital-human" element={<DigitalHumanBroadcastPage />} />
          <Route path="advertising" element={<LocalPromotionAdvertisingPage />} />
          <Route path="leads" element={<LocalPromotionLeadsPage />} />
          <Route path="finance" element={<FinanceReconcilePage />} />
          <Route path="finance/tax" element={<FinanceTaxPage />} />
          <Route path="settings" element={<SettingsPage />} />
          <Route path="wallet" element={<WalletPage />} />
        </Route>

        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
      </AiAgentProvider>
      </PartnerClientProvider>
      </MembershipProvider>
    </BrowserRouter>
  )
}
