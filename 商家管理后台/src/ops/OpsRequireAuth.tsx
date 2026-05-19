import { useEffect, useState, type ReactNode } from 'react'
import { Navigate, useLocation } from 'react-router-dom'
import {
  canAccessOpsPath,
  ensureOpsMasterAccount,
  firstAllowedOpsPath,
  refreshOpsSessionFromStorage,
  type OpsSession,
} from './opsStaffAuth'

export default function OpsRequireAuth({ children }: { children: ReactNode }) {
  const { pathname } = useLocation()
  const [session, setSession] = useState<OpsSession | null | undefined>(undefined)

  useEffect(() => {
    void ensureOpsMasterAccount().then(() => {
      setSession(refreshOpsSessionFromStorage())
    })
    const onStorage = () => setSession(refreshOpsSessionFromStorage())
    window.addEventListener('meoo-ops-staff-changed', onStorage)
    return () => window.removeEventListener('meoo-ops-staff-changed', onStorage)
  }, [])

  if (session === undefined) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-slate-950 text-sm text-slate-400">
        加载中…
      </div>
    )
  }

  if (!session) {
    return <Navigate to="/login" replace state={{ from: pathname }} />
  }

  if (!canAccessOpsPath(session, pathname)) {
    const dest = firstAllowedOpsPath(session)
    if (dest === '/login') {
      return <Navigate to="/login" replace />
    }
    return <Navigate to={dest} replace />
  }

  return children
}
