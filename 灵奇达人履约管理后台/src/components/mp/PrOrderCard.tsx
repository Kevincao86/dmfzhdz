import type { ReactNode } from 'react'
import { Briefcase, MapPin, Share2, Wallet } from 'lucide-react'

type Props = {
  cover?: string
  title: string
  region: string
  category: string
  recruitTarget: string
  budgetText: string
  orderNo: string
  publishedAt: string
  tags: string[]
  statusLabel: string
  recruiting: boolean
  applicantCount: number
  viewCount?: number
  favoriteCount?: number
  actions: ReactNode
  dimmed?: boolean
}

function statusTone(label: string, recruiting: boolean): 'active' | 'stopped' | 'deleted' | 'muted' {
  if (label === '已删除') return 'deleted'
  if (!recruiting || label === '已停止' || label === '已截止') return 'stopped'
  if (label === '招募中' || label === '收集中') return 'active'
  return 'muted'
}

export default function PrOrderCard({
  cover,
  title,
  region,
  category,
  recruitTarget,
  budgetText,
  orderNo,
  publishedAt,
  tags,
  statusLabel,
  recruiting,
  applicantCount,
  viewCount = 0,
  favoriteCount = 0,
  actions,
  dimmed,
}: Props) {
  const tone = statusTone(statusLabel, recruiting)

  return (
    <article className={`pr-order-card surface-card${dimmed ? ' pr-order-card--dim' : ''}`}>
      <div className="pr-order-card__cover">
        {cover ? (
          <img src={cover} alt="" className="pr-order-card__img" />
        ) : (
          <div className="pr-order-card__img-ph" aria-hidden>
            📋
          </div>
        )}
      </div>

      <div className="pr-order-card__main">
        <h3 className="pr-order-card__title">{title}</h3>
        <div className="pr-order-card__meta-row">
          <span>
            <MapPin size={14} aria-hidden />
            {region || '全国'}
          </span>
          <span>
            <Briefcase size={14} aria-hidden />
            {recruitTarget}
          </span>
          <span>
            <Wallet size={14} aria-hidden />
            {budgetText || '面议'}
          </span>
        </div>
        <p className="pr-order-card__sys">
          编号 {orderNo}
          {publishedAt ? ` · 发布时间 ${publishedAt}` : null}
        </p>
        {tags.length ? (
          <div className="pr-order-card__tags">
            {tags.map((tag) => (
              <span key={tag} className="pr-order-card__tag">
                {tag}
              </span>
            ))}
          </div>
        ) : null}
      </div>

      <div className="pr-order-card__side">
        <span className={`pr-order-card__status pr-order-card__status--${tone}`}>{statusLabel}</span>
        <div className="pr-order-card__stats">
          <span>报名 {applicantCount}</span>
          <span>浏览 {viewCount}</span>
          <span>收藏 {favoriteCount}</span>
        </div>
        <div className="pr-order-card__actions">{actions}</div>
      </div>
    </article>
  )
}

export function PrOrderActionBtn({
  children,
  onClick,
  disabled,
  danger,
  primary,
  icon,
}: {
  children: ReactNode
  onClick?: () => void
  disabled?: boolean
  danger?: boolean
  primary?: boolean
  icon?: ReactNode
}) {
  const cls = [
    'pr-order-action',
    primary ? 'pr-order-action--primary' : '',
    danger ? 'pr-order-action--danger' : '',
  ]
    .filter(Boolean)
    .join(' ')
  return (
    <button type="button" className={cls} disabled={disabled} onClick={onClick}>
      {icon}
      {children}
    </button>
  )
}

export function PrOrderShareBtn({
  children,
  onClick,
  disabled,
}: {
  children: ReactNode
  onClick?: () => void
  disabled?: boolean
}) {
  return (
    <button type="button" className="pr-order-action" disabled={disabled} onClick={onClick}>
      <Share2 size={14} aria-hidden />
      {children}
    </button>
  )
}
