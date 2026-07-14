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
import OpsMpMembershipStatusPage from './ops/pages/OpsMpMembershipStatusPage'
import OpsSupportHubPage from './ops/pages/OpsSupportHubPage'
import OpsHelpManualPage from './ops/pages/OpsHelpManualPage'
import OpsTeamIntroPage from './ops/pages/OpsTeamIntroPage'
import OpsDistributionPage from './ops/pages/OpsDistributionPage'
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
          <Route path="distribution" element={<OpsDistributionPage />} />
          <Route path="mp-membership-status/:role/:targetId" element={<OpsMpMembershipStatusPage />} />
          <Route path="ai-models" element={<OpsAiModelsPage />} />
          <Route path="support" element={<OpsSupportHubPage />} />
          <Route path="support-mp" element={<Navigate to="/support?channel=mp" replace />} />
          <Route path="help-manual" element={<OpsHelpManualPage />} />
          <Route path="help-manual/partner" element={<Navigate to="/help-manual?edition=partner" replace />} />
          <Route path="help-manual/fulfillment" element={<Navigate to="/help-manual?edition=fulfillment" replace />} />
          <Route path="help-manual/mp" element={<Navigate to="/help-manual?edition=mp" replace />} />
          <Route path="team-intro" element={<OpsTeamIntroPage />} />
        </Route>
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </BrowserRouter>
  )
}
