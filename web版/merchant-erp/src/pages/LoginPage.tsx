import { useEffect, useState } from 'react'
import { useLocation, useNavigate } from 'react-router-dom'
import { BarChart3, MapPin, Sparkles, Store, Users, Zap } from 'lucide-react'
import { cn } from '../cn'
import { BRAND_LOGO_URL, BRAND_NAME, BRAND_NAME_SHORT } from '../lib/brand'
import { supabase, supabaseConfigured } from '../lib/supabaseClient'
import LoginAuthPanel from './login/LoginAuthPanel'
import { PosterPgyTechArt } from './login/LoginPosterArt'

const FEATURES = [
  { icon: Store, label: '多平台门店', desc: '抖音 · 美团 · 小红书' },
  { icon: Users, label: '达人招募', desc: '全流程协同管理' },
  { icon: BarChart3, label: '经营数据', desc: '报表与智能决策' },
  { icon: MapPin, label: '本地生活', desc: '团购核销与到店' },
] as const

const FLOAT_STATS = [
  { label: '本月核销', value: '12.8万', trend: '+18%' },
  { label: '在招达人', value: '326', trend: '活跃' },
] as const

/** 大屏左侧插画固定高度，避免右侧切换注册时挤压变形 */
const POSTER_HEIGHT_CLASS =
  'h-[min(52vh,500px)] min-h-[400px] max-h-[500px] shrink-0'

/** 右侧玻璃区：至少与左侧插画同高，内容多时可向下延伸；超高时在视口内滚动 */
const AUTH_PANEL_SHELL_CLASS = cn(
  'relative rounded-[28px] border border-white/70 p-6 sm:p-8',
  'bg-white/35 shadow-[0_8px_40px_-12px_rgba(15,23,42,0.12),inset_0_1px_0_rgba(255,255,255,0.85)]',
  'backdrop-blur-2xl backdrop-saturate-150',
  'min-h-[max(400px,min(52vh,500px))]',
  'max-h-[calc(100dvh-7rem)] overflow-y-auto overscroll-contain',
)

/**
 * 登录页：参照蒲公英 PGY — 顶栏品牌 + 左右主模块顶对齐；左侧插画尺寸固定。
 */
export default function LoginPage() {
  const navigate = useNavigate()
  const location = useLocation()
  const [err, setErr] = useState<string | null>(null)
  const [infoHint, setInfoHint] = useState<string | null>(null)

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
    void sb.auth.getSession().then(({ data }) => {
      if (!data.session) return
      navigate('/', { replace: true })
    })
  }, [navigate])

  if (!supabaseConfigured) {
    return (
      <div className="flex min-h-[100dvh] flex-col items-center justify-center gap-4 bg-[#f5f7fb] px-6 py-8 text-center">
        <h1 className="text-lg font-semibold text-slate-800">登录服务未配置</h1>
        <p className="max-w-md text-sm leading-relaxed text-slate-500">
          当前环境缺少商户登录所需配置，请联系管理员或在部署环境中补全相关环境变量后重启服务。
        </p>
      </div>
    )
  }

  return (
    <div
      className={cn(
        'relative min-h-[100dvh] min-h-screen overflow-x-hidden bg-[#f3f6fc]',
        'pb-[max(1rem,env(safe-area-inset-bottom))] pt-[max(0.5rem,env(safe-area-inset-top))]',
      )}
    >
      <div
        className="pointer-events-none fixed inset-0"
        aria-hidden
        style={{
          background: `
            radial-gradient(ellipse 80% 60% at 8% 20%, rgba(14, 165, 233, 0.12), transparent 55%),
            radial-gradient(ellipse 70% 50% at 92% 80%, rgba(139, 92, 246, 0.1), transparent 50%),
            radial-gradient(ellipse 50% 40% at 50% 0%, rgba(45, 212, 191, 0.08), transparent 45%),
            linear-gradient(165deg, #f8fafc 0%, #eef4ff 42%, #f5f3ff 100%)
          `,
        }}
      />
      <div
        className="pointer-events-none fixed inset-0 opacity-[0.35]"
        aria-hidden
        style={{
          backgroundImage: `
            linear-gradient(rgba(148, 163, 184, 0.12) 1px, transparent 1px),
            linear-gradient(90deg, rgba(148, 163, 184, 0.12) 1px, transparent 1px)
          `,
          backgroundSize: '48px 48px',
        }}
      />

      <div className="relative z-10 mx-auto w-full max-w-[1440px] px-6 py-8 sm:px-10 lg:px-12 lg:py-10 xl:px-16">
        <header className="relative z-20 mb-6 lg:mb-8">
          <div className="flex items-center gap-3">
            <img
              src={BRAND_LOGO_URL}
              alt={BRAND_NAME}
              className="h-12 w-12 object-contain drop-shadow-sm sm:h-14 sm:w-14"
            />
            <div>
              <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-400">
                MoDian · Local Life OS
              </p>
              <h1 className="text-xl font-bold tracking-tight sm:text-2xl">
                <span className="text-slate-900">{BRAND_NAME_SHORT}</span>
                <span className="bg-gradient-to-r from-cyan-500 via-blue-600 to-violet-600 bg-clip-text text-transparent">
                  AI智能ERP
                </span>
              </h1>
            </div>
          </div>
          <p className="mt-4 max-w-2xl text-sm leading-relaxed text-slate-600 sm:text-[15px]">
            面向本地生活商家的智能经营系统：多平台门店、达人招募、投流与财务对账，一站协同。
          </p>
        </header>

        <div className="flex flex-col gap-8 lg:flex-row lg:items-start lg:gap-10 xl:gap-12">
          {/* 左侧：固定高度插画 */}
          <div className="flex min-w-0 flex-1 flex-col">
            <div className={cn('relative hidden overflow-hidden rounded-[28px] lg:block', POSTER_HEIGHT_CLASS)}>
              <div className="absolute inset-0 overflow-hidden rounded-[28px] border border-white/80 bg-white/40 shadow-[0_24px_80px_-20px_rgba(15,23,42,0.12)] backdrop-blur-sm">
                <PosterPgyTechArt className="h-full w-full object-cover" preserveAspectRatio="xMidYMid slice" />
                <div className="pointer-events-none absolute inset-0 bg-gradient-to-t from-white/30 via-transparent to-white/10" />
              </div>

              <div className="absolute left-4 top-8 z-10 hidden xl:block">
                <div className="rounded-2xl border border-white/90 bg-white/95 px-4 py-3 shadow-lg shadow-slate-200/60 backdrop-blur-md">
                  <p className="text-[10px] font-medium uppercase tracking-wider text-slate-400">实时经营</p>
                  <p className="mt-1 text-2xl font-bold tabular-nums text-slate-900">{FLOAT_STATS[0].value}</p>
                  <p className="mt-0.5 text-xs font-semibold text-emerald-600">{FLOAT_STATS[0].trend}</p>
                </div>
              </div>

              <div className="absolute bottom-16 right-6 z-10 hidden xl:block">
                <div className="rounded-2xl border border-white/90 bg-white/95 px-4 py-3 shadow-lg shadow-slate-200/60 backdrop-blur-md">
                  <p className="text-[10px] font-medium text-slate-400">{FLOAT_STATS[1].label}</p>
                  <p className="mt-1 text-xl font-bold text-slate-900">{FLOAT_STATS[1].value}</p>
                </div>
              </div>

              <div className="absolute bottom-6 left-6 right-6 z-10 rounded-2xl border border-white/70 bg-white/80 px-5 py-4 shadow-md backdrop-blur-md">
                <div className="flex items-center gap-2 text-xs font-semibold text-cyan-700">
                  <Sparkles className="h-3.5 w-3.5" aria-hidden />
                  智能经营 · 数据驱动
                </div>
                <p className="mt-1 text-sm text-slate-600">
                  达人招募、经营报表与多平台协同，让每一次决策都有数据支撑。
                </p>
              </div>
            </div>

            <div className={cn('relative mb-6 overflow-hidden rounded-2xl lg:hidden', POSTER_HEIGHT_CLASS)}>
              <PosterPgyTechArt className="h-full w-full object-cover" preserveAspectRatio="xMidYMid slice" />
            </div>

            <div className="grid grid-cols-2 gap-3 sm:grid-cols-4 lg:grid-cols-2 lg:gap-4 xl:grid-cols-4">
              {FEATURES.map(({ icon: Icon, label, desc }) => (
                <div
                  key={label}
                  className="rounded-2xl border border-white/90 bg-white/70 px-3 py-3 shadow-sm backdrop-blur-sm transition hover:border-cyan-200/80 hover:shadow-md sm:px-4 sm:py-3.5"
                >
                  <Icon className="h-4 w-4 text-cyan-600" aria-hidden />
                  <p className="mt-2 text-xs font-semibold text-slate-800 sm:text-sm">{label}</p>
                  <p className="mt-0.5 text-[10px] text-slate-500 sm:text-[11px]">{desc}</p>
                </div>
              ))}
            </div>
          </div>

          {/* 右侧：玻璃登录区，与左侧插画顶对齐；内容过高时内部滚动 */}
          <div className="relative w-full shrink-0 lg:w-[min(100%,520px)] xl:w-[540px]">
            <div
              className="pointer-events-none absolute inset-0 overflow-hidden rounded-[28px]"
              aria-hidden
            >
              <div className="absolute -right-12 -top-16 h-48 w-48 rounded-full bg-cyan-400/25 blur-3xl" />
              <div className="absolute -bottom-20 -left-8 h-56 w-56 rounded-full bg-violet-400/20 blur-3xl" />
              <div className="absolute left-1/2 top-1/3 h-32 w-32 -translate-x-1/2 rounded-full bg-teal-300/15 blur-2xl" />
            </div>

            <div className={AUTH_PANEL_SHELL_CLASS}>
              <div className="mb-6 lg:hidden">
                <div className="inline-flex items-center gap-1.5 rounded-full border border-white/60 bg-white/50 px-3 py-1 text-[11px] font-semibold text-cyan-800 shadow-sm backdrop-blur-sm">
                  <Zap className="h-3 w-3" aria-hidden />
                  商家工作台
                </div>
              </div>

              <LoginAuthPanel
                infoHint={infoHint}
                err={err}
                onInfoHint={setInfoHint}
                onErr={setErr}
                onLoginSuccess={() => navigate('/', { replace: true })}
              />

              <p className="mt-6 text-center text-[11px] leading-relaxed text-slate-500/90">
                登录即表示同意平台服务条款与隐私政策 · 数据经加密传输与存储
              </p>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
