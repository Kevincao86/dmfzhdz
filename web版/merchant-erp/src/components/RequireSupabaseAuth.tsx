import { type ReactNode, useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import type { Session } from '@supabase/supabase-js'
import { assertTenantAccessAllowed } from '../lib/assertTenantAccessAllowed'
import { supabase, supabaseConfigured } from '../lib/supabaseClient'

/** 单次 getSession 竞态上限：避免对 Supabase 请求挂起时整页永久「正在加载会话」 */
const GET_SESSION_RACE_MS = 10_000
/** 首几秒内的「无会话」信号可能是 Auth 初始化顺序问题，合并后再判定 */
const NO_SESSION_DEBOUNCE_MS = 600
/** 首屏仅在此窗口内对「无会话」做防抖；之后无会话视为真实登出 */
const NO_SESSION_DEBOUNCE_BOOT_MS = 4_500
/** 无会话时在后台轮询 getSession 的间隔（不跳转登录页，直至拿到会话） */
const SESSION_POLL_MS = 2_000
/** 登录后进后台任意加载态持续超过此时长则整页刷新；不 replace 退回 /login */
const LOADING_HARD_RELOAD_MS = 5_000

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
  const [ready, setReady] = useState(false)
  const [allowed, setAllowed] = useState(false)
  /** 租户校验失败等业务原因：仅展示说明与手动去登录，不 replace 改 URL */
  const [accessBlockMessage, setAccessBlockMessage] = useState<string | null>(null)
  /** 已判定暂无会话或 getSession 超时：轮询同步会话，不自动跳 /login */
  const [sessionSyncPending, setSessionSyncPending] = useState(false)

  useEffect(() => {
    if (!supabaseConfigured || !supabase) {
      setAllowed(true)
      setReady(true)
      setSessionSyncPending(false)
      setAccessBlockMessage(null)
      return
    }

    const sb = supabase
    let cancelled = false
    let gateGen = 0
    const bootStartedAt = Date.now()
    let noSessionTimer: ReturnType<typeof setTimeout> | undefined
    const sessionEverSeenRef = { current: false }

    const clearNoSessionDebounce = () => {
      if (noSessionTimer !== undefined) {
        clearTimeout(noSessionTimer)
        noSessionTimer = undefined
      }
    }

    const enterSessionSync = () => {
      setAccessBlockMessage(null)
      setSessionSyncPending(true)
      setAllowed(false)
      setReady(true)
    }

    const applySession = async (hasSession: boolean) => {
      const gen = ++gateGen
      if (cancelled) return
      if (!hasSession) {
        enterSessionSync()
        return
      }
      const gate = await assertTenantAccessAllowed(sb)
      if (cancelled || gen !== gateGen) return
      if (!gate.ok) {
        await sb.auth.signOut()
        setSessionSyncPending(false)
        setAccessBlockMessage(gate.message)
        setAllowed(false)
        setReady(true)
        return
      }
      setSessionSyncPending(false)
      setAccessBlockMessage(null)
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

    void raceGetSession(() => sb.auth.getSession()).then((r) => {
      if (cancelled) return
      if (r.kind === 'timeout') {
        console.warn(
          `[ERP] getSession 超过 ${GET_SESSION_RACE_MS / 1000}s 仍未返回，可能无法访问 Supabase。将轮询会话；请检查网络与 VITE_SUPABASE_URL。`,
        )
        enterSessionSync()
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

    return () => {
      cancelled = true
      clearNoSessionDebounce()
      clearTimeout(visTimer)
      sub.subscription.unsubscribe()
      document.removeEventListener('visibilitychange', onVis)
    }
  }, [])

  useEffect(() => {
    if (!sessionSyncPending || !supabaseConfigured || !supabase) return
    const sb = supabase
    const tick = () => {
      void raceGetSession(() => sb.auth.getSession()).then((r) => {
        if (r.kind === 'timeout') return
        if (r.session) {
          void (async () => {
            const gate = await assertTenantAccessAllowed(sb)
            if (!gate.ok) {
              await sb.auth.signOut()
              setSessionSyncPending(false)
              setAccessBlockMessage(gate.message)
              setAllowed(false)
              return
            }
            setSessionSyncPending(false)
            setAccessBlockMessage(null)
            setAllowed(true)
          })()
        }
      })
    }
    tick()
    const id = window.setInterval(tick, SESSION_POLL_MS)
    return () => window.clearInterval(id)
  }, [sessionSyncPending])

  useEffect(() => {
    if (!supabaseConfigured) return
    if (accessBlockMessage) return
    const inAuthLoading =
      !ready ||
      sessionSyncPending ||
      (ready && !allowed && !sessionSyncPending)
    if (!inAuthLoading) return
    const id = window.setTimeout(() => {
      window.location.reload()
    }, LOADING_HARD_RELOAD_MS)
    return () => window.clearTimeout(id)
  }, [ready, allowed, sessionSyncPending, accessBlockMessage, supabaseConfigured])

  if (!ready) {
    return (
      <div className="erp-main-surface flex min-h-screen flex-col items-center justify-center gap-4">
        <div
          className="h-11 w-11 animate-spin rounded-full border-2 border-cyan-500 border-t-transparent"
          aria-label="加载中"
          role="status"
        />
        <p className="text-sm font-medium text-slate-600">正在加载会话…</p>
        <p className="max-w-sm text-center text-xs text-slate-500">
          超过 {LOADING_HARD_RELOAD_MS / 1000} 秒将自动刷新本页，不会退回登录页。
        </p>
      </div>
    )
  }

  if (supabaseConfigured && accessBlockMessage) {
    return (
      <div className="erp-main-surface flex min-h-screen flex-col items-center justify-center gap-4 px-6 text-center">
        <p className="max-w-md text-sm font-medium text-red-700">{accessBlockMessage}</p>
        <Link
          to="/login"
          className="rounded-lg bg-slate-900 px-4 py-2 text-sm font-medium text-white hover:bg-slate-800"
        >
          前往登录页
        </Link>
      </div>
    )
  }

  if (supabaseConfigured && sessionSyncPending) {
    return (
      <div className="erp-main-surface flex min-h-screen flex-col items-center justify-center gap-3 px-6 text-center">
        <div
          className="h-11 w-11 animate-spin rounded-full border-2 border-cyan-500 border-t-transparent"
          aria-label="同步登录状态"
          role="status"
        />
        <p className="text-sm font-medium text-slate-600">正在同步登录状态…</p>
        <p className="max-w-sm text-center text-xs text-slate-500">
          超过 {LOADING_HARD_RELOAD_MS / 1000} 秒将自动刷新本页，不会退回登录页。
        </p>
      </div>
    )
  }

  if (supabaseConfigured && !allowed) {
    return (
      <div className="erp-main-surface flex min-h-screen flex-col items-center justify-center gap-4">
        <div
          className="h-11 w-11 animate-spin rounded-full border-2 border-cyan-500 border-t-transparent"
          aria-label="加载中"
          role="status"
        />
        <p className="text-sm font-medium text-slate-600">正在准备…</p>
        <p className="max-w-sm text-center text-xs text-slate-500">
          超过 {LOADING_HARD_RELOAD_MS / 1000} 秒将自动刷新本页，不会退回登录页。
        </p>
      </div>
    )
  }

  return <>{children}</>
}
