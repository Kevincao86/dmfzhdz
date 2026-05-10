import { useEffect, useState, type FormEvent } from 'react'
import { useLocation, useNavigate } from 'react-router-dom'
import { Cpu, MapPin, ShieldCheck, Sparkles, Store, UtensilsCrossed, Zap } from 'lucide-react'
import { cn } from '../cn'
import { assertTenantAccessAllowed } from '../lib/assertTenantAccessAllowed'
import { supabase, supabaseConfigured } from '../lib/supabaseClient'
import { loginNameToTenantEmail } from '../lib/tenantAuthEmail'
import { PosterDataArt, PosterFutureArt, PosterLocalLifeArt } from './login/LoginPosterArt'

const LIFE_TAGS = [
  { icon: Store, label: '门店与 POI' },
  { icon: UtensilsCrossed, label: '团购到店' },
  { icon: MapPin, label: '同城流量' },
  { icon: Sparkles, label: '内容种草' },
] as const

const POSTER_SLIDES = [
  {
    title: '本地生活 · 一城一味',
    subtitle: '门店 POI、团购核销与到店履约一体化经营。',
    gradient:
      'from-orange-500/35 via-rose-500/20 to-slate-950 ring-1 ring-white/10',
    Icon: Store,
    Art: PosterLocalLifeArt,
  },
  {
    title: '智能经营 · 数据驱动',
    subtitle: '达人招募、经营报表与多平台协同，决策有据可依。',
    gradient:
      'from-cyan-500/30 via-blue-600/25 to-slate-950 ring-1 ring-white/10',
    Icon: Zap,
    Art: PosterDataArt,
  },
  {
    title: '未来门店 · 科技赋能',
    subtitle: '自动化流程与云端协作，让连锁扩张更快、更稳。',
    gradient:
      'from-violet-500/35 via-fuchsia-500/20 to-slate-950 ring-1 ring-white/10',
    Icon: Cpu,
    Art: PosterFutureArt,
  },
] as const

const CAROUSEL_MS = 5200

/**
 * 登录页：大屏左侧表单、右侧品牌海报轮播；小屏纵向堆叠。
 */
export default function LoginPage() {
  const navigate = useNavigate()
  const location = useLocation()
  const [loginName, setLoginName] = useState('')
  const [password, setPassword] = useState('')
  const [err, setErr] = useState<string | null>(null)
  const [infoHint, setInfoHint] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const [slide, setSlide] = useState(0)

  useEffect(() => {
    const st = (location.state ?? null) as { authMessage?: string; infoHint?: string } | null
    if (!st?.authMessage && !st?.infoHint) return
    if (st.authMessage) {
      setErr(st.authMessage)
      setInfoHint(null)
    } else if (st.infoHint) {
      setInfoHint(st.infoHint)
      setErr(null)
    }
    navigate(location.pathname, { replace: true, state: {} })
  }, [location.key, location.pathname, navigate])

  useEffect(() => {
    if (!supabaseConfigured || !supabase) {
      navigate('/', { replace: true })
      return
    }
    const sb = supabase
    void sb.auth.getSession().then(async ({ data }) => {
      if (!data.session) return
      const gate = await assertTenantAccessAllowed(sb)
      if (!gate.ok) {
        await sb.auth.signOut()
        setErr(gate.message)
        return
      }
      navigate('/', { replace: true })
    })
  }, [navigate])

  useEffect(() => {
    const id = window.setInterval(() => {
      setSlide((i) => (i + 1) % POSTER_SLIDES.length)
    }, CAROUSEL_MS)
    return () => window.clearInterval(id)
  }, [])

  const submit = async (e: FormEvent) => {
    e.preventDefault()
    if (!supabase) return
    setErr(null)
    setInfoHint(null)
    const name = loginName.trim()
    if (name.length < 2) {
      setErr('账户名至少 2 个字符')
      return
    }
    if (password.length < 6) {
      setErr('密码至少 6 位')
      return
    }
    setBusy(true)
    try {
      const sb = supabase
      const email = loginNameToTenantEmail(name)
      const { error } = await sb.auth.signInWithPassword({ email, password })
      if (error) {
        setErr(error.message.includes('Invalid login') ? '账号或密码错误' : error.message)
        return
      }
      const gate = await assertTenantAccessAllowed(sb)
      if (!gate.ok) {
        await sb.auth.signOut()
        setErr(gate.message)
        return
      }
      navigate('/', { replace: true })
    } finally {
      setBusy(false)
    }
  }

  if (!supabaseConfigured) {
    return (
      <div className="flex min-h-[100dvh] flex-col items-center justify-center gap-4 bg-slate-950 py-8 pl-[max(1rem,env(safe-area-inset-left))] pr-[max(1rem,env(safe-area-inset-right))] text-center">
        <h1 className="text-lg font-semibold text-white">未配置 Supabase</h1>
        <p className="max-w-md text-sm leading-relaxed text-slate-400">
          请在 <code className="rounded bg-slate-800 px-1.5 py-0.5 text-cyan-200">web版/merchant-erp/.env.local</code>{' '}
          中填写 <code className="text-cyan-200">VITE_SUPABASE_URL</code> 与{' '}
          <code className="text-cyan-200">VITE_SUPABASE_ANON_KEY</code>，保存后重启{' '}
          <code className="text-cyan-200">npm run dev</code>。
        </p>
      </div>
    )
  }

  return (
    <div
      className={cn(
        'relative min-h-[100dvh] min-h-screen overflow-x-hidden bg-slate-950',
        'pb-[max(1rem,env(safe-area-inset-bottom))] pt-[max(0.75rem,env(safe-area-inset-top))]',
      )}
    >
      <div
        className="pointer-events-none fixed inset-0 opacity-35"
        aria-hidden
        style={{
          backgroundImage: `
            radial-gradient(ellipse 70% 45% at 15% 10%, rgba(34, 211, 238, 0.14), transparent),
            radial-gradient(ellipse 55% 40% at 95% 75%, rgba(249, 115, 22, 0.1), transparent),
            linear-gradient(180deg, #020617 0%, #0f172a 50%, #020617 100%)
          `,
        }}
      />
      <div
        className="pointer-events-none fixed inset-0 opacity-[0.1]"
        aria-hidden
        style={{
          backgroundImage: `
            linear-gradient(rgba(34, 211, 238, 0.07) 1px, transparent 1px),
            linear-gradient(90deg, rgba(34, 211, 238, 0.07) 1px, transparent 1px)
          `,
          backgroundSize: '44px 44px',
        }}
      />

      <div className="relative z-[20] mx-auto flex min-h-[100dvh] w-full max-w-[1600px] flex-col lg:flex-row lg:items-stretch">
        {/* 左侧：品牌 + 登录 */}
        <div
          className={cn(
            'flex w-full flex-col justify-center px-[max(1rem,env(safe-area-inset-left))] py-8 sm:py-10 lg:w-[min(100%,520px)] lg:flex-none lg:px-10 xl:w-[min(100%,560px)] xl:px-14',
            'lg:border-r lg:border-white/[0.06]',
          )}
        >
          <header className="mb-6 lg:mb-8">
            <div className="inline-flex items-center gap-2 text-[10px] font-medium uppercase tracking-[0.2em] text-cyan-300/90 sm:text-xs">
              <Zap className="h-3 w-3 shrink-0 sm:h-3.5 sm:w-3.5" />
              Local Life OS
            </div>
            <h1 className="mt-3 text-[clamp(1.6rem,4vw+0.75rem,2.35rem)] font-bold leading-tight tracking-tight text-white">
              店魔方
              <span className="bg-gradient-to-r from-cyan-300 via-white to-orange-200 bg-clip-text text-transparent">
                AI 智能 ERP
              </span>
            </h1>
            <p className="mt-2 max-w-md text-sm leading-relaxed text-slate-400 sm:text-[15px]">
              面向<strong className="font-semibold text-slate-200">本地生活</strong>
              连锁与单店：团购核销、多平台门店、达人招募与经营数据，一站聚合。
            </p>
            <div className="mt-4 flex flex-wrap gap-2">
              {LIFE_TAGS.map(({ icon: Icon, label }) => (
                <span
                  key={label}
                  className="inline-flex items-center gap-1.5 rounded-full border border-white/10 bg-white/5 px-2.5 py-1 text-[11px] font-medium text-slate-200 backdrop-blur-sm sm:text-xs"
                >
                  <Icon className="h-3 w-3 text-cyan-400" aria-hidden />
                  {label}
                </span>
              ))}
            </div>
          </header>

          <div
            className={cn(
              'w-full shrink-0 rounded-3xl border border-white/15 bg-white/95 shadow-2xl shadow-cyan-950/25 ring-1 ring-white/25 backdrop-blur-md',
              'max-h-[min(540px,calc(100dvh-14rem))] overflow-y-auto lg:max-h-[min(600px,calc(100dvh-8rem))]',
            )}
          >
            <div className="sticky top-0 z-[1] border-b border-slate-200/90 bg-gradient-to-r from-slate-50 to-cyan-50/80 px-5 py-3.5">
              <h2 className="text-lg font-bold tracking-tight text-slate-900">商家登录</h2>
              <p className="mt-1 text-xs leading-relaxed text-slate-500">
                输入官方提供的账户名与密码进入工作台。
              </p>
            </div>

            <div className="px-5 pb-6 pt-5 sm:px-7">
              <div className="mb-4 flex items-start gap-3 rounded-xl border border-slate-200/90 bg-slate-50/90 p-3">
                <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-gradient-to-br from-cyan-400/25 to-orange-400/15 ring-1 ring-slate-200/80">
                  <ShieldCheck className="h-5 w-5 text-cyan-700" />
                </div>
                <div className="min-w-0 text-left">
                  <p className="text-xs font-semibold text-slate-800">安全可信登录</p>
                  <p className="mt-0.5 text-[11px] leading-relaxed text-slate-500">经 Supabase Auth 加密传输。</p>
                </div>
              </div>

              {infoHint ? (
                <p className="mb-4 rounded-xl border border-cyan-200/80 bg-cyan-50 px-3 py-2.5 text-center text-sm text-cyan-950">
                  {infoHint}
                </p>
              ) : null}

              <form className="space-y-4" onSubmit={(e) => void submit(e)}>
                <div>
                  <label className="mb-1 block text-xs font-semibold uppercase tracking-wide text-slate-500" htmlFor="meoo-login-name">
                    账户名
                  </label>
                  <input
                    id="meoo-login-name"
                    className="w-full rounded-xl border border-slate-200 bg-white px-3.5 py-2.5 text-base text-slate-900 outline-none focus:border-cyan-400 focus:ring-4 focus:ring-cyan-500/15 sm:text-sm"
                    autoComplete="username"
                    placeholder="例如门店简称或工号"
                    value={loginName}
                    onChange={(e) => setLoginName(e.target.value)}
                  />
                </div>
                <div>
                  <label className="mb-1 block text-xs font-semibold uppercase tracking-wide text-slate-500" htmlFor="meoo-login-pw">
                    密码
                  </label>
                  <input
                    id="meoo-login-pw"
                    type="password"
                    className="w-full rounded-xl border border-slate-200 bg-white px-3.5 py-2.5 text-base text-slate-900 outline-none focus:border-cyan-400 focus:ring-4 focus:ring-cyan-500/15 sm:text-sm"
                    autoComplete="current-password"
                    placeholder="至少 6 位"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                  />
                </div>
                {err ? (
                  <p className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700 ring-1 ring-red-100">{err}</p>
                ) : null}
                <button
                  type="submit"
                  disabled={busy}
                  className="w-full rounded-xl bg-gradient-to-r from-cyan-600 to-teal-600 py-3 text-sm font-semibold text-white shadow-lg shadow-cyan-900/20 disabled:opacity-60"
                >
                  {busy ? '登录中…' : '进入工作台'}
                </button>
              </form>
            </div>
          </div>
        </div>

        {/* 右侧：海报轮播（大屏）；小屏置于表单下方 */}
        <div className="relative flex min-h-[240px] flex-1 flex-col px-[max(1rem,env(safe-area-inset-right))] pb-8 pt-4 lg:min-h-[100dvh] lg:p-6 lg:pl-4 lg:pr-8 lg:pb-10 lg:pt-10">
          <div
            className="relative flex min-h-[220px] flex-1 overflow-hidden rounded-2xl border border-white/[0.08] shadow-[0_24px_80px_-24px_rgba(15,23,42,0.85)] lg:min-h-0 lg:rounded-3xl"
            role="region"
            aria-roledescription="carousel"
            aria-label="品牌海报轮播"
          >
            {POSTER_SLIDES.map((s, i) => {
              const Icon = s.Icon
              const Art = s.Art
              const active = i === slide
              return (
                <article
                  key={s.title}
                  aria-hidden={!active}
                  className={cn(
                    'absolute inset-0 flex flex-col justify-end transition-opacity duration-[780ms] ease-out',
                    active ? 'z-10 opacity-100' : 'z-0 opacity-0',
                  )}
                >
                  <div
                    className={cn(
                      'absolute inset-0 bg-gradient-to-br bg-slate-950',
                      'before:pointer-events-none before:absolute before:inset-0 before:bg-[radial-gradient(circle_at_20%_15%,rgba(255,255,255,0.14),transparent_42%)]',
                      'after:pointer-events-none after:absolute after:inset-0 after:bg-[linear-gradient(115deg,transparent_35%,rgba(255,255,255,0.06)_48%,transparent_62%)]',
                    )}
                  />
                  <div
                    className={cn(
                      'absolute inset-[1px] rounded-[inherit] bg-gradient-to-br opacity-95',
                      s.gradient,
                    )}
                  />
                  <div className="pointer-events-none absolute inset-x-[-6%] bottom-[-5%] top-[6%] z-[1] overflow-hidden rounded-[inherit] opacity-[0.97]">
                    <Art className="h-full w-full" preserveAspectRatio="xMidYMid slice" />
                  </div>
                  <div
                    className="pointer-events-none absolute inset-0 z-[2] opacity-[0.12]"
                    aria-hidden
                    style={{
                      backgroundImage: `
                        linear-gradient(rgba(255,255,255,0.06) 1px, transparent 1px),
                        linear-gradient(90deg, rgba(255,255,255,0.06) 1px, transparent 1px)
                      `,
                      backgroundSize: '28px 28px',
                    }}
                  />
                  <div className="relative z-[3] flex flex-1 flex-col justify-between p-6 sm:p-8 lg:p-10">
                    <div className="flex items-start justify-between gap-4">
                      <div className="inline-flex items-center gap-2 rounded-full border border-white/15 bg-black/20 px-3 py-1 text-[10px] font-semibold uppercase tracking-[0.22em] text-white/90 backdrop-blur-md">
                        <Sparkles className="h-3.5 w-3.5 text-cyan-200" aria-hidden />
                        Local × Tech
                      </div>
                      <div className="flex h-12 w-12 items-center justify-center rounded-2xl border border-white/15 bg-black/25 text-white shadow-lg backdrop-blur-md sm:h-14 sm:w-14">
                        <Icon className="h-6 w-6 sm:h-7 sm:w-7" aria-hidden />
                      </div>
                    </div>
                    <div className="mt-auto max-w-xl">
                      <h2 className="text-[clamp(1.35rem,2.5vw+0.6rem,2.2rem)] font-bold leading-tight text-white drop-shadow-sm">
                        {s.title}
                      </h2>
                      <p className="mt-3 max-w-md text-sm leading-relaxed text-white/85 sm:text-base">{s.subtitle}</p>
                    </div>
                  </div>
                </article>
              )
            })}

            <div className="pointer-events-none absolute bottom-4 left-0 right-0 z-[3] flex justify-center gap-2 sm:bottom-6">
              {POSTER_SLIDES.map((_, i) => (
                <span
                  key={i}
                  className={cn(
                    'h-2 rounded-full transition-all duration-500',
                    i === slide ? 'w-8 bg-white shadow-[0_0_16px_rgba(255,255,255,0.35)]' : 'w-2 bg-white/35',
                  )}
                  aria-hidden
                />
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
