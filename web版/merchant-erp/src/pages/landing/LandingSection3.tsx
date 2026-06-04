import { useState, type CSSProperties } from 'react'
import { BarChart3, Link2, Sparkles } from 'lucide-react'
import { cn } from '../../cn'
import type { LandingConfig } from './landingConfig'

const STEP_ICONS = [Link2, Sparkles, BarChart3] as const

type Props = {
  config: LandingConfig
}

export default function LandingSection3({ config }: Props) {
  const [active, setActive] = useState(0)
  const step = config.section3Steps[active]
  const Icon = STEP_ICONS[active]

  return (
    <section className="relative flex h-[100dvh] shrink-0 snap-start snap-always items-center overflow-hidden px-4 py-12 sm:px-8 lg:px-14">
      <div className="pointer-events-none absolute inset-0" aria-hidden>
        <div
          className="absolute inset-0"
          style={{
            background: `
              radial-gradient(ellipse 90% 70% at 0% 50%, rgba(34, 211, 238, 0.18), transparent 55%),
              radial-gradient(ellipse 70% 60% at 100% 20%, rgba(129, 140, 248, 0.2), transparent 50%),
              linear-gradient(165deg, #050810 0%, #0c1424 40%, #101828 100%)
            `,
          }}
        />
        <div
          className="absolute -left-32 top-1/4 h-[420px] w-[420px] rounded-full blur-[100px]"
          style={{ background: step.glow }}
        />
      </div>

      <div className="relative z-10 mx-auto grid w-full max-w-6xl grid-cols-1 items-center gap-10 lg:grid-cols-[minmax(0,0.95fr)_minmax(0,1.05fr)] lg:gap-14">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.2em] text-cyan-300/80">
            {config.section3Eyebrow}
          </p>
          <h2 className="mt-3 text-3xl font-extrabold leading-tight tracking-tight sm:text-4xl lg:text-[2.35rem]">
            <span className="text-white">简单高效</span>
            <br />
            <span className="bg-gradient-to-r from-cyan-300 via-blue-300 to-violet-300 bg-clip-text text-transparent">
              助推经营增长
            </span>
          </h2>
          <p className="mt-4 max-w-md text-sm leading-relaxed text-white/55">{config.section3Subtitle}</p>

          <ul className="mt-8 space-y-2">
            {config.section3Steps.map((s, i) => (
              <li key={s.n}>
                <button
                  type="button"
                  onClick={() => setActive(i)}
                  className={cn(
                    'flex w-full items-start gap-4 rounded-2xl border px-4 py-4 text-left transition-all duration-300',
                    active === i
                      ? 'border-white/20 bg-white/[0.08] shadow-[0_0_40px_-12px_var(--step-glow)]'
                      : 'border-transparent hover:bg-white/[0.04]',
                  )}
                  style={
                    active === i ? ({ '--step-glow': s.glow } as CSSProperties) : undefined
                  }
                >
                  <span
                    className={cn(
                      'flex h-11 w-11 shrink-0 items-center justify-center rounded-xl text-sm font-bold',
                      active === i ? 'text-white' : 'bg-white/5 text-white/50',
                    )}
                    style={
                      active === i
                        ? {
                            background: `linear-gradient(135deg, ${s.accent}, transparent)`,
                            boxShadow: `0 0 24px ${s.glow}`,
                          }
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
            boxShadow: `0 24px 80px -24px ${step.glow}`,
          }}
        >
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
          <div className="relative mt-8 h-1.5 overflow-hidden rounded-full bg-white/10">
            <div
              className="h-full rounded-full transition-all duration-500"
              style={{
                width: `${((active + 1) / config.section3Steps.length) * 100}%`,
                background: `linear-gradient(90deg, ${step.accent}, ${config.section3Steps[(active + 1) % config.section3Steps.length].accent})`,
              }}
            />
          </div>
        </div>
      </div>
    </section>
  )
}
