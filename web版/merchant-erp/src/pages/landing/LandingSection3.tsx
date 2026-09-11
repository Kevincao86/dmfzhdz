import { useState } from 'react'
import { cn } from '../../cn'
import type { LandingConfig } from './landingConfig'

type Props = {
  config: LandingConfig
}

export default function LandingSection3({ config }: Props) {
  const [active, setActive] = useState(0)
  const step = config.section3Steps[active]

  return (
    <section className="relative flex h-[100dvh] shrink-0 snap-start snap-always items-center overflow-hidden bg-[#141210] px-4 py-12 sm:px-10 lg:px-14">
      <div className="relative z-10 mx-auto grid w-full max-w-6xl grid-cols-1 items-center gap-10 lg:grid-cols-[minmax(0,0.95fr)_minmax(0,1.05fr)] lg:gap-16">
        <div>
          <h2 className="lq-serif text-3xl font-semibold leading-tight text-[var(--lq-steam)] sm:text-4xl">
            简单高效
            <br />
            助推经营增长
          </h2>
          <p className="mt-4 max-w-md text-sm leading-relaxed text-white/55">{config.section3Subtitle}</p>

          <ul className="mt-8 space-y-1">
            {config.section3Steps.map((s, i) => (
              <li key={s.n}>
                <button
                  type="button"
                  onClick={() => setActive(i)}
                  className={cn(
                    'flex w-full items-baseline gap-4 border-b py-3.5 text-left',
                    active === i
                      ? 'border-[var(--lq-brass)] text-[var(--lq-steam)]'
                      : 'border-white/10 text-white/45 hover:text-white/70',
                  )}
                >
                  <span className="lq-serif w-8 shrink-0 text-sm text-[var(--lq-brass)]">{s.n}</span>
                  <span>
                    <span className="block text-[11px] text-white/40">{s.sub}</span>
                    <span className="mt-0.5 block font-medium">{s.title}</span>
                  </span>
                </button>
              </li>
            ))}
          </ul>
        </div>

        <div className="border border-[var(--lq-brass)]/30 bg-[var(--lq-steam)] p-6 text-[var(--lq-ink)] sm:p-8">
          <p className="text-[11px] tracking-[0.18em] text-[var(--lq-lacquer)]">{config.section3Eyebrow}</p>
          <h3 className="lq-serif mt-3 text-2xl sm:text-[1.7rem]">{step.title}</h3>
          <p className="mt-4 text-sm leading-relaxed text-stone-600">{step.desc}</p>
          <ul className="mt-6 space-y-2">
            {step.bullets.map((b) => (
              <li key={b} className="flex gap-2 text-sm text-stone-700">
                <span className="mt-[0.45em] h-1.5 w-1.5 shrink-0 bg-[var(--lq-lacquer)]" />
                {b}
              </li>
            ))}
          </ul>
        </div>
      </div>
    </section>
  )
}
