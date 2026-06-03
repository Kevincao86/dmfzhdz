import type { RecruitmentOrderRow } from '../../lib/mpRecruitment/types'

const TONE_CLASS: Record<string, string> = {
  match: 'bg-violet-500/20 text-violet-300',
  urgent: 'bg-orange-500/20 text-orange-300',
  ice: 'bg-cyan-500/20 text-cyan-300',
  hot: 'bg-rose-500/20 text-rose-300',
  budget: 'bg-amber-500/20 text-amber-300',
  niche: 'bg-slate-500/20 text-slate-300',
  default: 'bg-white/10 text-slate-400',
}

type Props = {
  row: RecruitmentOrderRow
  onClick?: () => void
}

export default function RecruitmentOrderCard({ row, onClick }: Props) {
  const tagClass = TONE_CLASS[row.aiTagTone || 'default'] || TONE_CLASS.default
  return (
    <article
      role={onClick ? 'button' : undefined}
      tabIndex={onClick ? 0 : undefined}
      onClick={onClick}
      onKeyDown={(e) => e.key === 'Enter' && onClick?.()}
      className={`rounded-xl border border-white/10 bg-[#1a1a28] p-4 text-left w-full transition-colors ${
        onClick ? 'hover:border-violet-500/40 cursor-pointer' : ''
      }`}
    >
      {row.aiTag ? (
        <span className={`inline-block text-xs px-2 py-0.5 rounded-full mb-2 ${tagClass}`}>{row.aiTag}</span>
      ) : row.isMock ? (
        <span className="inline-block text-xs px-2 py-0.5 rounded-full mb-2 bg-white/10 text-slate-400">演示</span>
      ) : row.recommended ? (
        <span className="inline-block text-xs px-2 py-0.5 rounded-full mb-2 bg-violet-500/20 text-violet-300">推荐</span>
      ) : null}
      <h3 className="font-semibold text-[15px] leading-snug pr-2">{row.title}</h3>
      <div className="flex flex-wrap gap-1.5 mt-2 text-xs">
        {row.overRecruitHot ? (
          <span className="px-1.5 py-0.5 rounded bg-orange-500/20 text-orange-300">爆满</span>
        ) : null}
        <span className="px-1.5 py-0.5 rounded bg-violet-500/15 text-violet-300">{row.statusLabel}</span>
        <span className="px-1.5 py-0.5 rounded bg-white/5 text-slate-400">
          报名{row.applicantCount}/{row.recruitCount}
        </span>
        {row.urgent ? (
          <span className="px-1.5 py-0.5 rounded bg-orange-500/20 text-orange-300">急单</span>
        ) : row.isIce ? (
          <span className="px-1.5 py-0.5 rounded bg-cyan-500/20 text-cyan-300">云剪</span>
        ) : null}
      </div>
      {!row.hideBudget && row.budgetDisplay.kind === 'text' ? (
        <p className="text-amber-400 font-semibold mt-2 text-sm">{row.budgetDisplay.line}</p>
      ) : null}
      <p className="text-xs text-slate-500 mt-2">
        {row.region} · {row.platform} · {row.merchantName}
      </p>
    </article>
  )
}
