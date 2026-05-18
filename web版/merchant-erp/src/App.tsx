import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom'
import { AiAgentProvider } from './context/AiAgentContext'
import MeooLayout from './components/MeooLayout'
import RequireSupabaseAuth from './components/RequireSupabaseAuth'
import AiAgentPage from './pages/AiAgentPage'
import AiOperationContentPage from './pages/AiOperationContentPage'
import ShortVideoOptimizationPage from './pages/ShortVideoOptimizationPage'
import { FinanceReconcilePage, FinanceTaxPage } from './pages/FinancePages'
import GeoPage from './pages/GeoPage'
import HomeDashboard from './pages/HomeDashboard'
import ActivityCenterPage from './pages/ActivityCenterPage'
import ModulePage from './pages/ModulePage'
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
import WalletPage from './pages/WalletPage'
import LoginPage from './pages/LoginPage'

export default function App() {
  return (
    <BrowserRouter>
      <AiAgentProvider>
        <Routes>
        <Route path="/login" element={<LoginPage />} />
        <Route
          path="/"
          element={
            <RequireSupabaseAuth>
              <MeooLayout />
            </RequireSupabaseAuth>
          }
        >
          <Route index element={<HomeDashboard />} />
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
          <Route path="geo" element={<GeoPage />} />
          <Route path="operation/competitors" element={<CompetitorAnalysisPage />} />
          <Route path="ai-operation/article" element={<Navigate to="/ai-operation/content" replace />} />
          <Route path="ai-operation/topic" element={<Navigate to="/ai-operation/content" replace />} />
          <Route path="ai-operation/content" element={<AiOperationContentPage />} />
          <Route path="ai-operation/video-check" element={<ShortVideoOptimizationPage />} />
          <Route
            path="ai-operation/live-check"
            element={
              <ModulePage title="直播间分析" subtitle="直播间流量与转化诊断" />
            }
          />
          <Route
            path="operation/platform-target"
            element={
              <ModulePage title="平台签框" subtitle="各平台签约目标与完成进度" />
            }
          />
          <Route
            path="advertising"
            element={
              <ModulePage title="投流" subtitle="创建和管理广告投放计划" />
            }
          />
          <Route
            path="leads"
            element={
              <ModulePage title="线索" subtitle="线索分配、跟进与转化统计" />
            }
          />
          <Route path="finance" element={<FinanceReconcilePage />} />
          <Route path="finance/tax" element={<FinanceTaxPage />} />
          <Route path="settings" element={<SettingsPage />} />
          <Route path="wallet" element={<WalletPage />} />
        </Route>

        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
      </AiAgentProvider>
    </BrowserRouter>
  )
}
