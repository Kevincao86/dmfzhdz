import { useEffect, useState } from 'react'
import { Link, useLocation, useNavigate } from 'react-router-dom'
import { cn } from '../cn'
import LoginLegalFooter from '../components/login/LoginLegalFooter'
import LoginPortalNav from '../components/login/LoginPortalNav'
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
    const site = isPartnerEdition() ? '服务商版（fws）' : '商家版（cs）'
    return (
      <div className="flex min-h-[100dvh] flex-col items-center justify-center gap-4 bg-[#f5f7fb] px-6 py-8 text-center">
        <h1 className="text-lg font-semibold text-slate-800">登录服务未配置</h1>
        <p className="max-w-md text-sm leading-relaxed text-slate-500">
          当前 {site} 前端未拿到 Supabase 登录配置，且无法从 <code>/api/meoo-erp-client-config</code>{' '}
          拉取。请在 <strong>新ECS</strong> 构建前填写{' '}
          <code className="text-xs">web版/merchant-erp/.env.production</code>，并在{' '}
          <strong>轻量</strong> auth-api 环境（如 <code>~/stack/auth-api.env</code>）配置同名变量后重新部署。
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
        <p className="max-w-md text-xs text-slate-400">
          构建命令：{' '}
          <code className="text-[11px]">
            MEOO_API_UPSTREAM=https://mofangdianai.com bash scripts/ecs-deploy-merchant-cs-web.sh
          </code>
        </p>
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
      <header className="absolute left-0 right-0 top-[max(0.75rem,env(safe-area-inset-top))] z-10 px-4 sm:px-8">
        <div className="mx-auto flex max-w-5xl items-center justify-between gap-4">
          <LoginPortalNav />
          <Link
            to="/login"
            className="rounded-full bg-gradient-to-r from-cyan-600 to-violet-600 px-4 py-2 text-sm font-semibold text-white shadow-sm hover:opacity-95"
          >
            登录
          </Link>
        </div>
      </header>

      <div className="mb-6 mt-14 flex items-center gap-3">
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
        <LoginLegalFooter />
      </div>
    </div>
  )
}
