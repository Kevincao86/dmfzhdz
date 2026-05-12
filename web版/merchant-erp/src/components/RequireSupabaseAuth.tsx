import { type ReactNode, useEffect, useState } from 'react'
import { Navigate } from 'react-router-dom'
import { supabase, supabaseConfigured } from '../lib/supabaseClient'

/**
 * 路由守卫：仅判断是否存在 Supabase 会话。
 * 必须以 onAuthStateChange 为准：先并行 getSession 会在登录刚完成时读到 null，误跳 /login。
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
    /** 已收到 Auth 管道至少一次回调（含 INITIAL_SESSION），避免仅用 getSession 竞态 */
    const heardFromAuthRef = { current: false }

    const { data: sub } = sb.auth.onAuthStateChange((_event, session) => {
      heardFromAuthRef.current = true
      setHasSession(Boolean(session))
      setReady(true)
    })

    const fallbackId = window.setTimeout(() => {
      if (heardFromAuthRef.current) return
      void sb.auth.getSession().then(({ data }) => {
        setHasSession(Boolean(data.session))
        setReady(true)
      })
    }, 320)

    return () => {
      heardFromAuthRef.current = true
      window.clearTimeout(fallbackId)
      sub.subscription.unsubscribe()
    }
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
