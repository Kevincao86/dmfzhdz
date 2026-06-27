import { useEffect, useState } from 'react'
import { Link, useNavigate, useSearchParams } from 'react-router-dom'
import { cn } from '../../cn'
import { formatMpApiErr } from '../../lib/mpApiErrors'
import { dyOAuthComplete } from '../../lib/mpApi'
import { applyWorkIdentityAfterLogin } from '../../lib/switchWorkIdentity'
import type { MpWorkIdentity } from '../../lib/mpWorkIdentity'
import { BRAND_LOGO_URL, BRAND_NAME_SHORT } from '../../lib/brand'

function parseWorkIdentity(raw: string | null | undefined): MpWorkIdentity {
  const v = String(raw || '').trim()
  if (v === 'pr' || v === 'shoot' || v === 'edit') return v
  return 'talent'
}

export default function DyOAuthCallbackPage() {
  const nav = useNavigate()
  const [params] = useSearchParams()
  const [err, setErr] = useState('')

  useEffect(() => {
    if (typeof window !== 'undefined' && window.top && window.top !== window.self) {
      window.top.location.replace(window.location.href)
    }
  }, [])

  useEffect(() => {
    const code = params.get('code')
    const state = params.get('state')
    const oauthErr = params.get('error_description') || params.get('error')
    if (oauthErr) {
      setErr(String(oauthErr))
      return
    }
    if (!code || !state) {
      setErr('缺少抖音授权参数，请返回登录页重试')
      return
    }

    let cancelled = false
    ;(async () => {
      try {
        const r = await dyOAuthComplete(code, state)
        if (cancelled) return
        const workIdentity = parseWorkIdentity(r.workIdentity)
        await applyWorkIdentityAfterLogin(r.token, r.account, workIdentity)
        nav('/hall', { replace: true })
      } catch (e) {
        if (!cancelled) setErr(formatMpApiErr(e, '抖音扫码登录失败'))
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
        'bg-gradient-to-b from-violet-50 via-white to-cyan-50',
      )}
    >
      <div className="mb-6 flex items-center gap-3">
        <img src={BRAND_LOGO_URL} alt={BRAND_NAME_SHORT} className="h-11 w-11 rounded-2xl object-contain shadow-sm" />
        <h1 className="text-lg font-bold">灵祺星选平台</h1>
      </div>
      <div className="w-full max-w-md rounded-2xl border border-white/80 bg-white/80 p-8 text-center shadow-lg backdrop-blur-xl">
        {err ? (
          <>
            <p className="text-sm text-red-700">{err}</p>
            <Link
              to="/login?role=talent"
              className="mt-6 inline-flex rounded-xl bg-violet-600 px-5 py-2.5 text-sm font-semibold text-white hover:bg-violet-700"
            >
              返回登录
            </Link>
          </>
        ) : (
          <>
            <div className="mx-auto mb-4 h-10 w-10 animate-spin rounded-full border-2 border-violet-200 border-t-violet-600" />
            <p className="text-sm text-slate-600">正在完成抖音授权登录…</p>
          </>
        )}
      </div>
    </div>
  )
}
