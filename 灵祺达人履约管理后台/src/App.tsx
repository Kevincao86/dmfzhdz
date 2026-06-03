import type { ReactNode } from 'react'
import { Navigate, Route, Routes } from 'react-router-dom'
import AppShell from './components/AppShell'
import LoginPage from './pages/LoginPage'
import HallPage from './pages/HallPage'
import OrdersPage from './pages/OrdersPage'
import RecommendTalentPage from './pages/RecommendTalentPage'
import MessagesPage from './pages/MessagesPage'
import ProfilePage from './pages/ProfilePage'
import TalentProfilePage from './pages/TalentProfilePage'
import PrProfilePage from './pages/PrProfilePage'
import RecruitmentDetailPage from './pages/RecruitmentDetailPage'
import RecruitmentApplyPage from './pages/RecruitmentApplyPage'
import PublishPage from './pages/PublishPage'
import TemplatesPage from './pages/TemplatesPage'
import TemplateEditPage from './pages/TemplateEditPage'
import MerchantEmbedShell from './merchant/MerchantEmbedShell'
import ShortVideoPage from './pages/merchant/ShortVideoPage'
import AiContentPage from './pages/merchant/AiContentPage'
import DigitalHumanPage from './pages/merchant/DigitalHumanPage'
import { getToken } from './lib/mpSession'

function RequireAuth({ children }: { children: ReactNode }) {
  if (!getToken()) return <Navigate to="/login" replace />
  return <>{children}</>
}

export default function App() {
  return (
    <Routes>
      <Route path="/login" element={<LoginPage />} />
      <Route
        element={
          <RequireAuth>
            <AppShell />
          </RequireAuth>
        }
      >
        <Route path="/hall" element={<HallPage />} />
        <Route path="/recruitment/:id" element={<RecruitmentDetailPage />} />
        <Route path="/recruitment/:id/apply" element={<RecruitmentApplyPage />} />
        <Route path="/recommend-talent" element={<RecommendTalentPage />} />
        <Route path="/publish" element={<PublishPage />} />
        <Route path="/templates" element={<TemplatesPage />} />
        <Route path="/templates/edit" element={<TemplateEditPage />} />
        <Route path="/orders" element={<OrdersPage />} />
        <Route path="/messages" element={<MessagesPage />} />
        <Route path="/profile" element={<ProfilePage />} />
        <Route path="/profile/talent" element={<TalentProfilePage />} />
        <Route path="/profile/pr" element={<PrProfilePage />} />
        <Route path="/addons" element={<MerchantEmbedShell />}>
          <Route index element={<Navigate to="/addons/shortvideo" replace />} />
          <Route path="shortvideo" element={<ShortVideoPage />} />
          <Route path="ai-content" element={<AiContentPage />} />
          <Route path="digital-human" element={<DigitalHumanPage />} />
        </Route>
      </Route>
      <Route path="*" element={<Navigate to="/hall" replace />} />
    </Routes>
  )
}
