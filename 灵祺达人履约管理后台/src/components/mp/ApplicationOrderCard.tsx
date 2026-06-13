import { Link } from 'react-router-dom'
import type { ReactNode } from 'react'
import { Calendar, MapPin } from 'lucide-react'
import type { ApplicationDisplayTone } from '../../lib/mpRecruitment/talentApplicationStatus'

type Props = {
  title: string
  coverUrl?: string
  region?: string
  scheduleText?: string
  statusLabel: string
  statusTone: ApplicationDisplayTone
  appliedAt?: string
  detailHref: string
  confirmLabel?: string
  confirmHref?: string
  extraAction?: ReactNode
}

function formatAppliedAt(raw?: string): string {
  const t = String(raw || '').trim()
  if (!t) return '—'
  if (/^\d{4}-\d{2}-\d{2}/.test(t)) return t.replace('T', ' ').slice(0, 16)
  return t
}

export default function ApplicationOrderCard({
  title,
  coverUrl,
  region,
  scheduleText,
  statusLabel,
  statusTone,
  appliedAt,
  detailHref,
  confirmLabel,
  confirmHref,
  extraAction,
}: Props) {
  return (
    <article className="app-order-card">
      <div className="app-order-card__cover">
        {coverUrl ? (
          <img src={coverUrl} alt="" />
        ) : (
          <span className="app-order-card__cover-ph" aria-hidden>
            📋
          </span>
        )}
      </div>

      <div className="app-order-card__body">
        <div className="app-order-card__head">
          <h3 className="app-order-card__title">{title}</h3>
          <span className={`app-order-card__status app-order-card__status--${statusTone}`}>
            {statusLabel}
          </span>
        </div>
        <p className="app-order-card__meta">
          <MapPin size={14} strokeWidth={2} aria-hidden />
          {region || '地点待定'}
        </p>
        <p className="app-order-card__meta">
          <Calendar size={14} strokeWidth={2} aria-hidden />
          {scheduleText || '档期协商中'}
        </p>
      </div>

      <div className="app-order-card__actions">
        <Link to={detailHref} className="app-order-card__btn app-order-card__btn--outline">
          查看详情
        </Link>
        {confirmLabel && confirmHref ? (
          <Link to={confirmHref} className="app-order-card__btn app-order-card__btn--primary">
            {confirmLabel}
          </Link>
        ) : null}
        {extraAction}
        <p className="app-order-card__applied">报名时间: {formatAppliedAt(appliedAt)}</p>
      </div>
    </article>
  )
}
