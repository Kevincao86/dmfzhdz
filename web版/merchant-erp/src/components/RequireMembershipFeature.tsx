import { Navigate, useLocation } from 'react-router-dom'
import { isPathBlockedForFree } from '../lib/membershipPlan'
import { useMembership } from '../context/MembershipContext'

/** 免费版拦截 GEO / 竞对 / 报税等路由 */
export default function RequireMembershipFeature({ children }: { children: React.ReactNode }) {
  const { pathname } = useLocation()
  const { plan, loading } = useMembership()

  if (loading) {
    return (
      <div className="erp-main-surface flex min-h-screen flex-col items-center justify-center gap-3">
        <div
          className="h-10 w-10 animate-spin rounded-full border-2 border-cyan-500 border-t-transparent"
          role="status"
          aria-label="加载中"
        />
        <p className="text-sm text-slate-600">正在加载账户权益…</p>
      </div>
    )
  }
  if (plan === 'free' && isPathBlockedForFree(pathname)) {
    return <Navigate to="/settings?tab=subscription&upgrade=1" replace />
  }
  return <>{children}</>
}
