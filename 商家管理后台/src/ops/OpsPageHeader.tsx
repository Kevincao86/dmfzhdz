type Props = {
  title: string
  description?: string
  badge?: string
}

export default function OpsPageHeader({ title, description, badge }: Props) {
  return (
    <div className="flex flex-wrap items-start justify-between gap-3">
      <div className="min-w-0">
        <div className="flex flex-wrap items-center gap-2">
          <h1 className="ops-page-title text-xl font-semibold tracking-tight">{title}</h1>
          {badge ? (
            <span className="ops-badge rounded-md px-2 py-0.5 text-[11px] font-medium">{badge}</span>
          ) : null}
        </div>
        {description ? <p className="ops-muted mt-1 max-w-3xl text-sm leading-relaxed">{description}</p> : null}
      </div>
    </div>
  )
}
