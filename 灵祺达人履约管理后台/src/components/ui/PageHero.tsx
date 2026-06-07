import type { ReactNode } from 'react'

type Props = {
  title: string
  subtitle?: string
  badge?: string
  children?: ReactNode
}

export default function PageHero({ title, subtitle, badge, children }: Props) {
  return (
    <header className="page-hero rounded-2xl border p-5 md:p-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          {badge ? <span className="page-hero-badge">{badge}</span> : null}
          <h2 className="text-xl md:text-2xl font-bold text-[var(--shell-text)]">{title}</h2>
          {subtitle ? (
            <p className="text-sm text-[var(--shell-muted)] mt-1.5 max-w-2xl leading-relaxed">{subtitle}</p>
          ) : null}
        </div>
        {children ? <div className="shrink-0">{children}</div> : null}
      </div>
    </header>
  )
}
