import { useEffect, useRef } from 'react'
import { useLocation, useNavigate } from 'react-router-dom'
import { useMembership } from '../context/MembershipContext'
import { isPathBlockedForFree, type MembershipPlan } from '../lib/membershipPlan'

/** 轮询云端 membership_plan；运营改档或订阅确认后自动刷新导航与受限路由 */
export default function MembershipPlanSync() {
  const { plan, loading, reload } = useMembership()
  const location = useLocation()
  const navigate = useNavigate()
  const prevPlanRef = useRef<MembershipPlan | null>(null)

  useEffect(() => {
    const tick = () => {
      if (document.visibilityState === 'visible') void reload({ silent: true })
    }
    const id = window.setInterval(tick, 20_000)
    const onVis = () => {
      if (document.visibilityState === 'visible') void reload({ silent: true })
    }
    document.addEventListener('visibilitychange', onVis)
    return () => {
      window.clearInterval(id)
      document.removeEventListener('visibilitychange', onVis)
    }
  }, [reload])

  useEffect(() => {
    if (loading) return
    const prev = prevPlanRef.current
    if (prev === null) {
      prevPlanRef.current = plan
      if (plan === 'free' && isPathBlockedForFree(location.pathname)) {
        navigate('/settings?tab=subscription&upgrade=1', { replace: true })
      }
      return
    }
    if (prev === plan) return
    prevPlanRef.current = plan

    if (plan === 'free' && isPathBlockedForFree(location.pathname)) {
      navigate('/settings?tab=subscription&upgrade=1', { replace: true })
      return
    }
    if (prev === 'free' && plan !== 'free' && location.pathname.startsWith('/settings')) {
      const p = new URLSearchParams(location.search)
      if (p.get('upgrade') === '1') {
        navigate('/home', { replace: true })
      }
    }
  }, [plan, loading, location.pathname, location.search, navigate])

  return null
}
