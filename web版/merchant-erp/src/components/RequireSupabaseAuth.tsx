import { type ReactNode, useEffect, useState } from 'react'
import { Navigate, useNavigate } from 'react-router-dom'
import type { Session } from '@supabase/supabase-js'
import { assertTenantAccessAllowed } from '../lib/assertTenantAccessAllowed'
import { supabase, supabaseConfigured } from '../lib/supabaseClient'

/** 单次 getSession 竞态上限：避免对 Supabase 请求挂起时整页永久「正在加载会话」 */
const GET_SESSION_RACE_MS = 10_000
/** 首几秒内的「无会话」信号可能是 Auth 初始化顺序问题，合并后再判定 */
const NO_SESSION_DEBOUNCE_MS = 600
/** 首屏仅在此窗口内对「无会话」做防抖；之后无会话视为真实登出 */
const NO_SESSION_DEBOUNCE_BOOT_MS = 4_500
/** 应大于 assertTenantAccessAllowed 内超时 + getSession 余量 */
const AUTH_BOOTSTRAP_MAX_WAIT_MS = 28_000

type SessionRaceOk = { kind: 'ok'; session: Session | null }
type SessionRaceTimeout = { kind: 'timeout' }

function raceGetSession(
  getSession: () => ReturnType<NonNullable<typeof supabase>['auth']['getSession']>,
): Promise<SessionRaceOk | SessionRaceTimeout> {
  return Promise.race([
    getSession().then((r): SessionRaceOk => ({ kind: 'ok', session: r.data.session })),
    new Promise<SessionRaceTimeout>((resolve) => {
      window.setTimeout(() => resolve({ kind: 'timeout' }), GET_SESSION_RACE_MS)
    }),
  ])
}

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
    /** 已在本次挂载中见过非空 session 时，忽略 Auth 管道里偶发的 null（除非 SIGNED_OUT），避免误踢回登录 */
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
      if (opts?.fromAuth && sessionEverSeenRef.current && opts.authEvent !== 'SIGNED_OUT') {
        return
      }
      scheduleNoSession()
    }

    void raceGetSession(() => sb.auth.getSession()).then((r) => {
      if (cancelled) return
      if (r.kind === 'timeout') {
        console.warn(
          `[ERP] getSession 超过 ${GET_SESSION_RACE_MS / 1000}s 仍未返回，可能无法访问 Supabase。将等待 Auth 状态回调；请检查网络与 VITE_SUPABASE_URL。`,
        )
        return
      }
      handleHasSession(r.session, { fromAuth: false })
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
        void raceGetSession(() => sb.auth.getSession()).then((r) => {
          if (cancelled) return
          if (r.kind === 'timeout') return
          handleHasSession(r.session, { fromAuth: false })
        })
      }, 400)
    }
    document.addEventListener('visibilitychange', onVis)

    const emergencyId = window.setTimeout(() => {
      if (cancelled || bootResolved) return
      bootResolved = true
      clearNoSessionDebounce()
      console.warn('[ERP] 会话初始化超时，将跳转登录页。请检查网络、VITE_SUPABASE_URL 及 Supabase 项目是否可达。')
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
