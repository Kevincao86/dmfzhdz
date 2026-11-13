import { Navigate } from 'react-router-dom'
import PublishWizard from '../components/publish/PublishWizard'
import { getActiveRole } from '../lib/mpSession'

export default function PublishPage() {
  if (getActiveRole() !== 'pr') return <Navigate to="/hall" replace />
  return <PublishWizard />
}
