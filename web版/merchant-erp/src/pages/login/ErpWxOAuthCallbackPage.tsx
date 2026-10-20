import { useEffect, useState } from 'react'
import { Link, useNavigate, useSearchParams } from 'react-router-dom'
import { cn } from '../../cn'
import { supabase } from '../../lib/supabaseClient'
import { erpWxOAuthComplete } from '../../lib/mpScanAuthApi'
import { toUserFacingError } from '../../lib/userFacingError'

export default function ErpWxOAuthCallbackPage() {
  const nav = useNavigate()
  const [params] = useSearchParams()
  const [err, setErr] = useState('')

  useEffect(() => {
    if (typeof window !== 'undefined' && window.top && window.top !== window.self) {
      window.top.location.replace(window.location.href)
      return
    }
    const code = String(params.get('code') || '').trim()
    const state = String(params.get('state') || '').trim()
    const oauthErr = String(params.get('error_description') || params.get('error') || '').trim()
    if (oauthErr || !code || !state) {
      setErr(oauthErr || '缺少微信授权参数，请返回登录页重试')
      return
    }
    if (!supabase) {
      setErr('登录服务未初始化')
      return
    }

    let cancelled = false
    ;(async () => {
      try {
        const r = await erpWxOAuthComplete(code, state)
        if (cancelled || !supabase) return
        const { error } = await supabase.auth.setSession({
          access_token: r.access_token,
          refresh_token: r.refresh_token,
        })
        if (error) {
          setErr(error.message)
          return
        }
        const { data: after } = await supabase.auth.getSession()
        if (!after.session) {
          setErr('登录已成功，但未读到会话。请刷新本页或稍后再试。')
          return
        }
        nav('/home', { replace: true })
      } catch (e) {
        if (!cancelled) setErr(toUserFacingError(e, '微信扫码登录失败'))
      }
    })()

    return () => {
      cancelled = true
    }
  }, [params, nav])

  return (
    <div
      className={cn(
        'flex min-h-[100dvh] flex-col items-center justify-center px-4 py-10 text-slate-900',
        'bg-gradient-to-b from-cyan-50 via-white to-teal-50',
      )}
    >
      <div className="mb-6 text-center">
        <h1 className="text-lg font-bold text-slate-900">灵祺AI智能ERP</h1>
        <p className="mt-1 text-sm text-slate-500">微信扫码登录</p>
      </div>
      <div className="w-full max-w-md rounded-2xl border border-white/80 bg-white/80 p-8 text-center shadow-lg backdrop-blur-xl">
        {err ? (
          <>
            <p className="text-sm text-red-700">{err}</p>
            <Link
              to="/login"
              className="mt-6 inline-flex rounded-xl bg-gradient-to-r from-[#0ea5e9] to-[#14b8a6] px-5 py-2.5 text-sm font-semibold text-white"
            >
              返回登录
            </Link>
          </>
        ) : (
          <>
            <div className="mx-auto mb-4 h-10 w-10 animate-spin rounded-full border-2 border-cyan-200 border-t-cyan-600" />
            <p className="text-sm text-slate-600">正在完成微信授权登录…</p>
          </>
        )}
      </div>
    </div>
  )
}
