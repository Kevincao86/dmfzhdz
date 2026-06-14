import { useState, type MouseEvent } from 'react'
import { Star } from 'lucide-react'
import { resolveHallAiTagStyle } from '@merchant/lib/hallAiTagStyle'
import type { RecruitmentOrderRow } from '../../lib/mpRecruitment/types'
import { SIGNUP_COUNTDOWN_TONE_CLASS, formatSignupDeadlineLine } from '../../lib/mpRecruitment/listFilters'
import { platformIconClass } from '../../lib/mpRecruitment/hallFilters'
import { isOrderFavorited, toggleOrderFavorite } from '../../lib/mpSync/orderFavorites'
import { formatHallBudgetAmount } from '../../lib/mpSync/recruitmentBudgetDisplay'
import MatchScoreBadge from '../ui/MatchScoreBadge'

type Props = {
  row: RecruitmentOrderRow
  onClick?: () => void
  showMatchScore?: boolean
  coverUrl?: string
  /** 招募大厅稿对齐卡片 */
  variant?: 'default' | 'hall'
}

function hallDisplayTitle(row: RecruitmentOrderRow): string {
  const cat = String(row.category || '').trim()
  const title = String(row.title || '').trim()
  if (!cat || title.includes(`【${cat}】`) || title.startsWith('【')) return title
  return `【${cat}】${title}`
}

function hallBudgetAmount(row: RecruitmentOrderRow): string {
  return formatHallBudgetAmount(row)
}

function HallOrderCard({
  row,
  onClick,
  coverUrl,
}: {
  row: RecruitmentOrderRow
  onClick?: () => void
  coverUrl?: string
}) {
  const cover = coverUrl || (row as { coverImage?: string }).coverImage
  const [favorited, setFavorited] = useState(() => isOrderFavorited(row.id))
  const platform = String(row.platform || '抖音').trim()
  const platformClass = platformIconClass(platform)

  function onFavorite(e: MouseEvent) {
    e.stopPropagation()
    setFavorited(toggleOrderFavorite(row.id))
  }

  function onDetail(e: MouseEvent) {
    e.stopPropagation()
    onClick?.()
  }

  return (
    <article className="hall-order-card">
      <div className="hall-order-card__cover">
        {cover ? (
          <img src={cover} alt="" />
        ) : (
          <div className="hall-order-card__cover-ph">📋</div>
        )}
      </div>

      <div className="hall-order-card__main">
        <span className="hall-order-card__status">{row.statusLabel || '招募中'}</span>
        <h3 className="hall-order-card__title">{hallDisplayTitle(row)}</h3>
        <div className="hall-order-card__budget-row">
          <span className="hall-order-card__budget">{hallBudgetAmount(row)}</span>
          {!row.hideBudget ? <span className="hall-order-card__budget-label">预算</span> : null}
        </div>
        <div className="hall-order-card__platform">
          <span className={`hall-platform-icon ${platformClass}`} aria-hidden />
          <span>{platform}</span>
        </div>
        <p className="hall-order-card__deadline">{formatSignupDeadlineLine(row.deadlineMs)}</p>
      </div>

      <div className="hall-order-card__actions">
        <button type="button" className="hall-order-card__fav" onClick={onFavorite} aria-pressed={favorited}>
          <Star size={16} strokeWidth={2} fill={favorited ? 'currentColor' : 'none'} />
          <span>收藏</span>
        </button>
        <button type="button" className="hall-order-card__detail" onClick={onDetail}>
          查看详情
        </button>
      </div>
    </article>
  )
}

export default function RecruitmentOrderCard({
  row,
  onClick,
  showMatchScore = false,
  coverUrl,
  variant = 'default',
}: Props) {
  if (variant === 'hall') {
    return <HallOrderCard row={row} onClick={onClick} coverUrl={coverUrl} />
  }

  const tagStyle = row.aiTag
    ? resolveHallAiTagStyle(row.aiTag, row.aiTagTone || 'default')
    : null
  const countdownTone =
    SIGNUP_COUNTDOWN_TONE_CLASS[row.signupCountdownTone || 'unknown'] ||
    SIGNUP_COUNTDOWN_TONE_CLASS.unknown
  const cover = coverUrl || (row as { coverImage?: string }).coverImage

  return (
    <article
      role={onClick ? 'button' : undefined}
      tabIndex={onClick ? 0 : undefined}
      onClick={onClick}
      onKeyDown={(e) => e.key === 'Enter' && onClick?.()}
      className={`order-card order-card-horizontal rounded-xl text-left w-full relative ${onClick ? 'order-card--clickable' : ''}`}
    >
      <div className="order-card-horizontal__cover">
        {cover ? (
          <img src={cover} alt="" />
        ) : (
          <div className="list-card-horizontal__placeholder" style={{ width: '100%', height: '100%', minHeight: '5.5rem' }}>
            📋
          </div>
        )}
      </div>
      <div className="order-card-horizontal__body">
        {showMatchScore && row.matchScore ? (
          <MatchScoreBadge score={row.matchScore} className="absolute top-3 right-3" />
        ) : null}
        {row.aiTag && tagStyle ? (
          <span className="order-tag" style={{ background: tagStyle.bg, color: tagStyle.fg }}>
            {row.aiTag}
          </span>
        ) : row.isMock ? (
          <span className="order-tag order-tag--default">演示</span>
        ) : row.recommended ? (
          <span className="order-tag order-tag--match">推荐</span>
        ) : null}
        <h3 className="font-semibold text-[15px] leading-snug pr-2 text-[var(--shell-text)]">{row.title}</h3>
        <div className="flex flex-wrap gap-1.5 mt-2">
          {row.iceSlotsFull ? (
            <span className="order-chip order-chip--status">已收满</span>
          ) : row.overRecruitHot ? (
            <span className="order-chip order-chip--urgent">爆满</span>
          ) : null}
          <span className="order-chip order-chip--status">{row.statusLabel}</span>
          <span className="order-chip order-chip--meta">
            {row.signupCountText || `报名${row.applicantCount}/${row.recruitCount}`}
          </span>
          {row.urgent ? (
            <span className="order-chip order-chip--urgent">急单</span>
          ) : row.isIce ? (
            <span className="order-chip order-chip--ice">云剪</span>
          ) : null}
        </div>
        <p className={`hall-order-countdown ${countdownTone}`}>
          报名倒计时 {row.signupCountdownText || '—'}
        </p>
        {!row.hideBudget && row.budgetDisplay.kind === 'text' ? (
          <p className="order-price">{row.budgetDisplay.line}</p>
        ) : null}
        <p className="order-meta">
          {row.region} · {row.platform} · {row.categoryTagsText || '—'}
        </p>
      </div>
    </article>
  )
}
