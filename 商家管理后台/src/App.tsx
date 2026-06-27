import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom'
import OpsLoginPage from './ops/OpsLoginPage'
import OpsRequireAuth from './ops/OpsRequireAuth'
import OpsAdminLayout from './ops/OpsAdminLayout'
import OpsAccountsPermissionsPage from './ops/pages/OpsAccountsPermissionsPage'
import OpsHomePage from './ops/pages/OpsHomePage'
import OpsAiModelsPage from './ops/pages/OpsAiModelsPage'
import OpsCustomerDetailPage from './ops/pages/OpsCustomerDetailPage'
import OpsAnnouncementsPage from './ops/pages/OpsAnnouncementsPage'
import OpsMpAnnouncementsPage from './ops/pages/OpsMpAnnouncementsPage'
import OpsCustomersListPage from './ops/pages/OpsCustomersListPage'
import OpsRecruitmentOrdersPage from './ops/pages/OpsRecruitmentOrdersPage'
import OpsMpRecruitmentOrdersPage from './ops/pages/OpsMpRecruitmentOrdersPage'
import OpsTalentLibraryPage from './ops/pages/OpsTalentLibraryPage'
import OpsSupplierTeamLibraryPage from './ops/pages/OpsSupplierTeamLibraryPage'
import OpsPrLibraryPage from './ops/pages/OpsPrLibraryPage'
import OpsMpLibraryPermissionPage from './ops/pages/OpsMpLibraryPermissionPage'
import OpsPaymentOrdersPage from './ops/pages/OpsPaymentOrdersPage'
import OpsMpMembershipFinancePage from './ops/pages/OpsMpMembershipFinancePage'
import OpsSupportWorkbenchPage from './ops/pages/OpsSupportWorkbenchPage'
import OpsSupportMpWorkbenchPage from './ops/pages/OpsSupportMpWorkbenchPage'
import OpsHelpManualPage from './ops/pages/OpsHelpManualPage'
import OpsTeamIntroPage from './ops/pages/OpsTeamIntroPage'
import OpsLegalDocPage from './pages/OpsLegalDocPage'

export default function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/login" element={<OpsLoginPage />} />
        <Route path="/legal/privacy" element={<OpsLegalDocPage doc="privacy" />} />
        <Route path="/legal/aup" element={<OpsLegalDocPage doc="aup" />} />
        <Route
          path="/"
          element={
            <OpsRequireAuth>
              <OpsAdminLayout />
            </OpsRequireAuth>
          }
        >
          <Route index element={<OpsHomePage />} />
          <Route path="customers" element={<OpsCustomersListPage />} />
          <Route path="customers/:customerId" element={<OpsCustomerDetailPage />} />
          <Route path="announcements" element={<OpsAnnouncementsPage />} />
          <Route path="mp-announcements" element={<OpsMpAnnouncementsPage />} />
          <Route path="accounts" element={<OpsAccountsPermissionsPage />} />
          <Route path="recruitment-orders" element={<OpsRecruitmentOrdersPage />} />
          <Route path="mp-recruitment-orders" element={<OpsMpRecruitmentOrdersPage />} />
          <Route path="talent-library" element={<OpsTalentLibraryPage />} />
          <Route path="shoot-team-library" element={<OpsSupplierTeamLibraryPage role="shoot" />} />
          <Route path="edit-team-library" element={<OpsSupplierTeamLibraryPage role="edit" />} />
          <Route path="pr-library" element={<OpsPrLibraryPage />} />
          <Route path="pr-library/:entryId/permissions" element={<OpsMpLibraryPermissionPage />} />
          <Route path="talent-library/:entryId/permissions" element={<OpsMpLibraryPermissionPage />} />
          <Route path="shoot-team-library/:entryId/permissions" element={<OpsMpLibraryPermissionPage />} />
          <Route path="edit-team-library/:entryId/permissions" element={<OpsMpLibraryPermissionPage />} />
          <Route path="payment-orders" element={<OpsPaymentOrdersPage />} />
          <Route path="mp-membership-finance" element={<OpsMpMembershipFinancePage />} />
          <Route path="ai-models" element={<OpsAiModelsPage />} />
          <Route path="support" element={<OpsSupportWorkbenchPage channel="erp" />} />
          <Route path="support-mp" element={<OpsSupportMpWorkbenchPage />} />
          <Route path="help-manual" element={<OpsHelpManualPage edition="merchant" />} />
          <Route path="help-manual/partner" element={<OpsHelpManualPage edition="partner" />} />
          <Route path="help-manual/fulfillment" element={<OpsHelpManualPage edition="fulfillment" />} />
          <Route path="help-manual/mp" element={<OpsHelpManualPage edition="mp" />} />
          <Route path="team-intro" element={<OpsTeamIntroPage />} />
        </Route>
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </BrowserRouter>
  )
}
