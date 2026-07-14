import { lazy, Suspense, type ReactNode } from 'react'
import { Navigate, Route, Routes, useLocation } from 'react-router-dom'
import HelpManualPage from '@merchant/pages/HelpManualPage'
import TeamIntroPage from '@merchant/pages/TeamIntroPage'
import LegalDocPage from '@merchant/pages/legal/LegalDocPage'
import AppShell from './components/AppShell'
import LandingPage from './pages/LandingPage'
import LoginPage from './pages/LoginPage'
import DyOAuthCallbackPage from './pages/login/DyOAuthCallbackPage'
import RegisterPage from './pages/RegisterPage'
import AffiliateApplyPage from '@merchant/pages/AffiliateApplyPage'
import HallPage from './pages/HallPage'
import OrdersPage from './pages/OrdersPage'
import MessagesPage from './pages/MessagesPage'
import ChatPage from './pages/ChatPage'
import ProfilePage from './pages/ProfilePage'
import FavoritesPage from './pages/FavoritesPage'
import AnalyticsPage from './pages/AnalyticsPage'
import SupportPage from './pages/SupportPage'
import TalentProfilePage from './pages/TalentProfilePage'
import TalentPrQuotesPage from './pages/TalentPrQuotesPage'
import SupplierProfilePage from './pages/SupplierProfilePage'
import PrDouyinLinkePage from './pages/PrDouyinLinkePage'
import PrProfilePage from './pages/PrProfilePage'
import PrOrderApplicantsPage from './pages/PrOrderApplicantsPage'
import PrOrderSchedulePage from './pages/PrOrderSchedulePage'
import PrOrderScheduleDatesPage from './pages/PrOrderScheduleDatesPage'
import PrOrderScheduleSuccessPage from './pages/PrOrderScheduleSuccessPage'
import PrOrderVideoReviewPage from './pages/PrOrderVideoReviewPage'
import PrOrderScriptReviewPage from './pages/PrOrderScriptReviewPage'
import OrderGroupChatPage from './pages/OrderGroupChatPage'
import PrTargetedManagePage from './pages/PrTargetedManagePage'
import PrTargetedPickPage from './pages/PrTargetedPickPage'
import TargetedInvitesPage from './pages/TargetedInvitesPage'
import PublicVideoReviewSharePage from './pages/PublicVideoReviewSharePage'
import PublicApplicantPickSharePage from './pages/PublicApplicantPickSharePage'
import PublicPrInfoPage from './pages/PublicPrInfoPage'
import RecruitmentDetailPage from './pages/RecruitmentDetailPage'
import RecruitmentApplyPage from './pages/RecruitmentApplyPage'
import PublishPage from './pages/PublishPage'
import TemplatesPage from './pages/TemplatesPage'
import TemplateEditPage from './pages/TemplateEditPage'
import FormRelayPage from './pages/FormRelayPage'
import FormRelayGroupQrPage from './pages/FormRelayGroupQrPage'
import XingxuanBriefTemplatesPage from './pages/XingxuanBriefTemplatesPage'
import XingxuanCooperationPage from './pages/XingxuanCooperationPage'
import XingxuanFunnelPage from './pages/XingxuanFunnelPage'
import XingxuanSubscriptionsPage from './pages/XingxuanSubscriptionsPage'
import XingxuanMembershipPage from './pages/XingxuanMembershipPage'
import XingxuanPointsRechargePage from './pages/XingxuanPointsRechargePage'
import OrderCalendarPage from './pages/OrderCalendarPage'
import MyPaymentOrdersPage from './pages/MyPaymentOrdersPage'
import XingxuanTalentCreditPage from './pages/XingxuanTalentCreditPage'
import MerchantEmbedShell from './merchant/MerchantEmbedShell'
import { getToken } from './lib/mpSession'
import { isPublicSharePath, isPublicVideoReviewSharePath } from './lib/publicShareRoutes'

const ShortVideoAddonPage = lazy(() => import('@merchant/pages/ShortVideoOptimizationPage'))
const BriefContentShell = lazy(() => import('@merchant/pages/BriefContentShell'))
const AiContentAddonPage = lazy(() => import('@merchant/pages/AiOperationContentPage'))
const BriefGenRecordsPage = lazy(() => import('@merchant/pages/BriefGenRecordsPage'))
const DigitalHumanAddonPage = lazy(() => import('@merchant/pages/DigitalHumanBroadcastPage'))
const AiScriptReviewAddonPage = lazy(() => import('@merchant/pages/AiScriptReviewAddonPage'))

function AddonPageFallback() {
  return (
    <div className="flex min-h-[40vh] items-center justify-center text-sm text-[var(--shell-muted)]">
      加载增值服务…
    </div>
  )
}

function LazyAddonPage({ children }: { children: ReactNode }) {
  return <Suspense fallback={<AddonPageFallback />}>{children}</Suspense>
}

function RequireAuth({ children }: { children: ReactNode }) {
  if (!getToken()) return <Navigate to="/" replace />
  return <>{children}</>
}

function RootRedirect() {
  const { pathname } = useLocation()
  if (isPublicSharePath(pathname)) {
    if (isPublicVideoReviewSharePath(pathname)) return <PublicVideoReviewSharePage />
    return <PublicApplicantPickSharePage />
  }
  if (getToken()) return <Navigate to="/hall?tab=hall" replace />
  return <Navigate to="/" replace />
}

export default function App() {
  return (
    <Routes>
      <Route path="/" element={<LandingPage />} />
      <Route path="/login" element={<LoginPage />} />
      <Route path="/login/dy-oauth" element={<DyOAuthCallbackPage />} />
      <Route path="/register" element={<RegisterPage />} />
      <Route path="/affiliate/apply" element={<AffiliateApplyPage />} />
      <Route path="/help" element={<HelpManualPage edition="fulfillment" />} />
      <Route path="/help/:articleId" element={<HelpManualPage edition="fulfillment" />} />
      <Route path="/team" element={<TeamIntroPage edition="fulfillment" />} />
      <Route path="/legal/privacy" element={<LegalDocPage edition="fulfillment" doc="privacy" />} />
      <Route path="/legal/aup" element={<LegalDocPage edition="fulfillment" doc="aup" />} />
      <Route path="/pr-info/:orderId" element={<PublicPrInfoPage />} />
      <Route path="/video-review-share/:token" element={<PublicVideoReviewSharePage />} />
      <Route path="/orders/:id/video-review/share/:shareToken" element={<PublicVideoReviewSharePage />} />
      <Route path="/applicant-pick-share/:token" element={<PublicApplicantPickSharePage />} />
      <Route path="/orders/:id/applicants/share/:shareToken" element={<PublicApplicantPickSharePage />} />
      {/* 公开分享须在 RequireAuth 之前；勿把 /orders/.../share/ 放进 AppShell */}
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
        <Route path="/orders/calendar" element={<OrderCalendarPage />} />
        <Route path="/orders/:id/applicants" element={<PrOrderApplicantsPage />} />
        <Route path="/orders/:id/group-chat" element={<OrderGroupChatPage />} />
        <Route path="/orders/:id/targeted" element={<PrTargetedManagePage />} />
        <Route path="/orders/:id/targeted/pick" element={<PrTargetedPickPage />} />
        <Route path="/targeted-invites" element={<TargetedInvitesPage />} />
        <Route path="/orders/:id/schedule/dates" element={<PrOrderScheduleDatesPage />} />
        <Route path="/orders/:id/schedule" element={<PrOrderSchedulePage />} />
        <Route path="/orders/:id/schedule/success" element={<PrOrderScheduleSuccessPage />} />
        <Route path="/orders/:id/video-review" element={<PrOrderVideoReviewPage />} />
        <Route path="/orders/:id/script-review" element={<PrOrderScriptReviewPage />} />
        <Route path="/form-relay" element={<FormRelayPage />} />
        <Route path="/messages" element={<MessagesPage />} />
        <Route path="/chat" element={<ChatPage />} />
        <Route path="/profile" element={<ProfilePage />} />
        <Route path="/profile/membership" element={<XingxuanMembershipPage />} />
        <Route path="/profile/points-recharge" element={<XingxuanPointsRechargePage />} />
        <Route path="/profile/my-orders" element={<MyPaymentOrdersPage />} />
        <Route path="/profile/favorites" element={<FavoritesPage />} />
        <Route path="/profile/analytics" element={<AnalyticsPage />} />
        <Route path="/profile/subscriptions" element={<XingxuanSubscriptionsPage />} />
        <Route path="/profile/talent-credit" element={<XingxuanTalentCreditPage />} />
        <Route path="/profile/cooperation" element={<XingxuanCooperationPage />} />
        <Route path="/profile/brief-templates" element={<XingxuanBriefTemplatesPage />} />
        <Route path="/profile/funnel" element={<XingxuanFunnelPage />} />
        <Route path="/profile/support" element={<SupportPage />} />
        <Route path="/profile/talent" element={<TalentProfilePage />} />
        <Route path="/profile/pr-quotes" element={<TalentPrQuotesPage />} />
        <Route path="/profile/supplier" element={<SupplierProfilePage />} />
        <Route path="/profile/pr" element={<PrProfilePage />} />
        <Route path="/profile/linke" element={<PrDouyinLinkePage />} />
        <Route path="/addons" element={<MerchantEmbedShell />}>
          <Route index element={<Navigate to="/addons/ai-content" replace />} />
          <Route path="shortvideo" element={<LazyAddonPage><ShortVideoAddonPage /></LazyAddonPage>} />
          <Route path="ai-content" element={<LazyAddonPage><BriefContentShell /></LazyAddonPage>}>
            <Route index element={<LazyAddonPage><AiContentAddonPage /></LazyAddonPage>} />
            <Route path="records" element={<LazyAddonPage><BriefGenRecordsPage /></LazyAddonPage>} />
          </Route>
          <Route path="ai-video-review" element={<Navigate to="/addons/ai-review?mode=video" replace />} />
          <Route path="ai-review" element={<LazyAddonPage><AiScriptReviewAddonPage /></LazyAddonPage>} />
          <Route path="digital-human" element={<LazyAddonPage><DigitalHumanAddonPage /></LazyAddonPage>} />
        </Route>
      </Route>
      <Route path="*" element={<RootRedirect />} />
    </Routes>
  )
}
