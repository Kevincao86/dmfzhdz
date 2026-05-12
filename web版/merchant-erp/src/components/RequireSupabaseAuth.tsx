import { type ReactNode, useEffect, useState } from 'react'
import { Navigate, useNavigate } from 'react-router-dom'
import type { Session } from '@supabase/supabase-js'
import { assertTenantAccessAllowed } from '../lib/assertTenantAccessAllowed'
import { supabase, supabaseConfigured } from '../lib/supabaseClient'

/** 首几秒内的「无会话」可能是 getSession 与 SIGNED_IN 顺序问题，防抖后再判定 */
const NO_SESSION_DEBOUNCE_MS = 600
const NO_SESSION_DEBOUNCE_BOOT_MS = 4_500
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
    const bootStartedAt = Date.now()
    let noSessionTimer: ReturnType<typeof setTimeout> | undefined
    /** 已见过非空 session 时，忽略 getSession/可见性里偶发 null（除非 SIGNED_OUT） */
    const sessionEverSeenRef = { current: false }

    const markBootResolved = () => {
      bootResolved = true
    }

    const clearNoSessionDebounce = () => {
      if (noSessionTimer !== undefined) {
        clearTimeout(noSessionTimer)
        noSessionTimer = undefined
      }
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

    const scheduleNoSession = () => {
      clearNoSessionDebounce()
      const inDebounceWindow = Date.now() - bootStartedAt < NO_SESSION_DEBOUNCE_BOOT_MS
      if (!inDebounceWindow) {
        void applySession(false)
        return
      }
      noSessionTimer = window.setTimeout(() => {
        noSessionTimer = undefined
        if (cancelled) return
        void applySession(false)
      }, NO_SESSION_DEBOUNCE_MS)
    }

    const handleHasSession = (
      session: Session | null,
      opts?: { fromAuth?: boolean; authEvent?: string },
    ) => {
      if (cancelled) return
      if (session) {
        sessionEverSeenRef.current = true
        clearNoSessionDebounce()
        void applySession(true)
        return
      }
      const explicitSignOut = opts?.fromAuth === true && opts.authEvent === 'SIGNED_OUT'
      if (sessionEverSeenRef.current && !explicitSignOut) {
        if (opts?.fromAuth && opts.authEvent !== 'SIGNED_OUT') return
        if (!opts?.fromAuth) return
      }
      scheduleNoSession()
    }

    // 不单独依赖 INITIAL_SESSION：部分环境下事件顺序晚于首屏，会导致 ready 一直为 false（表现为白屏/一直转圈）
    void sb.auth.getSession().then(({ data }) => {
      if (cancelled) return
      handleHasSession(data.session, { fromAuth: false })
    })

    const { data: sub } = sb.auth.onAuthStateChange((event, session) => {
      if (cancelled) return
      handleHasSession(session, { fromAuth: true, authEvent: event })
    })

    let visTimer: ReturnType<typeof setTimeout> | undefined
    const onVis = () => {
      if (document.visibilityState !== 'visible') return
      clearTimeout(visTimer)
      visTimer = setTimeout(() => {
        void sb.auth.getSession().then(({ data }) => {
          if (cancelled) return
          handleHasSession(data.session, { fromAuth: false })
        })
      }, 400)
    }
    document.addEventListener('visibilitychange', onVis)

    const emergencyId = window.setTimeout(() => {
      if (cancelled || bootResolved) return
      bootResolved = true
      clearNoSessionDebounce()
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
      clearNoSessionDebounce()
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
