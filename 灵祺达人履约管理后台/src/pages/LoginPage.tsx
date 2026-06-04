import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import {
  BarChart3,
  ClipboardList,
  MessageCircle,
  Sparkles,
  Target,
  Users,
  Zap,
} from 'lucide-react'
import { cn } from '../cn'
import { passwordLogin, scanCreate, scanPoll, switchRole } from '../lib/mpApi'
import {
  enterDevPreview,
  getLoginRolePref,
  setActiveRole,
  setLoginRolePref,
  setSession,
  type MpAccountRole,
} from '../lib/mpSession'
import TalentLoginAuthPanel, { type LoginTab } from './login/TalentLoginAuthPanel'
import { LoginHeroImage } from './login/LoginXingtuPosterArt'

const FEATURES = [
  { icon: Sparkles, label: 'AI 智能撮合', desc: '高契合商单自动置顶' },
  { icon: ClipboardList, label: '履约账本', desc: '接单 · 探店 · 结算' },
  { icon: Users, label: 'PR 发单', desc: '招募 · 反选 · 群码' },
  { icon: MessageCircle, label: '消息协同', desc: '入选通知一站触达' },
] as const

const FLOAT_STATS = [
  { label: 'AI 匹配达人', value: '326+', trend: '本周活跃' },
  { label: '履约完成率', value: '96%', trend: '+12%' },
] as const

const POSTER_HEIGHT =
  'h-[min(52vh,500px)] min-h-[400px] max-h-[500px] shrink-0'

const AUTH_SHELL = cn(
  'relative rounded-[28px] border border-white/80 p-6 sm:p-8',
  'bg-white/45 shadow-[0_8px_40px_-12px_rgba(15,23,42,0.1),inset_0_1px_0_rgba(255,255,255,0.9)]',
  'backdrop-blur-2xl backdrop-saturate-150',
  'min-h-[max(400px,min(52vh,500px))]',
  'max-h-[calc(100dvh-7rem)] overflow-y-auto overscroll-contain',
)

async function applyRoleAfterLogin(
  token: string,
  account: import('../lib/mpSession').MpAccount,
  pref: MpAccountRole,
) {
  setSession(token, account)
  setActiveRole(pref)
  if (account.activeRole !== pref) {
    try {
      const { account: next } = await switchRole(pref)
      setSession(token, next)
      setActiveRole(pref)
    } catch {
      setActiveRole(pref)
    }
  }
}

export default function LoginPage() {
  const nav = useNavigate()
  const [tab, setTab] = useState<LoginTab>('password')
  const [loginName, setLoginName] = useState('')
  const [password, setPassword] = useState('')
  const [err, setErr] = useState('')
  const [loading, setLoading] = useState(false)
  const [ticket, setTicket] = useState('')
  const [qrPayload, setQrPayload] = useState('')
  const [scanHint, setScanHint] = useState('')
  const [loginRole, setLoginRole] = useState<MpAccountRole>(getLoginRolePref)

  function onLoginRoleChange(role: MpAccountRole) {
    setLoginRole(role)
    setLoginRolePref(role)
  }

  useEffect(() => {
    if (tab !== 'scan') return
    let cancelled = false
    ;(async () => {
      try {
        const s = await scanCreate()
        if (cancelled) return
        setTicket(s.ticket)
        setQrPayload(s.qrPayload)
        setScanHint('请使用微信扫描二维码（资质配置后自动确认）')
      } catch (e) {
        setScanHint(e instanceof Error ? e.message : '扫码初始化失败')
      }
    })()
    return () => {
      cancelled = true
    }
  }, [tab])

  useEffect(() => {
    if (!ticket || tab !== 'scan') return
    const t = setInterval(async () => {
      try {
        const r = await scanPoll(ticket)
        if (r.status === 'confirmed' && r.token && r.account) {
          await applyRoleAfterLogin(r.token, r.account, loginRole)
          nav('/hall', { replace: true })
        } else if (r.message) setScanHint(r.message)
      } catch (_) {}
    }, 2500)
    return () => clearInterval(t)
  }, [ticket, tab, nav, loginRole])

  async function onPasswordLogin() {
    setErr('')
    setLoading(true)
    try {
      const { token, account } = await passwordLogin(loginName.trim(), password)
      await applyRoleAfterLogin(token, account, loginRole)
      nav('/hall', { replace: true })
    } catch (e) {
      setErr(e instanceof Error ? e.message : '登录失败')
    } finally {
      setLoading(false)
    }
  }

  function onDevPreview() {
    enterDevPreview(loginRole)
    nav('/hall', { replace: true })
  }

  return (
    <div
      className={cn(
        'relative min-h-[100dvh] min-h-screen overflow-x-hidden text-slate-900',
        'pb-[max(1rem,env(safe-area-inset-bottom))] pt-[max(0.5rem,env(safe-area-inset-top))]',
      )}
      style={{
        background: `
          radial-gradient(ellipse 75% 55% at 12% 18%, rgba(56, 189, 248, 0.14), transparent 55%),
          radial-gradient(ellipse 65% 50% at 88% 82%, rgba(139, 92, 246, 0.12), transparent 50%),
          linear-gradient(165deg, #f8fafc 0%, #eef4ff 42%, #faf5ff 100%)
        `,
      }}
    >
      <div
        className="pointer-events-none fixed inset-0 opacity-[0.32]"
        aria-hidden
        style={{
          backgroundImage: `
            linear-gradient(rgba(148, 163, 184, 0.1) 1px, transparent 1px),
            linear-gradient(90deg, rgba(148, 163, 184, 0.1) 1px, transparent 1px)
          `,
          backgroundSize: '48px 48px',
        }}
      />

      <div className="relative z-10 mx-auto w-full max-w-[1440px] px-6 py-8 sm:px-10 lg:px-12 lg:py-10 xl:px-16">
        <header className="mb-6 flex flex-wrap items-center justify-between gap-4 lg:mb-8">
          <div className="flex items-center gap-3">
            <img
              src="/logo.png"
              alt="灵祺"
              className="h-12 w-12 rounded-2xl object-contain shadow-sm sm:h-14 sm:w-14"
            />
            <div>
              <p className="text-[11px] font-semibold uppercase tracking-[0.2em] text-slate-400">
                LingQi · Talent Fulfillment
              </p>
              <h1 className="text-xl font-bold tracking-tight sm:text-2xl">
                <span className="text-slate-900">灵祺达人</span>
                <span className="bg-gradient-to-r from-violet-600 via-indigo-600 to-cyan-500 bg-clip-text text-transparent">
                  履约管理后台
                </span>
              </h1>
            </div>
          </div>
          <a
            href="https://www.xingtu.cn/"
            target="_blank"
            rel="noopener noreferrer"
            className="hidden text-xs text-slate-400 hover:text-violet-600 sm:inline"
          >
            设计灵感 · 巨量星图
          </a>
        </header>

        <div className="mb-8 max-w-3xl">
          <div className="inline-flex items-center gap-2 rounded-full border border-violet-200/80 bg-white/70 px-4 py-1.5 text-xs font-semibold text-violet-800 shadow-sm backdrop-blur-sm">
            <Zap className="h-3.5 w-3.5" aria-hidden />
            AI 智能撮合 · 本地生活达人履约
          </div>
          <h2 className="mt-4 text-3xl font-extrabold leading-tight tracking-tight text-slate-900 sm:text-4xl lg:text-[2.35rem]">
            好撮合，
            <span className="bg-gradient-to-r from-violet-600 to-cyan-500 bg-clip-text text-transparent">
              成就好履约
            </span>
          </h2>
          <p className="mt-3 text-sm leading-relaxed text-slate-600 sm:text-base">
            参照星图式达人营销体验：完善资料后 AI 置顶高契合商单，PR 智能荐达人，招募、群码与私信在同一平台完成。
          </p>
        </div>

        <div className="flex flex-col gap-8 lg:flex-row lg:items-start lg:gap-10 xl:gap-12">
          <div className="flex min-w-0 flex-1 flex-col">
            <div className={cn('relative hidden overflow-hidden rounded-[28px] lg:block', POSTER_HEIGHT)}>
              <div className="absolute inset-0 overflow-hidden rounded-[28px] border border-white/90 bg-white/50 shadow-[0_24px_80px_-24px_rgba(15,23,42,0.15)]">
                <LoginHeroImage className="h-full w-full object-cover object-center" />
                <div className="pointer-events-none absolute inset-0 bg-gradient-to-t from-white/50 via-white/5 to-transparent" />
                <div className="pointer-events-none absolute inset-0 bg-gradient-to-r from-white/30 via-transparent to-transparent" />
              </div>

              <div className="absolute left-5 top-6 z-10 hidden xl:block">
                <div className="rounded-2xl border border-white/95 bg-white/95 px-4 py-3 shadow-lg shadow-slate-200/50">
                  <p className="text-[10px] font-medium uppercase tracking-wider text-slate-400">
                    {FLOAT_STATS[0].label}
                  </p>
                  <p className="mt-1 text-2xl font-bold tabular-nums text-slate-900">{FLOAT_STATS[0].value}</p>
                  <p className="mt-0.5 text-xs font-semibold text-violet-600">{FLOAT_STATS[0].trend}</p>
                </div>
              </div>

              <div className="absolute bottom-20 right-6 z-10 hidden xl:block">
                <div className="rounded-2xl border border-white/95 bg-white/95 px-4 py-3 shadow-lg shadow-slate-200/50">
                  <p className="text-[10px] font-medium text-slate-400">{FLOAT_STATS[1].label}</p>
                  <p className="mt-1 text-xl font-bold text-slate-900">{FLOAT_STATS[1].value}</p>
                  <p className="mt-0.5 text-xs font-semibold text-emerald-600">{FLOAT_STATS[1].trend}</p>
                </div>
              </div>

              <div className="absolute bottom-5 left-5 right-5 z-10 rounded-2xl border border-white/80 bg-white/85 px-5 py-4 shadow-md backdrop-blur-md">
                <div className="flex items-center gap-2 text-xs font-semibold text-violet-700">
                  <Target className="h-3.5 w-3.5" aria-hidden />
                  达人影响力，就是履约生产力
                </div>
                <p className="mt-1 text-sm text-slate-600">
                  与招募小程序数据互通 · 一微信一账号 · 达人版与 PR 版随时切换
                </p>
              </div>
            </div>

            <div className={cn('relative mb-6 overflow-hidden rounded-2xl lg:hidden', POSTER_HEIGHT)}>
              <LoginHeroImage className="h-full w-full object-cover" />
              <div className="absolute inset-0 bg-gradient-to-t from-white/60 to-transparent" />
            </div>

            <div className="grid grid-cols-2 gap-3 sm:grid-cols-4 lg:grid-cols-2 lg:gap-4 xl:grid-cols-4">
              {FEATURES.map(({ icon: Icon, label, desc }) => (
                <div
                  key={label}
                  className="rounded-2xl border border-white/90 bg-white/75 px-3 py-3 shadow-sm backdrop-blur-sm transition hover:border-violet-200 hover:shadow-md sm:px-4 sm:py-3.5"
                >
                  <Icon className="h-4 w-4 text-violet-600" aria-hidden />
                  <p className="mt-2 text-xs font-semibold text-slate-800 sm:text-sm">{label}</p>
                  <p className="mt-0.5 text-[10px] text-slate-500 sm:text-[11px]">{desc}</p>
                </div>
              ))}
            </div>

            <div className="mt-6 hidden items-center gap-6 text-xs text-slate-400 lg:flex">
              <span className="inline-flex items-center gap-1">
                <BarChart3 className="h-3.5 w-3.5" />
                科学度量匹配效果
              </span>
              <span>·</span>
              <span>本地生活 · 探店种草 · 云剪直派</span>
            </div>
          </div>

          <div className="relative w-full shrink-0 lg:w-[min(100%,520px)] xl:w-[540px]">
            <div className="pointer-events-none absolute inset-0 overflow-hidden rounded-[28px]" aria-hidden>
              <div className="absolute -right-12 -top-16 h-48 w-48 rounded-full bg-violet-400/20 blur-3xl" />
              <div className="absolute -bottom-20 -left-8 h-56 w-56 rounded-full bg-cyan-400/20 blur-3xl" />
            </div>

            <div className={AUTH_SHELL}>
              <TalentLoginAuthPanel
                tab={tab}
                onTabChange={setTab}
                loginName={loginName}
                onLoginNameChange={setLoginName}
                password={password}
                onPasswordChange={setPassword}
                err={err}
                loading={loading}
                onPasswordLogin={onPasswordLogin}
                qrPayload={qrPayload}
                scanHint={scanHint}
                loginRole={loginRole}
                onLoginRoleChange={onLoginRoleChange}
                showDevPreview={import.meta.env.DEV}
                onDevPreview={onDevPreview}
              />

              <p className="mt-6 text-center text-[11px] leading-relaxed text-slate-500">
                登录即表示同意平台服务条款 · 与达人招募小程序账号体系互通
              </p>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
