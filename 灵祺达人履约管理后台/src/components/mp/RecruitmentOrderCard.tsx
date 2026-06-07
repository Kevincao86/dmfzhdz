import type { RecruitmentOrderRow } from '../../lib/mpRecruitment/types'
import MatchScoreBadge from '../ui/MatchScoreBadge'

const TONE_CLASS: Record<string, string> = {
  match: 'order-tag--match',
  urgent: 'order-tag--urgent',
  ice: 'order-tag--ice',
  hot: 'order-tag--hot',
  budget: 'order-tag--budget',
  niche: 'order-tag--niche',
  default: 'order-tag--default',
}

type Props = {
  row: RecruitmentOrderRow
  onClick?: () => void
  showMatchScore?: boolean
}

export default function RecruitmentOrderCard({ row, onClick, showMatchScore = false }: Props) {
  const tagTone = TONE_CLASS[row.aiTagTone || 'default'] || TONE_CLASS.default
  return (
    <article
      role={onClick ? 'button' : undefined}
      tabIndex={onClick ? 0 : undefined}
      onClick={onClick}
      onKeyDown={(e) => e.key === 'Enter' && onClick?.()}
      className={`order-card rounded-xl p-4 text-left w-full relative ${onClick ? 'order-card--clickable' : ''}`}
    >
      {showMatchScore && row.matchScore ? (
        <MatchScoreBadge score={row.matchScore} className="absolute top-3 right-3" />
      ) : null}
      {row.aiTag ? (
        <span className={`order-tag ${tagTone}`}>{row.aiTag}</span>
      ) : row.isMock ? (
        <span className="order-tag order-tag--default">演示</span>
      ) : row.recommended ? (
        <span className="order-tag order-tag--match">推荐</span>
      ) : null}
      <h3 className="font-semibold text-[15px] leading-snug pr-2 text-[var(--shell-text)]">{row.title}</h3>
      <div className="flex flex-wrap gap-1.5 mt-2">
        {row.overRecruitHot ? (
          <span className="order-chip order-chip--urgent">爆满</span>
        ) : null}
        <span className="order-chip order-chip--status">{row.statusLabel}</span>
        <span className="order-chip order-chip--meta">
          报名{row.applicantCount}/{row.recruitCount}
        </span>
        {row.urgent ? (
          <span className="order-chip order-chip--urgent">急单</span>
        ) : row.isIce ? (
          <span className="order-chip order-chip--ice">云剪</span>
        ) : null}
      </div>
      {!row.hideBudget && row.budgetDisplay.kind === 'text' ? (
        <p className="order-price">{row.budgetDisplay.line}</p>
      ) : null}
      <p className="order-meta">
        {row.region} · {row.platform} · {row.merchantName}
      </p>
    </article>
  )
}
