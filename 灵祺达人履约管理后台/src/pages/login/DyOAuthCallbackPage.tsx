import { useEffect, useState } from 'react'
import { Link, useNavigate, useSearchParams } from 'react-router-dom'
import { resolveDyOAuthCallbackMode } from '@merchant/lib/dyOAuthCallbackMode'
import { cn } from '../../cn'
import { formatMpApiErr } from '../../lib/mpApiErrors'
import { dyOAuthComplete } from '../../lib/mpApi'
import { applyWorkIdentityAfterLogin } from '../../lib/switchWorkIdentity'
import type { MpWorkIdentity } from '../../lib/mpWorkIdentity'
import { BRAND_LOGO_URL, BRAND_NAME_SHORT } from '../../lib/brand'

type View = 'loading' | 'whitelist_ok' | 'whitelist_warn' | 'error'

function parseWorkIdentity(raw: string | null | undefined): MpWorkIdentity {
  const v = String(raw || '').trim()
  if (v === 'pr' || v === 'shoot' || v === 'edit') return v
  return 'talent'
}

export default function DyOAuthCallbackPage() {
  const nav = useNavigate()
  const [params] = useSearchParams()
  const [view, setView] = useState<View>('loading')
  const [err, setErr] = useState('')

  useEffect(() => {
    if (typeof window !== 'undefined' && window.top && window.top !== window.self) {
      window.top.location.replace(window.location.href)
    }
  }, [])

  useEffect(() => {
    const mode = resolveDyOAuthCallbackMode(params)
    if (mode.kind === 'error') {
      setView('error')
      setErr(mode.message)
      return
    }
    if (mode.kind === 'whitelist_bind') {
      setView(mode.hasUserInfo ? 'whitelist_ok' : 'whitelist_warn')
      return
    }

    let cancelled = false
    setView('loading')
    ;(async () => {
      try {
        const r = await dyOAuthComplete(mode.code, mode.state)
        if (cancelled) return
        const workIdentity = parseWorkIdentity(r.workIdentity)
        await applyWorkIdentityAfterLogin(r.token, r.account, workIdentity)
        nav('/hall', { replace: true })
      } catch (e) {
        if (!cancelled) {
          setView('error')
          setErr(formatMpApiErr(e, '抖音扫码登录失败'))
        }
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
        {view === 'whitelist_ok' ? (
          <>
            <p className="text-base font-semibold text-emerald-700">白名单授权已提交</p>
            <p className="mt-3 text-sm leading-relaxed text-slate-600">
              请返回抖音开放平台 → 设置 → 白名单管理，刷新查看该抖音号是否已变为已授权。
              完成后可在本页使用「抖音扫码」登录测试。
            </p>
            <Link
              to="/login?role=talent"
              className="mt-6 inline-flex rounded-xl bg-violet-600 px-5 py-2.5 text-sm font-semibold text-white hover:bg-violet-700"
            >
              前往登录页
            </Link>
          </>
        ) : view === 'whitelist_warn' ? (
          <>
            <p className="text-base font-semibold text-amber-800">白名单授权不完整</p>
            <p className="mt-3 text-sm leading-relaxed text-slate-600">
              当前仅授权了 <span className="font-mono text-xs">trial.whitelist</span>，开放平台通常要求同时带上{' '}
              <span className="font-mono text-xs">user_info,trial.whitelist</span> 才会从「待授权」变为已绑定。请按开放平台指引重新生成链接后再扫一次。
            </p>
            <Link
              to="/login?role=talent"
              className="mt-6 inline-flex rounded-xl bg-violet-600 px-5 py-2.5 text-sm font-semibold text-white hover:bg-violet-700"
            >
              返回登录
            </Link>
          </>
        ) : view === 'error' ? (
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
