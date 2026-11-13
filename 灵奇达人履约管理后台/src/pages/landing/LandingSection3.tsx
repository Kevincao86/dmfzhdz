import { useState, type CSSProperties } from 'react'
import { BarChart3, ClipboardList, Sparkles } from 'lucide-react'
import { cn } from '../../cn'
import { SECTION3_STEPS } from './landingCopy'

const STEP_ICONS = [Sparkles, ClipboardList, BarChart3] as const

export default function LandingSection3() {
  const [active, setActive] = useState(0)
  const step = SECTION3_STEPS[active]
  const Icon = STEP_ICONS[active]

  return (
    <section className="relative flex h-[100dvh] shrink-0 snap-start snap-always items-center overflow-hidden px-4 py-12 sm:px-8 lg:px-14">
      <div className="pointer-events-none absolute inset-0" aria-hidden>
        <div
          className="absolute inset-0"
          style={{
            background: `
              radial-gradient(ellipse 90% 70% at 0% 50%, rgba(139, 92, 246, 0.22), transparent 55%),
              radial-gradient(ellipse 70% 60% at 100% 20%, rgba(236, 72, 153, 0.18), transparent 50%),
              radial-gradient(ellipse 50% 40% at 50% 100%, rgba(34, 211, 238, 0.12), transparent 45%),
              linear-gradient(165deg, #07050f 0%, #120a22 40%, #1a0f2e 100%)
            `,
          }}
        />
        <div
          className="absolute -left-32 top-1/4 h-[420px] w-[420px] rounded-full blur-[100px]"
          style={{ background: step.glow }}
        />
        <div
          className="absolute -right-24 bottom-1/4 h-[360px] w-[360px] rounded-full blur-[90px] opacity-60"
          style={{ background: 'rgba(99, 102, 241, 0.25)' }}
        />
      </div>

      <div className="relative z-10 mx-auto grid w-full max-w-6xl grid-cols-1 items-center gap-10 lg:grid-cols-[minmax(0,0.95fr)_minmax(0,1.05fr)] lg:gap-14">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.2em] text-violet-300/80">LingQi · AI Fulfillment</p>
          <h2 className="mt-3 text-3xl font-extrabold leading-tight tracking-tight sm:text-4xl lg:text-[2.35rem]">
            <span className="text-white">简单高效</span>
            <br />
            <span className="bg-gradient-to-r from-pink-300 via-violet-300 to-cyan-300 bg-clip-text text-transparent">
              助推履约增长
            </span>
          </h2>
          <p className="mt-4 max-w-md text-sm leading-relaxed text-white/55">
            三步走通从找单、协同到复盘，与达人招募小程序能力一一对应。
          </p>

          <ul className="mt-8 space-y-2">
            {SECTION3_STEPS.map((s, i) => (
              <li key={s.n}>
                <button
                  type="button"
                  onClick={() => setActive(i)}
                  className={cn(
                    'flex w-full items-start gap-4 rounded-2xl border px-4 py-4 text-left transition-all duration-300',
                    active === i
                      ? 'border-white/20 bg-white/[0.08] shadow-[0_0_40px_-12px_var(--step-glow)]'
                      : 'border-transparent bg-transparent hover:bg-white/[0.04]',
                  )}
                  style={
                    active === i
                      ? ({ '--step-glow': s.glow } as CSSProperties)
                      : undefined
                  }
                >
                  <span
                    className={cn(
                      'flex h-11 w-11 shrink-0 items-center justify-center rounded-xl text-sm font-bold transition-colors',
                      active === i ? 'text-white' : 'bg-white/5 text-white/50',
                    )}
                    style={
                      active === i
                        ? { background: `linear-gradient(135deg, ${s.accent}, transparent)`, boxShadow: `0 0 24px ${s.glow}` }
                        : undefined
                    }
                  >
                    {s.n}
                  </span>
                  <div className="min-w-0 pt-0.5">
                    <p className={cn('text-xs', active === i ? 'text-white/70' : 'text-white/40')}>{s.sub}</p>
                    <p className={cn('mt-1 font-semibold', active === i ? 'text-white' : 'text-white/55')}>
                      {s.title}
                    </p>
                  </div>
                </button>
              </li>
            ))}
          </ul>
        </div>

        <div
          className="relative overflow-hidden rounded-3xl border border-white/10 p-6 sm:p-8"
          style={{
            background: 'linear-gradient(145deg, rgba(255,255,255,0.06) 0%, rgba(255,255,255,0.02) 100%)',
            boxShadow: `0 24px 80px -24px ${step.glow}, inset 0 1px 0 rgba(255,255,255,0.08)`,
          }}
        >
          <div
            className="pointer-events-none absolute -right-8 -top-8 h-32 w-32 rounded-full blur-2xl"
            style={{ background: step.glow }}
            aria-hidden
          />

          <div className="relative flex items-start gap-4">
            <div
              className="flex h-14 w-14 shrink-0 items-center justify-center rounded-2xl"
              style={{
                background: `linear-gradient(135deg, ${step.accent}33, transparent)`,
                border: `1px solid ${step.accent}44`,
              }}
            >
              <Icon className="h-7 w-7" style={{ color: step.accent }} aria-hidden />
            </div>
            <div>
              <span
                className="inline-block rounded-full px-2.5 py-0.5 text-[10px] font-bold uppercase tracking-wider"
                style={{ background: `${step.accent}22`, color: step.accent }}
              >
                Step {step.n}
              </span>
              <h3 className="mt-2 text-xl font-bold sm:text-2xl">{step.title}</h3>
            </div>
          </div>

          <p className="relative mt-5 text-sm leading-relaxed text-white/70">{step.desc}</p>

          <div className="relative mt-6 flex flex-wrap gap-2">
            {step.bullets.map((b) => (
              <span
                key={b}
                className="rounded-full border px-3 py-1.5 text-xs font-medium text-white/85"
                style={{ borderColor: `${step.accent}55`, background: `${step.accent}18` }}
              >
                {b}
              </span>
            ))}
          </div>

          <div className="relative mt-8 grid grid-cols-3 gap-3 border-t border-white/10 pt-6">
            {[
              { label: '本周活跃商单', value: '180+' },
              { label: 'AI 匹配均分', value: '92' },
              { label: '履约完成率', value: '96%' },
            ].map((stat) => (
              <div key={stat.label} className="text-center sm:text-left">
                <p className="text-lg font-bold tabular-nums sm:text-xl">{stat.value}</p>
                <p className="mt-0.5 text-[10px] text-white/45 sm:text-xs">{stat.label}</p>
              </div>
            ))}
          </div>

          <div className="relative mt-6 h-1.5 overflow-hidden rounded-full bg-white/10">
            <div
              className="h-full rounded-full transition-all duration-500 ease-out"
              style={{
                width: `${((active + 1) / SECTION3_STEPS.length) * 100}%`,
                background: `linear-gradient(90deg, ${step.accent}, ${SECTION3_STEPS[(active + 1) % 3].accent})`,
              }}
            />
          </div>
        </div>
      </div>
    </section>
  )
}
