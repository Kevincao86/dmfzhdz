import type { ReactNode } from 'react'
import { Navigate, Route, Routes } from 'react-router-dom'
import HelpManualPage from '@merchant/pages/HelpManualPage'
import TeamIntroPage from '@merchant/pages/TeamIntroPage'
import LegalDocPage from '@merchant/pages/legal/LegalDocPage'
import AppShell from './components/AppShell'
import LandingPage from './pages/LandingPage'
import LoginPage from './pages/LoginPage'
import RegisterPage from './pages/RegisterPage'
import HallPage from './pages/HallPage'
import OrdersPage from './pages/OrdersPage'
import MessagesPage from './pages/MessagesPage'
import ChatPage from './pages/ChatPage'
import ProfilePage from './pages/ProfilePage'
import FavoritesPage from './pages/FavoritesPage'
import AnalyticsPage from './pages/AnalyticsPage'
import SupportPage from './pages/SupportPage'
import TalentProfilePage from './pages/TalentProfilePage'
import SupplierProfilePage from './pages/SupplierProfilePage'
import PrDouyinLinkePage from './pages/PrDouyinLinkePage'
import PrProfilePage from './pages/PrProfilePage'
import PrOrderApplicantsPage from './pages/PrOrderApplicantsPage'
import PrOrderSchedulePage from './pages/PrOrderSchedulePage'
import PrOrderScheduleSuccessPage from './pages/PrOrderScheduleSuccessPage'
import PrOrderVideoReviewPage from './pages/PrOrderVideoReviewPage'
import PublicPrInfoPage from './pages/PublicPrInfoPage'
import RecruitmentDetailPage from './pages/RecruitmentDetailPage'
import RecruitmentApplyPage from './pages/RecruitmentApplyPage'
import PublishPage from './pages/PublishPage'
import TemplatesPage from './pages/TemplatesPage'
import TemplateEditPage from './pages/TemplateEditPage'
import FormRelayPage from './pages/FormRelayPage'
import FormRelayGroupQrPage from './pages/FormRelayGroupQrPage'
import MerchantEmbedShell from './merchant/MerchantEmbedShell'
import {
  AiContentAddonPage,
  DigitalHumanAddonPage,
  ShortVideoAddonPage,
} from './merchant/embedPages'
import { MP_ADDONS_NAV_VISIBLE } from './lib/addonAccess'
import { getToken } from './lib/mpSession'

function RequireAuth({ children }: { children: ReactNode }) {
  if (!getToken()) return <Navigate to="/" replace />
  return <>{children}</>
}

function RootRedirect() {
  if (getToken()) return <Navigate to="/hall?tab=hall" replace />
  return <Navigate to="/" replace />
}

export default function App() {
  return (
    <Routes>
      <Route path="/" element={<LandingPage />} />
      <Route path="/login" element={<LoginPage />} />
      <Route path="/register" element={<RegisterPage />} />
      <Route path="/help" element={<HelpManualPage edition="fulfillment" />} />
      <Route path="/help/:articleId" element={<HelpManualPage edition="fulfillment" />} />
      <Route path="/team" element={<TeamIntroPage edition="fulfillment" />} />
      <Route path="/legal/privacy" element={<LegalDocPage edition="fulfillment" doc="privacy" />} />
      <Route path="/legal/aup" element={<LegalDocPage edition="fulfillment" doc="aup" />} />
      <Route path="/pr-info/:orderId" element={<PublicPrInfoPage />} />
      <Route
        element={
          <RequireAuth>
            <AppShell />
          </RequireAuth>
        }
      >
        <Route path="/hall" element={<HallPage />} />
        <Route path="/recruitment/:id" element={<RecruitmentDetailPage />} />
        <Route path="/recruitment/:id/group-qr" element={<FormRelayGroupQrPage />} />
        <Route path="/recruitment/:id/apply" element={<RecruitmentApplyPage />} />
        <Route path="/recommend-talent" element={<Navigate to="/hall?tab=recommend" replace />} />
        <Route path="/publish" element={<PublishPage />} />
        <Route path="/templates" element={<TemplatesPage />} />
        <Route path="/templates/edit" element={<TemplateEditPage />} />
        <Route path="/orders" element={<OrdersPage />} />
        <Route path="/orders/:id/applicants" element={<PrOrderApplicantsPage />} />
        <Route path="/orders/:id/schedule" element={<PrOrderSchedulePage />} />
        <Route path="/orders/:id/schedule/success" element={<PrOrderScheduleSuccessPage />} />
        <Route path="/orders/:id/video-review" element={<PrOrderVideoReviewPage />} />
        <Route path="/form-relay" element={<FormRelayPage />} />
        <Route path="/messages" element={<MessagesPage />} />
        <Route path="/chat" element={<ChatPage />} />
        <Route path="/profile" element={<ProfilePage />} />
        <Route path="/profile/favorites" element={<FavoritesPage />} />
        <Route path="/profile/analytics" element={<AnalyticsPage />} />
        <Route path="/profile/support" element={<SupportPage />} />
        <Route path="/profile/talent" element={<TalentProfilePage />} />
        <Route path="/profile/supplier" element={<SupplierProfilePage />} />
        <Route path="/profile/pr" element={<PrProfilePage />} />
        <Route path="/profile/linke" element={<PrDouyinLinkePage />} />
        {MP_ADDONS_NAV_VISIBLE ? (
          <Route path="/addons" element={<MerchantEmbedShell />}>
            <Route index element={<Navigate to="/addons/shortvideo" replace />} />
            <Route path="shortvideo" element={<ShortVideoAddonPage />} />
            <Route path="ai-content" element={<AiContentAddonPage />} />
            <Route path="digital-human" element={<DigitalHumanAddonPage />} />
          </Route>
        ) : (
          <Route path="/addons/*" element={<Navigate to="/hall?tab=home" replace />} />
        )}
      </Route>
      <Route path="*" element={<RootRedirect />} />
    </Routes>
  )
}
