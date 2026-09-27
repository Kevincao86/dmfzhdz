import { ExternalLink } from 'lucide-react'
import { PLATFORM_VIDEO_REVIEW_RULE_GROUPS } from '../lib/platformVideoReviewRuleLinks'

export default function PlatformVideoReviewRulesPage() {
  return (
    <div className="mx-auto max-w-3xl space-y-6 p-4 sm:p-6">
      <header className="space-y-1">
        <h1 className="text-xl font-semibold text-[var(--shell-fg)]">平台视频审核规则</h1>
        <p className="text-sm text-[var(--shell-muted)]">
          按平台查看官方公开规则。点击条目会打开原网页。
        </p>
      </header>
      {PLATFORM_VIDEO_REVIEW_RULE_GROUPS.map((group) => (
        <section
          key={group.platform}
          className="surface-card space-y-3 rounded-xl border p-4"
        >
          <h2 className="text-base font-semibold text-[var(--shell-fg)]">{group.platform}</h2>
          <ul className="space-y-2">
            {group.links.map((item) => (
              <li key={item.url}>
                <a
                  href={item.url}
                  target="_blank"
                  rel="noreferrer"
                  className="flex items-center justify-between gap-3 rounded-lg border border-[var(--shell-border)] px-3 py-2.5 text-sm text-[var(--shell-fg)] hover:bg-[var(--shell-hover)]"
                >
                  <span>{item.title}</span>
                  <ExternalLink className="h-4 w-4 shrink-0 text-[var(--shell-muted)]" />
                </a>
              </li>
            ))}
          </ul>
        </section>
      ))}
    </div>
  )
}
