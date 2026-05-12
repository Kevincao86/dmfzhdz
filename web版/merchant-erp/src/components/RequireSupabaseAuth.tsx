import { type ReactNode, useEffect, useState } from 'react'
import { Navigate, useNavigate } from 'react-router-dom'
import { assertTenantAccessAllowed } from '../lib/assertTenantAccessAllowed'
import { supabase, supabaseConfigured } from '../lib/supabaseClient'

/** 应大于 assertTenantAccessAllowed 内超时 + getSession 余量，避免误杀仍在校验中的会话 */
const AUTH_BOOTSTRAP_MAX_WAIT_MS = 20_000

export default function RequireSupabaseAuth({ children }: { children: ReactNode }) {
  const navigate = useNavigate()
  const [ready, setReady] = useState(false)
  const [allowed, setAllowed] = useState(false)

  useEffect(() => {
    if (!supabaseConfigured || !supabase) {
      setAllowed(true)
      setReady(true)
      return
    }

    const sb = supabase
    let cancelled = false
    let gateGen = 0
    let bootResolved = false

    const markBootResolved = () => {
      bootResolved = true
    }

    const applySession = async (hasSession: boolean) => {
      const gen = ++gateGen
      if (cancelled) return
      if (!hasSession) {
        markBootResolved()
        setAllowed(false)
        setReady(true)
        return
      }
      const gate = await assertTenantAccessAllowed(sb)
      if (cancelled || gen !== gateGen) return
      if (!gate.ok) {
        await sb.auth.signOut()
        markBootResolved()
        setAllowed(false)
        setReady(true)
        navigate('/login', { replace: true, state: { authMessage: gate.message } })
        return
      }
      markBootResolved()
      setAllowed(true)
      setReady(true)
    }

    /**
     * 首屏必须以 getSession() 为准：订阅 onAuthStateChange 时，部分环境会先同步派发
     * INITIAL_SESSION 且 session 为 null，若此时立刻 applySession(false)，会在 getSession 尚未返回
     * 有效会话前把用户踢回登录页（表现为「加载会话」后立刻回弹登录）。
     * 后续 TOKEN_REFRESHED / SIGNED_IN / SIGNED_OUT 等仍照常处理。
     */
    void sb.auth
      .getSession()
      .then(({ data }) => {
        if (cancelled) return
        void applySession(Boolean(data.session))
      })
      .catch((e) => {
        console.error('[ERP] getSession 失败', e)
        if (cancelled) return
        void applySession(false)
      })

    const { data: sub } = sb.auth.onAuthStateChange((event, session) => {
      if (cancelled) return
      if (event === 'INITIAL_SESSION') return
      void applySession(Boolean(session))
    })

    let visTimer: ReturnType<typeof setTimeout> | undefined
    const onVis = () => {
      if (document.visibilityState !== 'visible') return
      clearTimeout(visTimer)
      visTimer = setTimeout(() => {
        void sb.auth.getSession().then(({ data }) => {
          if (cancelled) return
          void applySession(Boolean(data.session))
        })
      }, 400)
    }
    document.addEventListener('visibilitychange', onVis)

    const emergencyId = window.setTimeout(() => {
      if (cancelled || bootResolved) return
      bootResolved = true
      console.warn('[ERP] 会话初始化超时，将跳转登录页。请检查网络、VITE_SUPABASE_URL 及本地 Supabase 是否已启动。')
      setAllowed(false)
      setReady(true)
      navigate('/login', {
        replace: true,
        state: { authMessage: '会话加载超时，请检查网络与 Supabase 配置后重新登录' },
      })
    }, AUTH_BOOTSTRAP_MAX_WAIT_MS)

    return () => {
      cancelled = true
      clearTimeout(visTimer)
      window.clearTimeout(emergencyId)
      sub.subscription.unsubscribe()
      document.removeEventListener('visibilitychange', onVis)
    }
  }, [navigate])

  if (!ready) {
    return (
      <div className="erp-main-surface flex min-h-screen flex-col items-center justify-center gap-4">
        <div
          className="h-11 w-11 animate-spin rounded-full border-2 border-cyan-500 border-t-transparent"
          aria-label="加载中"
          role="status"
        />
        <p className="text-sm font-medium text-slate-600">正在加载会话…</p>
      </div>
    )
  }

  if (supabaseConfigured && !allowed) {
    return <Navigate to="/login" replace />
  }

  return <>{children}</>
}
