import { useCallback, useEffect, useRef, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { ChevronDown } from 'lucide-react'
import LoginPortalNav from '@merchant/components/login/LoginPortalNav'
import { cn } from '../cn'
import { getToken } from '../lib/mpSession'
import WorkIdentityToggle from '../components/WorkIdentityToggle'
import { getWorkIdentity, setWorkIdentity, type MpWorkIdentity } from '../lib/mpWorkIdentity'
import LandingHeroBackground from './landing/LandingHeroBackground'
import LandingRolePicker from './landing/LandingRolePicker'
import LandingSection3 from './landing/LandingSection3'
import {
  MARKETING_BY_ROLE,
  ROLE_LABEL,
  SECTION2_CARDS,
  SECTION4_STEPS,
} from './landing/landingCopy'

const SECTION_COUNT = 4

function scrollToSection(root: HTMLElement | null, index: number) {
  if (!root) return
  const h = root.clientHeight
  root.scrollTo({ top: index * h, behavior: 'smooth' })
}

export default function LandingPage() {
  const nav = useNavigate()
  const scrollerRef = useRef<HTMLDivElement>(null)
  const [activeSection, setActiveSection] = useState(0)
  const [role, setRole] = useState<MpWorkIdentity>(() => getWorkIdentity())
  const [loginPickerOpen, setLoginPickerOpen] = useState(false)

  useEffect(() => {
    if (getToken()) nav('/hall', { replace: true })
  }, [nav])

  const onScroll = useCallback(() => {
    const el = scrollerRef.current
    if (!el || el.clientHeight < 1) return
    const idx = Math.round(el.scrollTop / el.clientHeight)
    setActiveSection(Math.min(SECTION_COUNT - 1, Math.max(0, idx)))
  }, [])

  function onRoleChange(next: MpWorkIdentity) {
    setRole(next)
    setWorkIdentity(next)
  }

  function goLogin(picked: MpWorkIdentity) {
    setWorkIdentity(picked)
    setLoginPickerOpen(false)
    nav(`/login?role=${picked}`)
  }

  const m = MARKETING_BY_ROLE[role]

  return (
    <div className="h-[100dvh] overflow-hidden bg-[#0f0f14] text-white">
      <div
        ref={scrollerRef}
        onScroll={onScroll}
        className="h-full snap-y snap-mandatory overflow-y-auto scroll-smooth"
      >
        {/* —— 第 1 屏：全屏视频 + 右下营销/版本 —— */}
        <section className="relative h-[100dvh] w-full shrink-0 snap-start snap-always">
          <LandingHeroBackground />
          <div className="absolute inset-0 bg-gradient-to-t from-black/75 via-black/25 to-black/40" />

          <header className="relative z-20 flex items-center justify-between px-6 py-5 sm:px-10 lg:px-14">
            <div className="flex items-center gap-3">
              <img src="/logo.png" alt="灵祺" className="h-10 w-10 rounded-xl object-contain sm:h-11 sm:w-11" />
              <div>
                <p className="text-[10px] font-semibold uppercase tracking-[0.18em] text-white/50">
                  LingQi Talent Fulfillment
                </p>
                <p className="text-base font-bold sm:text-lg">灵祺星选平台</p>
              </div>
            </div>
            <div className="flex items-center gap-4 sm:gap-6">
              <LoginPortalNav
                linkClassName="text-white/70 hover:text-white"
                activeClassName="text-white"
              />
              <button
                type="button"
                onClick={() => setLoginPickerOpen(true)}
                className="rounded-full bg-white px-6 py-2 text-sm font-semibold text-slate-900 shadow-lg transition hover:bg-white/95"
              >
                登录
              </button>
            </div>
          </header>

          <div className="pointer-events-none absolute bottom-28 left-6 z-10 max-w-xl sm:left-10 lg:left-14 lg:bottom-32">
            <h1 className="text-4xl font-extrabold leading-tight tracking-tight sm:text-5xl lg:text-6xl">
              {m.headline}
              <br />
              <span className="text-white/95">好撮合成就好履约</span>
            </h1>
            <p className="mt-4 text-sm text-white/75 sm:text-base">{m.sub}</p>
            <p className="mt-2 font-serif text-2xl text-pink-300/90 italic sm:text-3xl">Good Fulfillment</p>
          </div>

          <div className="absolute bottom-8 right-6 z-20 w-[min(100%,340px)] sm:right-10 lg:right-14">
            <p className="mb-3 text-right text-xs text-white/60">{m.cta}</p>
            <WorkIdentityToggle
              identity={role}
              onChange={onRoleChange}
              variant="dark"
              className="border border-white/20 bg-black/35 backdrop-blur-md"
            />
            <button
              type="button"
              onClick={() => goLogin(role)}
              className="mt-3 w-full rounded-xl bg-gradient-to-r from-violet-600 to-cyan-500 py-3 text-sm font-semibold text-white shadow-lg transition hover:opacity-95"
            >
              以{ROLE_LABEL[role]}进入登录
            </button>
          </div>

          <button
            type="button"
            className="absolute bottom-6 left-1/2 z-10 flex -translate-x-1/2 flex-col items-center gap-1 text-xs text-white/70 transition hover:text-white"
            onClick={() => scrollToSection(scrollerRef.current, 1)}
          >
            滑动了解更多
            <ChevronDown className="h-4 w-4 animate-bounce" aria-hidden />
          </button>
        </section>

        {/* —— 第 2 屏：四卡 AI 能力 —— */}
        <section
          className="relative flex h-[100dvh] shrink-0 snap-start snap-always flex-col items-center justify-center px-4 py-16 sm:px-8"
          style={{
            background: `
              radial-gradient(ellipse 80% 60% at 20% 10%, rgba(186, 230, 253, 0.5), transparent),
              radial-gradient(ellipse 70% 50% at 90% 90%, rgba(233, 213, 255, 0.45), transparent),
              linear-gradient(180deg, #f8fafc 0%, #eef2ff 50%, #faf5ff 100%)
            `,
          }}
        >
          <h2 className="max-w-4xl text-center text-2xl font-extrabold text-slate-900 sm:text-4xl">
            达人影响力，就是
            <span className="relative inline-block">
              履约生产力
              <span
                className="absolute -bottom-1 left-0 right-0 h-2 rounded-full bg-gradient-to-r from-lime-400 to-teal-400 opacity-80"
                aria-hidden
              />
            </span>
          </h2>
          <p className="mt-3 max-w-2xl text-center text-sm text-slate-600 sm:text-base">
            与招募小程序同源数据 · AI 匹配置顶 · PR 智能荐达人 · 同城探店与云剪闭环
          </p>
          <div className="mt-10 grid w-full max-w-6xl grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4 lg:gap-5">
            {SECTION2_CARDS.map((card) => (
              <article
                key={card.title}
                className="flex flex-col overflow-hidden rounded-2xl border border-white/90 bg-white shadow-[0_12px_40px_-16px_rgba(15,23,42,0.15)] transition hover:-translate-y-0.5 hover:shadow-lg"
              >
                <div className="relative h-36 overflow-hidden bg-slate-100 sm:h-40">
                  <img src={card.img} alt="" className="h-full w-full object-cover" loading="lazy" />
                  <span className="absolute left-3 top-3 rounded-full bg-slate-900/75 px-2.5 py-0.5 text-[10px] font-semibold text-white">
                    {card.tag}
                  </span>
                </div>
                <div className="flex flex-1 flex-col p-4">
                  <h3 className="text-base font-bold text-slate-900">{card.title}</h3>
                  <p className="mt-2 text-xs leading-relaxed text-slate-600">{card.desc}</p>
                </div>
              </article>
            ))}
          </div>
        </section>

        <LandingSection3 />

        {/* —— 第 4 屏：达人资源 + 流程 —— */}
        <section className="relative flex h-[100dvh] shrink-0 snap-start snap-always items-center overflow-hidden px-4 py-12 sm:px-8 lg:px-12">
          <div
            className="pointer-events-none absolute inset-0"
            aria-hidden
            style={{
              background: 'linear-gradient(135deg, #12081f 0%, #1e0f33 50%, #0f172a 100%)',
            }}
          />
          <div className="relative z-10 mx-auto grid w-full max-w-6xl grid-cols-1 gap-8 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.4fr)] lg:items-center">
            <div>
              <h2 className="text-2xl font-extrabold leading-snug sm:text-3xl">
                灵祺星选平台
                <br />
                <span className="bg-gradient-to-r from-pink-400 via-violet-400 to-cyan-400 bg-clip-text text-transparent">
                  助推营销增长
                </span>
              </h2>
              <ul className="mt-8 space-y-4">
                {SECTION4_STEPS.map((s) => (
                  <li
                    key={s.n}
                    className={cn(
                      'flex items-center gap-3 text-sm',
                      s.active ? 'text-white' : 'text-white/40',
                    )}
                  >
                    <span
                      className={cn(
                        'flex h-8 w-8 shrink-0 items-center justify-center rounded-full border text-xs font-bold',
                        s.active
                          ? 'border-pink-400 bg-pink-500/20 text-pink-200'
                          : 'border-white/20',
                      )}
                    >
                      {s.n}
                    </span>
                    {s.title}
                  </li>
                ))}
              </ul>
              <button
                type="button"
                onClick={() => setLoginPickerOpen(true)}
                className="mt-8 rounded-full bg-white px-8 py-2.5 text-sm font-semibold text-slate-900 hover:bg-white/90"
              >
                立即登录
              </button>
            </div>
            <div className="overflow-hidden rounded-3xl border border-white/10 bg-black/30 p-4 shadow-2xl backdrop-blur-sm sm:p-6">
              <h3 className="text-lg font-bold">活跃的达人供给</h3>
              <p className="mt-2 text-sm text-white/65">
                覆盖美妆、本地生活、数码、剧情等多垂类；AI 根据资料与招募要求双向匹配。
              </p>
              <img
                src="/landing/section-talents.png"
                alt="达人资源示意"
                className="mt-4 w-full rounded-2xl object-cover"
                loading="lazy"
              />
              <div className="mt-4 flex flex-wrap gap-2">
                {['#AI 置顶', '#同城探店', '#云剪直派', '#群码协同'].map((tag) => (
                  <span
                    key={tag}
                    className="rounded-full border border-white/15 bg-white/5 px-3 py-1 text-xs text-white/80"
                  >
                    {tag}
                  </span>
                ))}
              </div>
            </div>
          </div>
        </section>
      </div>

      <nav
        className="fixed right-4 top-1/2 z-30 flex -translate-y-1/2 flex-col gap-2 sm:right-6"
        aria-label="页面导航"
      >
        {Array.from({ length: SECTION_COUNT }, (_, i) => (
          <button
            key={i}
            type="button"
            aria-label={`第 ${i + 1} 屏`}
            aria-current={activeSection === i ? 'true' : undefined}
            onClick={() => scrollToSection(scrollerRef.current, i)}
            className={cn(
              'h-2.5 w-2.5 rounded-full transition-all',
              activeSection === i ? 'scale-125 bg-cyan-400' : 'bg-white/35 hover:bg-white/60',
            )}
          />
        ))}
      </nav>

      <LandingRolePicker
        open={loginPickerOpen}
        onClose={() => setLoginPickerOpen(false)}
        onPick={goLogin}
      />
    </div>
  )
}
