import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom'
import OpsLoginPage from './ops/OpsLoginPage'
import OpsRequireAuth from './ops/OpsRequireAuth'
import OpsAdminLayout from './ops/OpsAdminLayout'
import OpsAccountsPermissionsPage from './ops/pages/OpsAccountsPermissionsPage'
import OpsAiModelsPage from './ops/pages/OpsAiModelsPage'
import OpsCustomerDetailPage from './ops/pages/OpsCustomerDetailPage'
import OpsAnnouncementsPage from './ops/pages/OpsAnnouncementsPage'
import OpsCustomersListPage from './ops/pages/OpsCustomersListPage'
import OpsRecruitmentOrdersPage from './ops/pages/OpsRecruitmentOrdersPage'
import OpsMpRecruitmentOrdersPage from './ops/pages/OpsMpRecruitmentOrdersPage'
import OpsTalentLibraryPage from './ops/pages/OpsTalentLibraryPage'
import OpsPaymentOrdersPage from './ops/pages/OpsPaymentOrdersPage'
import OpsSupportWorkbenchPage from './ops/pages/OpsSupportWorkbenchPage'

export default function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/login" element={<OpsLoginPage />} />
        <Route
          path="/"
          element={
            <OpsRequireAuth>
              <OpsAdminLayout />
            </OpsRequireAuth>
          }
        >
          <Route index element={<Navigate to="/customers" replace />} />
          <Route path="customers" element={<OpsCustomersListPage />} />
          <Route path="customers/:customerId" element={<OpsCustomerDetailPage />} />
          <Route path="announcements" element={<OpsAnnouncementsPage />} />
          <Route path="accounts" element={<OpsAccountsPermissionsPage />} />
          <Route path="recruitment-orders" element={<OpsRecruitmentOrdersPage />} />
          <Route path="mp-recruitment-orders" element={<OpsMpRecruitmentOrdersPage />} />
          <Route path="talent-library" element={<OpsTalentLibraryPage />} />
          <Route path="payment-orders" element={<OpsPaymentOrdersPage />} />
          <Route path="ai-models" element={<OpsAiModelsPage />} />
          <Route path="support" element={<OpsSupportWorkbenchPage />} />
        </Route>
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </BrowserRouter>
  )
}
