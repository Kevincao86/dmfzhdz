import type { ReactNode } from 'react'

type Props = {
  title: string
  subtitle?: string
  badge?: string
  /** 嵌入大厅工具栏卡片时去掉外层边框，避免双层卡片 */
  inset?: boolean
  /** 招募大厅工具栏栈：与 Tab、筛选栏无缝拼接 */
  stacked?: boolean
  children?: ReactNode
}

export default function PageHero({ title, subtitle, badge, inset = false, stacked = false, children }: Props) {
  const className = stacked
    ? 'page-hero page-hero--stacked'
    : inset
      ? 'page-hero page-hero--inset'
      : 'page-hero rounded-2xl border p-5 md:p-6'

  return (
    <header className={className}>
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div className="min-w-0">
          {badge ? <span className="page-hero-badge">{badge}</span> : null}
          <h2 className={`font-bold text-[var(--shell-text)] ${stacked ? 'text-lg md:text-xl' : 'text-xl md:text-2xl'}`}>{title}</h2>
          {subtitle ? (
            <p className={`text-sm text-[var(--shell-muted)] max-w-2xl leading-snug ${stacked ? 'mt-1' : 'mt-1.5 leading-relaxed'}`}>{subtitle}</p>
          ) : null}
        </div>
        {children ? <div className="shrink-0">{children}</div> : null}
      </div>
    </header>
  )
}
