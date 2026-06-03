import { Navigate } from 'react-router-dom'
import RecommendTalentPanel from '../components/mp/RecommendTalentPanel'
import { getActiveRole } from '../lib/mpSession'

export default function RecommendTalentPage() {
  if (getActiveRole() !== 'pr') return <Navigate to="/hall" replace />
  return <RecommendTalentPanel />
}
