import type { ReactNode } from 'react'
import { OPS_PAGE_HERO, type OpsPageHeroKey } from './opsPageHeroConfig'

type Props = {
  heroKey: OpsPageHeroKey
  title?: string
  description?: string
  badge?: string
  trailing?: ReactNode
}

export default function OpsPageHero({ heroKey, title, description, badge, trailing }: Props) {
  const meta = OPS_PAGE_HERO[heroKey]
  const displayTitle = title ?? meta.title
  const displayDesc = description ?? meta.description

  return (
    <div className="ops-page-hero overflow-hidden rounded-2xl border border-[var(--ops-border)] shadow-[var(--ops-card-shadow)]">
      <div className="relative min-h-[9.5rem]">
        <img
          src={meta.image}
          alt=""
          className="absolute inset-0 h-full w-full object-cover"
          loading="lazy"
          onError={(e) => {
            e.currentTarget.style.display = 'none'
          }}
        />
        <div
          className="absolute inset-0"
          style={{
            background: `linear-gradient(105deg, ${meta.accent}ee 0%, ${meta.accent}99 38%, transparent 72%)`,
          }}
        />
        <div className="relative flex min-h-[9.5rem] flex-col justify-end gap-2 px-6 py-5 sm:flex-row sm:items-end sm:justify-between">
          <div className="min-w-0 max-w-3xl">
            <div className="flex flex-wrap items-center gap-2">
              <h1 className="text-xl font-semibold tracking-tight text-white drop-shadow-sm">{displayTitle}</h1>
              {badge ? (
                <span className="rounded-md bg-white/20 px-2 py-0.5 text-[11px] font-medium text-white backdrop-blur-sm">
                  {badge}
                </span>
              ) : null}
            </div>
            <p className="mt-1.5 text-sm leading-relaxed text-white/90 drop-shadow-sm">{displayDesc}</p>
          </div>
          {trailing ? <div className="flex shrink-0 flex-wrap items-center gap-2">{trailing}</div> : null}
        </div>
      </div>
    </div>
  )
}
