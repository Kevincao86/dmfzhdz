import { useEffect, useState, type FormEvent } from 'react'
import { useLocation, useNavigate } from 'react-router-dom'
import { MapPin, ShieldCheck, Sparkles, Store, UtensilsCrossed, Zap } from 'lucide-react'
import { cn } from '../cn'
import { assertTenantAccessAllowed } from '../lib/assertTenantAccessAllowed'
import { supabase, supabaseConfigured } from '../lib/supabaseClient'
import { loginNameToTenantEmail } from '../lib/tenantAuthEmail'

const LIFE_TAGS = [
  { icon: Store, label: '门店与 POI' },
  { icon: UtensilsCrossed, label: '团购到店' },
  { icon: MapPin, label: '同城流量' },
  { icon: Sparkles, label: '内容种草' },
] as const

/**
 * 登录页：静态布局，品牌区 + 登录表单；无拉链/撕开等动效。
 */
export default function LoginPage() {
  const navigate = useNavigate()
  const location = useLocation()
  const [loginName, setLoginName] = useState('')
  const [password, setPassword] = useState('')
  const [err, setErr] = useState<string | null>(null)
  const [infoHint, setInfoHint] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

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
        'relative min-h-[100dvh] min-h-screen overflow-x-hidden overflow-y-auto bg-slate-950',
        'pb-[max(1.5rem,env(safe-area-inset-bottom))] pt-[max(1rem,env(safe-area-inset-top))]',
      )}
    >
      <div
        className="pointer-events-none fixed inset-0 opacity-40"
        aria-hidden
        style={{
          backgroundImage: `
            radial-gradient(ellipse 80% 50% at 50% -20%, rgba(34, 211, 238, 0.18), transparent),
            radial-gradient(ellipse 60% 40% at 100% 60%, rgba(20, 184, 166, 0.12), transparent),
            linear-gradient(180deg, #020617 0%, #0f172a 45%, #020617 100%)
          `,
        }}
      />
      <div
        className="pointer-events-none fixed inset-0 opacity-[0.12]"
        aria-hidden
        style={{
          backgroundImage: `
            linear-gradient(rgba(34, 211, 238, 0.08) 1px, transparent 1px),
            linear-gradient(90deg, rgba(34, 211, 238, 0.08) 1px, transparent 1px)
          `,
          backgroundSize: '40px 40px',
        }}
      />

      <div className="relative z-[20] mx-auto flex w-full max-w-[min(100%,42rem)] flex-col gap-6 pl-[max(1rem,env(safe-area-inset-left))] pr-[max(1rem,env(safe-area-inset-right))] sm:gap-8 sm:py-10 md:py-14">
        <header className="text-center sm:text-left">
          <div className="inline-flex items-center gap-2 text-[10px] font-medium uppercase tracking-[0.2em] text-cyan-300/90 sm:text-xs">
            <Zap className="h-3 w-3 shrink-0 sm:h-3.5 sm:w-3.5" />
            Local Life OS
          </div>
          <h1 className="mt-4 text-[clamp(1.75rem,5vw+1rem,2.5rem)] font-bold leading-tight tracking-tight text-white">
            店魔方
            <span className="bg-gradient-to-r from-cyan-300 via-white to-orange-200 bg-clip-text text-transparent">
              AI 智能 ERP
            </span>
          </h1>
          <p className="mx-auto mt-3 max-w-xl text-sm leading-relaxed text-slate-400 sm:mx-0 sm:text-base">
            面向<strong className="font-semibold text-slate-200">本地生活</strong>
            连锁与单店：团购核销、多平台门店、达人招募与经营数据，一站聚合。
          </p>
          <div className="mt-6 flex flex-wrap justify-center gap-2 sm:justify-start">
            {LIFE_TAGS.map(({ icon: Icon, label }) => (
              <span
                key={label}
                className="inline-flex items-center gap-1.5 rounded-full border border-white/10 bg-white/5 px-3 py-1.5 text-[11px] font-medium text-slate-200 backdrop-blur-sm sm:text-xs"
              >
                <Icon className="h-3 w-3 text-cyan-400" aria-hidden />
                {label}
              </span>
            ))}
          </div>
          <div className="mx-auto mt-8 flex max-w-xl items-start gap-3 rounded-xl border border-white/10 bg-slate-950/60 p-3 backdrop-blur-sm sm:mx-0">
            <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-gradient-to-br from-cyan-400/25 to-orange-400/15 ring-1 ring-white/10">
              <ShieldCheck className="h-5 w-5 text-cyan-200" />
            </div>
            <div className="min-w-0 text-left">
              <p className="text-sm font-semibold text-slate-100">安全可信登录</p>
              <p className="mt-0.5 text-xs leading-relaxed text-slate-500">
                使用运营端开通的账户名与密码，经 Supabase Auth 加密传输；与微信小程序共用同一租户数据。
              </p>
            </div>
          </div>
        </header>

        <div
          className={cn(
            'w-full shrink-0 rounded-3xl border border-white/15 bg-white/95 shadow-2xl shadow-cyan-950/25 ring-1 ring-white/25 backdrop-blur-md',
            'max-h-[min(560px,calc(100dvh-12rem))] overflow-y-auto sm:max-h-[min(620px,calc(100dvh-10rem))]',
          )}
        >
          <div className="sticky top-0 z-[1] border-b border-slate-200/90 bg-gradient-to-r from-slate-50 to-cyan-50/80 px-5 py-3.5">
            <h2 className="text-lg font-bold tracking-tight text-slate-900">商家登录</h2>
            <p className="mt-1 text-xs leading-relaxed text-slate-500">
              输入运营端开通的账户名与密码进入工作台（Web 与小程序数据一致）。
            </p>
          </div>

          <div className="px-5 pb-6 pt-5 sm:px-7">
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
    </div>
  )
}
