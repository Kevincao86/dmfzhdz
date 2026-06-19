import { Lock } from 'lucide-react'

type Props = {
  title: string
  desc: string
  bullets?: string[]
}

export default function PrFeatureLocked({ title, desc, bullets = [] }: Props) {
  return (
    <div className="mx-auto flex min-h-[420px] max-w-xl flex-col items-center justify-center px-4 py-16 text-center">
      <div className="mb-5 flex h-16 w-16 items-center justify-center rounded-2xl bg-violet-100 text-violet-600 dark:bg-violet-950/50 dark:text-violet-300">
        <Lock className="h-8 w-8" aria-hidden />
      </div>
      <h1 className="text-xl font-bold text-[var(--shell-text)]">{title}</h1>
      <p className="mt-3 text-sm leading-relaxed text-[var(--shell-muted)]">{desc}</p>
      <p className="mt-2 text-sm text-[var(--shell-muted)]">如有合作意向请联系灵祺运营申请开通。</p>
      {bullets.length ? (
        <div className="mt-8 rounded-xl border border-dashed border-[var(--shell-border)] bg-[var(--panel-card)] px-5 py-4 text-left text-xs text-[var(--shell-muted)]">
          <p className="font-medium text-[var(--shell-text)]">包含能力</p>
          <ul className="mt-2 list-inside list-disc space-y-1">
            {bullets.map((b) => (
              <li key={b}>{b}</li>
            ))}
          </ul>
        </div>
      ) : null}
    </div>
  )
}
