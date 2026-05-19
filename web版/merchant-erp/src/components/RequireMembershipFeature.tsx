import { Navigate, useLocation } from 'react-router-dom'
import { isPathBlockedForFree } from '../lib/membershipPlan'
import { useMembership } from '../context/MembershipContext'

/** 免费版拦截 GEO / 竞对 / 报税等路由 */
export default function RequireMembershipFeature({ children }: { children: React.ReactNode }) {
  const { pathname } = useLocation()
  const { plan, loading } = useMembership()

  if (loading) return null
  if (plan === 'free' && isPathBlockedForFree(pathname)) {
    return <Navigate to="/settings?tab=subscription&upgrade=1" replace />
  }
  return <>{children}</>
}
