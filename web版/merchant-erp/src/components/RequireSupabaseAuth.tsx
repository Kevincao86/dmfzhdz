import { type ReactNode, useEffect, useState } from 'react'
import { Navigate, useNavigate } from 'react-router-dom'
import { assertTenantAccessAllowed } from '../lib/assertTenantAccessAllowed'
import { supabase, supabaseConfigured } from '../lib/supabaseClient'

/**
 * 须覆盖：getSession 慢 + assertTenantAccessAllowed 内 Promise.race 最长约 12s + 余量。
 * 首屏改为「先 await getSession 再订阅」后，整体可能略长于原先并行方案。
 */
const AUTH_BOOTSTRAP_MAX_WAIT_MS = 45_000

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
    /** 在异步 bootstrap 完成后再赋值，供 cleanup 取消订阅 */
    let authSubscription: ReturnType<typeof sb.auth.onAuthStateChange>['data'] | null = null

    const markBootResolved = () => {
      bootResolved = true
    }

    /**
     * 在判定「无会话」前做一次短时重读：部分环境下 storage 尚未灌入内存时 getSession 会先返回 null，
     * 与 INITIAL_SESSION 竞态同源；仅对「当前判定为无 session」做补救，避免误踢回登录页。
     */
    const reconfirmHasSession = async (): Promise<boolean> => {
      let { data } = await sb.auth.getSession()
      if (data.session) return true
      await new Promise((r) => setTimeout(r, 100))
      ;({ data } = await sb.auth.getSession())
      return Boolean(data.session)
    }

    const applySession = async (hasSessionHint: boolean) => {
      const gen = ++gateGen
      if (cancelled) return

      let has = hasSessionHint
      if (!has) {
        has = await reconfirmHasSession()
        if (cancelled || gen !== gateGen) return
      }

      if (!has) {
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
      console.warn(
        '[ERP] 会话初始化超时，将跳转登录页。请检查网络、VITE_SUPABASE_URL 及浏览器是否拦截第三方 Cookie。',
      )
      setAllowed(false)
      setReady(true)
      navigate('/login', {
        replace: true,
        state: { authMessage: '会话加载超时，请检查网络与 Supabase 配置后重新登录' },
      })
    }, AUTH_BOOTSTRAP_MAX_WAIT_MS)

    void (async () => {
      try {
        const { data } = await sb.auth.getSession()
        if (cancelled) return
        await applySession(Boolean(data.session))
      } catch (e) {
        console.error('[ERP] getSession 失败', e)
        if (!cancelled) await applySession(false)
      }
      if (cancelled) return

      const { data: sub } = sb.auth.onAuthStateChange((event, session) => {
        if (cancelled) return
        /** 首屏已由上方 await getSession + applySession 处理，避免与「先 null 后恢复」竞态 */
        if (event === 'INITIAL_SESSION') return
        void applySession(Boolean(session))
      })
      authSubscription = sub
    })()

    return () => {
      cancelled = true
      clearTimeout(visTimer)
      window.clearTimeout(emergencyId)
      authSubscription?.subscription.unsubscribe()
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
