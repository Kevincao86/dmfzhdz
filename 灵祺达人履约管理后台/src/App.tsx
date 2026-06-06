import type { ReactNode } from 'react'
import { Navigate, Route, Routes } from 'react-router-dom'
import AppShell from './components/AppShell'
import LandingPage from './pages/LandingPage'
import LoginPage from './pages/LoginPage'
import RegisterPage from './pages/RegisterPage'
import HallPage from './pages/HallPage'
import OrdersPage from './pages/OrdersPage'
import MessagesPage from './pages/MessagesPage'
import ChatPage from './pages/ChatPage'
import ProfilePage from './pages/ProfilePage'
import TalentProfilePage from './pages/TalentProfilePage'
import SupplierProfilePage from './pages/SupplierProfilePage'
import PrProfilePage from './pages/PrProfilePage'
import PrOrderApplicantsPage from './pages/PrOrderApplicantsPage'
import RecruitmentDetailPage from './pages/RecruitmentDetailPage'
import RecruitmentApplyPage from './pages/RecruitmentApplyPage'
import PublishPage from './pages/PublishPage'
import TemplatesPage from './pages/TemplatesPage'
import TemplateEditPage from './pages/TemplateEditPage'
import MerchantEmbedShell from './merchant/MerchantEmbedShell'
import {
  AiContentAddonPage,
  DigitalHumanAddonPage,
  ShortVideoAddonPage,
} from './merchant/embedPages'
import { getToken } from './lib/mpSession'

function RequireAuth({ children }: { children: ReactNode }) {
  if (!getToken()) return <Navigate to="/" replace />
  return <>{children}</>
}

function RootRedirect() {
  if (getToken()) return <Navigate to="/hall" replace />
  return <Navigate to="/" replace />
}

export default function App() {
  return (
    <Routes>
      <Route path="/" element={<LandingPage />} />
      <Route path="/login" element={<LoginPage />} />
      <Route path="/register" element={<RegisterPage />} />
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
        <Route path="/recommend-talent" element={<Navigate to="/hall?tab=recommend" replace />} />
        <Route path="/publish" element={<PublishPage />} />
        <Route path="/templates" element={<TemplatesPage />} />
        <Route path="/templates/edit" element={<TemplateEditPage />} />
        <Route path="/orders" element={<OrdersPage />} />
        <Route path="/orders/:id/applicants" element={<PrOrderApplicantsPage />} />
        <Route path="/messages" element={<MessagesPage />} />
        <Route path="/chat" element={<ChatPage />} />
        <Route path="/profile" element={<ProfilePage />} />
        <Route path="/profile/talent" element={<TalentProfilePage />} />
        <Route path="/profile/supplier" element={<SupplierProfilePage />} />
        <Route path="/profile/pr" element={<PrProfilePage />} />
        <Route path="/addons" element={<MerchantEmbedShell />}>
          <Route index element={<Navigate to="/addons/shortvideo" replace />} />
          <Route path="shortvideo" element={<ShortVideoAddonPage />} />
          <Route path="ai-content" element={<AiContentAddonPage />} />
          <Route path="digital-human" element={<DigitalHumanAddonPage />} />
        </Route>
      </Route>
      <Route path="*" element={<RootRedirect />} />
    </Routes>
  )
}
