import { useEffect, useState } from 'react'
import { Link, useLocation, useNavigate } from 'react-router-dom'
import { cn } from '../cn'
import LoginLegalFooter from '../components/login/LoginLegalFooter'
import LoginPortalNav from '../components/login/LoginPortalNav'
import { editionLabel, isPartnerEdition } from '../lib/appEdition'
import { BRAND_LOGO_URL, BRAND_NAME, BRAND_NAME_SHORT } from '../lib/brand'
import { supabase, supabaseConfigured, missingSupabaseClientEnvKeys } from '../lib/supabaseClient'
import { captureDistributionRefFromSearch } from '../lib/pendingDistributionRef'
import LoginAuthPanel from './login/LoginAuthPanel'

const AUTH_SHELL = cn(
  'relative w-full max-w-md rounded-[28px] border border-white/80 p-6 sm:p-8',
  'bg-white/55 shadow-[0_8px_40px_-12px_rgba(15,23,42,0.12),inset_0_1px_0_rgba(255,255,255,0.9)]',
  'backdrop-blur-2xl backdrop-saturate-150',
)

export default function LoginPage({ initialMode }: { initialMode?: 'login' | 'register' }) {
  const navigate = useNavigate()
  const location = useLocation()
  const [err, setErr] = useState<string | null>(null)
  const [infoHint, setInfoHint] = useState<string | null>(null)
  const [pendingRef, setPendingRef] = useState<string | null>(null)
  const [videoOn, setVideoOn] = useState(true)
  const partner = isPartnerEdition()

  useEffect(() => {
    const ref = captureDistributionRefFromSearch(location.search)
    if (ref) {
      setPendingRef(ref)
      setInfoHint(`已识别推广码 ${ref}，完成注册后将计入对应分销员数据`)
    }
  }, [location.search])

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

  if (!partner) {
    return (
      <div className="relative min-h-[100dvh] bg-[#120c0a] text-[#f6f1ea]">
        {videoOn ? (
          <video
            className="fixed inset-0 h-full w-full object-cover"
            src="/landing/merchant-login-40.mp4"
            poster="/landing/merchant-login-poster.jpg"
            autoPlay
            muted
            loop
            playsInline
            onError={() => setVideoOn(false)}
          />
        ) : (
          <img src="/landing/merchant-login-poster.jpg" alt="" className="fixed inset-0 h-full w-full object-cover" />
        )}
        <div className="pointer-events-none fixed inset-0 bg-[linear-gradient(90deg,rgba(18,12,10,0.12)_0%,rgba(18,12,10,0.08)_40%,rgba(18,12,10,0.42)_100%)]" />
        <div className="relative z-10 flex min-h-[100dvh] flex-col">
          <header className="px-6 pt-6 sm:px-10">
            <LoginPortalNav linkClassName="text-white/85 hover:text-white" activeClassName="text-white" />
          </header>
          <div className="flex flex-1 items-center justify-end overflow-auto px-4 py-8 sm:px-10 lg:pr-16">
            <div className="w-full max-w-[560px]">
              <h1
                className="m-0 font-medium text-[#f6f1ea] [text-shadow:0_2px_18px_rgba(0,0,0,0.45)]"
                style={{
                  fontFamily: '"Noto Serif SC", "Songti SC", serif',
                  fontSize: 'clamp(44px, 4.2vw, 64px)',
                  lineHeight: 1.2,
                  letterSpacing: '0.06em',
                }}
              >
                灵祺
                <span className="mt-1.5 block text-[0.62em] tracking-[0.08em]" style={{ lineHeight: 1.25 }}>
                  AI智能ERP
                </span>
              </h1>
              <p className="mb-8 mt-4 max-w-[20em] text-base text-[#f7f1e8] [text-shadow:0_2px_14px_rgba(0,0,0,0.45)]" style={{ lineHeight: 1.85 }}>
                门店经营、投流和达人合作在同一处。
                <br />
                用商家账号登录工作台。
              </p>
              <div className="w-full rounded-[28px] border border-white/50 bg-[#f4efe6]/70 px-6 py-7 text-[#1a140f] shadow-[0_24px_70px_rgba(0,0,0,0.28)] backdrop-blur-2xl sm:px-8">
                <LoginAuthPanel
                  initialMode={initialMode}
                  pendingRefCode={pendingRef}
                  infoHint={infoHint}
                  err={err}
                  onInfoHint={setInfoHint}
                  onErr={setErr}
                  onLoginSuccess={() => navigate('/home', { replace: true })}
                />
                <LoginLegalFooter />
              </div>
            </div>
          </div>
        </div>
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
          initialMode={initialMode}
          pendingRefCode={pendingRef}
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
