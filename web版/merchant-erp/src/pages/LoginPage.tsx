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
import './landing/landingLook.css'

const AUTH_SHELL = cn(
  'relative w-full max-w-md border border-stone-300 bg-white p-6 sm:p-8',
  'shadow-[0_12px_40px_-20px_rgba(22,20,26,0.28)]',
)

export default function LoginPage({ initialMode }: { initialMode?: 'login' | 'register' }) {
  const navigate = useNavigate()
  const location = useLocation()
  const [err, setErr] = useState<string | null>(null)
  const [infoHint, setInfoHint] = useState<string | null>(null)
  const [pendingRef, setPendingRef] = useState<string | null>(null)

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
      <div className="lq-site flex min-h-[100dvh] flex-col items-center justify-center gap-4 bg-[var(--lq-paper)] px-6 py-8 text-center">
        <h1 className="lq-serif text-lg text-[var(--lq-ink)]">登录服务未配置</h1>
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
        <Link to="/" className="text-sm text-[#8e1a12] hover:underline">
          返回首页
        </Link>
      </div>
    )
  }

  return (
    <div
      className={cn(
        'lq-site relative flex min-h-[100dvh] flex-col items-center justify-center overflow-x-hidden px-4 py-10 text-[var(--lq-ink)]',
        'pb-[max(1rem,env(safe-area-inset-bottom))] pt-[max(0.5rem,env(safe-area-inset-top))]',
        'bg-[var(--lq-paper)]',
      )}
    >
      <header className="absolute left-0 right-0 top-[max(0.75rem,env(safe-area-inset-top))] z-10 px-4 sm:px-8">
        <div className="mx-auto flex max-w-5xl items-center justify-between gap-4">
          <LoginPortalNav
            linkClassName="text-stone-600 hover:text-[var(--lq-ink)]"
            activeClassName="font-semibold text-[var(--lq-lacquer-deep)]"
          />
          <Link
            to="/login"
            className="lq-cta rounded-sm px-4 py-2 text-sm"
          >
            进店
          </Link>
        </div>
      </header>

      <div className="mb-6 mt-14 flex items-center gap-3">
        <img src={BRAND_LOGO_URL} alt={BRAND_NAME} className="h-11 w-11 object-contain drop-shadow-sm" />
        <div>
          <p className="lq-serif text-[10px] tracking-[0.16em] text-[var(--lq-brass-dim)]">
            {BRAND_NAME_SHORT} · 本地生活
          </p>
          <h1 className="lq-serif text-xl text-[var(--lq-ink)]">{BRAND_NAME}</h1>
        </div>
      </div>

      <div className={AUTH_SHELL}>
        <div className="mb-4 inline-flex items-center border border-[var(--lq-lacquer)]/25 bg-[var(--lq-steam)] px-3 py-1 text-xs text-[var(--lq-lacquer-deep)]">
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
