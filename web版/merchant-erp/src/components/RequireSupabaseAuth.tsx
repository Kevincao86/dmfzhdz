import { type ReactNode, useEffect, useState } from 'react'
import { Navigate } from 'react-router-dom'
import type { Session } from '@supabase/supabase-js'
import { supabase, supabaseConfigured } from '../lib/supabaseClient'

/**
 * 路由守卫：仅判断「是否已登录」（Supabase 会话是否存在）。
 * 不再做竞态/防抖/轮询/整页刷新/租户门控等逻辑。
 */
export default function RequireSupabaseAuth({ children }: { children: ReactNode }) {
  const [ready, setReady] = useState(false)
  const [hasSession, setHasSession] = useState(false)

  useEffect(() => {
    if (!supabaseConfigured || !supabase) {
      setHasSession(true)
      setReady(true)
      return
    }

    const sb = supabase
    const apply = (session: Session | null) => {
      setHasSession(Boolean(session))
      setReady(true)
    }

    void sb.auth.getSession().then(({ data }) => apply(data.session))

    const { data: sub } = sb.auth.onAuthStateChange((_event, session) => {
      apply(session)
    })

    return () => sub.subscription.unsubscribe()
  }, [])

  if (!ready) {
    return (
      <div className="erp-main-surface flex min-h-screen flex-col items-center justify-center gap-4">
        <div
          className="h-11 w-11 animate-spin rounded-full border-2 border-cyan-500 border-t-transparent"
          aria-label="加载中"
          role="status"
        />
        <p className="text-sm font-medium text-slate-600">正在加载…</p>
      </div>
    )
  }

  if (supabaseConfigured && !hasSession) {
    return <Navigate to="/login" replace />
  }

  return <>{children}</>
}
