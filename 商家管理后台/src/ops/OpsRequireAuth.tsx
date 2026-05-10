import type { ReactNode } from 'react'
import { Navigate, useLocation } from 'react-router-dom'
import { OPS_SESSION_KEY } from './OpsLoginPage'

export default function OpsRequireAuth({ children }: { children: ReactNode }) {
  const { pathname } = useLocation()
  const ok = typeof sessionStorage !== 'undefined' && sessionStorage.getItem(OPS_SESSION_KEY) === '1'
  if (!ok) {
    return <Navigate to="/login" replace state={{ from: pathname }} />
  }
  return children
}
