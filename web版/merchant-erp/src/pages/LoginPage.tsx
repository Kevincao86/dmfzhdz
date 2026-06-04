import { useEffect, useState } from 'react'
import { Link, useLocation, useNavigate } from 'react-router-dom'
import { ArrowLeft } from 'lucide-react'
import { cn } from '../cn'
import { editionLabel, isPartnerEdition } from '../lib/appEdition'
import { BRAND_LOGO_URL, BRAND_NAME, BRAND_NAME_SHORT } from '../lib/brand'
import { supabase, supabaseConfigured, missingSupabaseClientEnvKeys } from '../lib/supabaseClient'
import LoginAuthPanel from './login/LoginAuthPanel'

const AUTH_SHELL = cn(
  'relative w-full max-w-md rounded-[28px] border border-white/80 p-6 sm:p-8',
  'bg-white/55 shadow-[0_8px_40px_-12px_rgba(15,23,42,0.12),inset_0_1px_0_rgba(255,255,255,0.9)]',
  'backdrop-blur-2xl backdrop-saturate-150',
)

export default function LoginPage() {
  const navigate = useNavigate()
  const location = useLocation()
  const [err, setErr] = useState<string | null>(null)
  const [infoHint, setInfoHint] = useState<string | null>(null)

  useEffect(() => {
    const st = (location.state ?? null) as {
      authMessage?: string
      infoHint?: string
      fromLogout?: boolean
    } | null
    if (!st?.authMessage && !st?.infoHint) return
    if (st.authMessage) {
      setErr(st.authMessage)
      setInfoHint(null)
    } else if (st.infoHint) {
      setInfoHint(st.infoHint)
      setErr(null)
    }
    navigate(location.pathname, { replace: true, state: { fromLogout: st.fromLogout } })
  }, [location.key, location.pathname, navigate])

  useEffect(() => {
    if (!supabaseConfigured || !supabase) return

    const fromLogout = (location.state as { fromLogout?: boolean } | null)?.fromLogout
    if (fromLogout) {
      const sb = supabase
      void sb.auth.getSession().then(({ data }) => {
        if (data.session) void sb.auth.signOut()
      })
      return
    }

    const sb = supabase
    void sb.auth.getSession().then(({ data }) => {
      if (data.session) navigate('/home', { replace: true })
    })
  }, [navigate, location.state])

  if (!supabaseConfigured) {
    const missing = missingSupabaseClientEnvKeys()
    const site = isPartnerEdition() ? '服务商版（fws）' : '商家版'
    return (
      <div className="flex min-h-[100dvh] flex-col items-center justify-center gap-4 bg-[#f5f7fb] px-6 py-8 text-center">
        <h1 className="text-lg font-semibold text-slate-800">登录服务未配置</h1>
        <p className="max-w-md text-sm leading-relaxed text-slate-500">
          当前 {site} 前端构建时未注入 Supabase 登录配置。请在对应 Vercel 项目的 Environment
          Variables 中补全下列变量（Production 与 Preview 建议一致），保存后重新 Deploy。
        </p>
        {missing.length > 0 ? (
          <ul className="max-w-md list-inside list-disc text-left text-sm text-slate-600">
            {missing.map((k) => (
              <li key={k}>
                <code className="text-xs text-slate-800">{k}</code>
              </li>
            ))}
          </ul>
        ) : null}
        <Link to="/" className="text-sm text-cyan-700 hover:underline">
          返回首页
        </Link>
      </div>
    )
  }

  return (
    <div
      className={cn(
        'relative flex min-h-[100dvh] flex-col items-center justify-center overflow-x-hidden px-4 py-10 text-slate-900',
        'pb-[max(1rem,env(safe-area-inset-bottom))] pt-[max(0.5rem,env(safe-area-inset-top))]',
      )}
      style={{
        background: `
          radial-gradient(ellipse 75% 55% at 12% 18%, rgba(56, 189, 248, 0.14), transparent 55%),
          radial-gradient(ellipse 65% 50% at 88% 82%, rgba(139, 92, 246, 0.12), transparent 50%),
          linear-gradient(165deg, #f8fafc 0%, #eef4ff 42%, #f0fdfa 100%)
        `,
      }}
    >
      <Link
        to="/"
        className="absolute left-4 top-[max(1rem,env(safe-area-inset-top))] z-10 inline-flex items-center gap-1.5 rounded-full border border-slate-200/80 bg-white/80 px-3 py-2 text-sm text-slate-600 shadow-sm backdrop-blur-sm hover:text-cyan-700 sm:left-8"
      >
        <ArrowLeft className="h-4 w-4" aria-hidden />
        返回首页
      </Link>

      <div className="mb-6 flex items-center gap-3">
        <img src={BRAND_LOGO_URL} alt={BRAND_NAME} className="h-11 w-11 object-contain drop-shadow-sm" />
        <div>
          <p className="text-[10px] font-semibold uppercase tracking-[0.16em] text-slate-400">
            LingQi · Local Life OS
          </p>
          <h1 className="text-lg font-bold text-slate-900">
            {BRAND_NAME_SHORT}
            <span className="bg-gradient-to-r from-cyan-600 to-violet-600 bg-clip-text text-transparent">
              AI智能ERP
            </span>
          </h1>
        </div>
      </div>

      <div className={AUTH_SHELL}>
        <div className="mb-4 inline-flex items-center rounded-full border border-cyan-200 bg-cyan-50 px-3 py-1 text-xs font-semibold text-cyan-800">
          当前版本 · {editionLabel()}
        </div>
        <LoginAuthPanel
          infoHint={infoHint}
          err={err}
          onInfoHint={setInfoHint}
          onErr={setErr}
          onLoginSuccess={() => navigate('/home', { replace: true })}
        />
        <p className="mt-6 text-center text-[11px] leading-relaxed text-slate-500">
          登录即表示同意平台服务条款与隐私政策 · 数据经加密传输与存储
        </p>
      </div>
    </div>
  )
}
